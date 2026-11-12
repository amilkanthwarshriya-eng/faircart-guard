import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../db';
import { conflict, notFound } from '../../utils/errors';
import { Money } from '../../utils/money';
import type { CreateQuoteInput, PatchQuoteInput, UploadQuoteInput } from '../../schemas/quotes';
import { invalidateIfStale } from './approval';
import { quoteInclude, toQuoteDto, type QuoteFull } from './dto';
import { parseStringArray, toQuoteRecord } from './mappers';
import { prismaApprovalTx } from './prismaApprovalStore';
import { removeStoredFile, storePdf, type StoredFile } from './fileStorage';
import { totalsFor } from './rules';
import { LOCKED_REQUEST_STATUSES } from './types';

/** Fields whose change alters price, delivery, validity, specs or review state => analysis + approval are stale. */
const MATERIAL_KEYS = [
  'product', 'quantity', 'unitPrice', 'lineItems', 'subtotal', 'tax', 'shipping', 'otherFees', 'otherFeesDescription', 'discount',
  'statedTotal', 'deliveryDays', 'deliveryDate', 'validUntil', 'paymentTerms', 'specConfirmations', 'uncertainties', 'markReviewed',
] as const;
const REVIEWABLE_KEYS = MATERIAL_KEYS.filter((k) => k !== 'markReviewed');

type ScalarInput = Partial<CreateQuoteInput> & Partial<PatchQuoteInput>;

function scalarData(input: ScalarInput): Prisma.QuoteUncheckedUpdateInput {
  const d: Prisma.QuoteUncheckedUpdateInput = {};
  const copy = <K extends keyof Prisma.QuoteUncheckedUpdateInput>(k: K, v: Prisma.QuoteUncheckedUpdateInput[K] | undefined) => { if (v !== undefined) d[k] = v; };
  copy('product', input.product);
  copy('quantity', input.quantity);
  copy('unitPrice', input.unitPrice);
  copy('subtotal', input.subtotal);
  copy('tax', input.tax);
  copy('shipping', input.shipping);
  copy('otherFees', input.otherFees);
  copy('otherFeesDescription', input.otherFeesDescription);
  copy('discount', input.discount);
  copy('statedTotal', input.statedTotal);
  copy('deliveryDays', input.deliveryDays);
  copy('deliveryDate', input.deliveryDate);
  copy('validUntil', input.validUntil);
  copy('paymentTerms', input.paymentTerms);
  copy('notes', input.notes);
  if (input.specConfirmations !== undefined) d.specConfirmations = input.specConfirmations as Prisma.InputJsonValue;
  if (input.uncertainties !== undefined) d.uncertainties = input.uncertainties as Prisma.InputJsonValue;
  return d;
}

async function replaceLineItems(tx: Prisma.TransactionClient, quoteId: string, items: NonNullable<CreateQuoteInput['lineItems']>): Promise<void> {
  await tx.quoteLineItem.deleteMany({ where: { quoteId } });
  if (items.length > 0) {
    await tx.quoteLineItem.createMany({
      data: items.map((li, position) => ({ quoteId, position, description: li.description, quantity: li.quantity ?? null, unitPrice: li.unitPrice ?? null, lineTotal: li.lineTotal ?? null })),
    });
  }
}

/** Recomputes and stores the authoritative total from the stored components. */
async function refreshCalculatedTotal(tx: Prisma.TransactionClient, quoteId: string): Promise<QuoteFull> {
  const row = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, include: quoteInclude });
  const total = totalsFor(toQuoteRecord(row)).calculatedTotal;
  const stored = Money.tryFrom(row.calculatedTotal);
  const same = total === null ? stored === null : stored !== null && stored.eq(total);
  if (same) return row;
  const next = total ? total.toFixed(4) : null;
  return tx.quote.update({ where: { id: quoteId }, data: { calculatedTotal: next }, include: quoteInclude });
}

export async function createQuote(requestId: string, input: CreateQuoteInput | UploadQuoteInput, file?: { buffer: Buffer; originalname: string; size: number }) {
  const prisma = getPrisma();
  const stored: StoredFile | null = file ? await storePdf(file) : null; // validated + saved before the DB work
  try {
    return await prisma.$transaction(async (tx) => {
      const atx = prismaApprovalTx(tx);
      const request = await atx.lockRequest(requestId);
      if (!request) throw notFound('Purchase request', requestId);
      if (LOCKED_REQUEST_STATUSES.includes(request.status)) throw conflict('REQUEST_LOCKED', `Request is ${request.status}; quotations can no longer be added.`);

      const nameKey = input.vendorName.trim().toLowerCase();
      const vendor = await tx.vendor.upsert({
        where: { nameKey },
        update: input.vendorEmail ? { email: input.vendorEmail } : {},
        create: { name: input.vendorName, nameKey, email: input.vendorEmail ?? null },
      });
      const dup = await tx.quote.findUnique({ where: { requestId_vendorId: { requestId, vendorId: vendor.id } } });
      if (dup) throw conflict('DUPLICATE_QUOTE', 'This vendor already has a quotation for this request. Update it with PATCH /api/quotes/:id.', { quoteId: dup.id });

      const manual = !stored;
      const full = input as Partial<CreateQuoteInput>;
      const touched = REVIEWABLE_KEYS.filter((k) => (full as Record<string, unknown>)[k] !== undefined);
      const created = await tx.quote.create({
        data: {
          ...(scalarData(full) as Prisma.QuoteUncheckedCreateInput),
          requestId, vendorId: vendor.id, currency: input.currency ?? request.currency,
          source: manual ? 'MANUAL' : 'UPLOADED',
          status: manual ? 'REVIEWED' : 'UPLOADED',
          // Buyer-typed data counts as reviewed; an uploaded PDF is NOT reviewed until the buyer confirms it.
          buyerReviewed: manual, reviewedAt: manual ? new Date() : null, reviewedFields: manual ? touched : [],
          ...(stored ? { sourceFileName: stored.originalName, sourceFilePath: stored.storedName, sourceFileSha256: stored.sha256, sourceFileSize: stored.size, sourceMimeType: stored.mimeType } : {}),
        },
      });
      if (full.lineItems?.length) await replaceLineItems(tx, created.id, full.lineItems);

      if (['DRAFT', 'ANALYZED', 'AWAITING_APPROVAL'].includes(request.status)) await atx.setRequestStatus(requestId, 'COLLECTING_QUOTES');
      return toQuoteDto(await refreshCalculatedTotal(tx, created.id));
    });
  } catch (err) {
    if (stored) await removeStoredFile(stored.storedName); // no orphaned file if the DB work failed
    throw err;
  }
}

export async function listQuotes(requestId: string) {
  const prisma = getPrisma();
  if (!(await prisma.purchaseRequest.findUnique({ where: { id: requestId }, select: { id: true } }))) throw notFound('Purchase request', requestId);
  const rows = await prisma.quote.findMany({ where: { requestId }, include: quoteInclude, orderBy: { createdAt: 'asc' } });
  return rows.map(toQuoteDto);
}

export async function getQuote(id: string) {
  const row = await getPrisma().quote.findUnique({ where: { id }, include: quoteInclude });
  if (!row) throw notFound('Quote', id);
  return toQuoteDto(row);
}

export async function updateQuote(id: string, input: PatchQuoteInput, now: Date = new Date()) {
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.quote.findUnique({ where: { id }, include: quoteInclude });
    if (!existing) throw notFound('Quote', id);
    const atx = prismaApprovalTx(tx);
    const request = await atx.lockRequest(existing.requestId);
    if (!request) throw notFound('Purchase request', existing.requestId);
    if (LOCKED_REQUEST_STATUSES.includes(request.status)) throw conflict('REQUEST_LOCKED', `Request is ${request.status}; quotations can no longer be edited.`);

    const keys = Object.keys(input);
    const material = keys.some((k) => (MATERIAL_KEYS as readonly string[]).includes(k));
    const data = scalarData(input);

    // Buyer-reviewed bookkeeping: edited fields are recorded; markReviewed toggles the review gate.
    const touched = keys.filter((k) => (REVIEWABLE_KEYS as readonly string[]).includes(k));
    if (touched.length) data.reviewedFields = [...new Set([...parseStringArray(existing.reviewedFields), ...touched])];
    let reviewed = existing.buyerReviewed;
    if (input.markReviewed !== undefined) {
      reviewed = input.markReviewed;
      data.buyerReviewed = reviewed;
      data.reviewedAt = reviewed ? now : null;
    }
    if (material) {
      // Any material change makes the previous analysis (and approval) stale.
      data.analyzedAt = null;
      data.status = reviewed ? 'REVIEWED' : ['UPLOADED', 'EXTRACTED'].includes(existing.status) ? existing.status : 'NEEDS_REVIEW';
    }

    await tx.quote.update({ where: { id }, data });
    if (input.lineItems !== undefined) await replaceLineItems(tx, id, input.lineItems);
    const updated = await refreshCalculatedTotal(tx, id);

    if (material) {
      await invalidateIfStale(atx, existing.requestId, 'Quotation was edited after approval.', now);
      if (['ANALYZED', 'AWAITING_APPROVAL'].includes(request.status)) await atx.setRequestStatus(existing.requestId, 'COLLECTING_QUOTES');
    }
    return toQuoteDto(updated);
  });
}
