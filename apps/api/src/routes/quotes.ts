import { existsSync, readFileSync } from 'node:fs';
import { Router } from 'express';
import { getPrisma } from '../db';
import { asyncHandler } from '../middleware/errorHandler';
import { idParam } from '../schemas/common';
import { patchQuoteSchema } from '../schemas/quotes';
import { agentStepsFromEnv } from '../services/ai';
import { extractPdfText } from '../services/ai/pdf/extractPdfText';
import { getQuote, updateQuote } from '../services/procurement/quoteService';
import { notFound, unprocessable } from '../utils/errors';

export const quotesRouter = Router();

quotesRouter.get('/:id', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ data: await getQuote(id) });
}));

quotesRouter.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ data: await updateQuote(id, patchQuoteSchema.parse(req.body)) });
}));

quotesRouter.post('/:id/extract', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const prisma = getPrisma();
  const quote = await prisma.quote.findUnique({ where: { id }, include: { vendor: true } });
  if (!quote) throw notFound('Quote', id);

  let sourceText = quote.notes ?? '';
  if (quote.sourceFilePath && existsSync(quote.sourceFilePath)) {
    const fileBytes = readFileSync(quote.sourceFilePath);
    if (quote.sourceMimeType === 'application/pdf' || quote.sourceFileName?.toLowerCase().endsWith('.pdf')) {
      const pdf = await extractPdfText(new Uint8Array(fileBytes));
      sourceText = pdf.text;
    } else {
      sourceText = fileBytes.toString('utf-8');
    }
  }

  if (!sourceText.trim()) {
    throw unprocessable('UNREADABLE_QUOTE', 'Quote has no readable text. Please enter line items manually.');
  }

  const steps = agentStepsFromEnv(process.env);
  const extractionRes = await steps.extract(sourceText, quote.id);

  const updated = await updateQuote(id, {
    product: extractionRes.extraction.product ?? undefined,
    quantity: extractionRes.extraction.quantity ?? undefined,
    unitPrice: extractionRes.extraction.unitPrice ?? undefined,
    subtotal: extractionRes.extraction.subtotal ?? undefined,
    tax: extractionRes.extraction.tax ?? undefined,
    shipping: extractionRes.extraction.shipping ?? undefined,
    otherFees: extractionRes.extraction.otherFees ?? undefined,
    discount: extractionRes.extraction.discount ?? undefined,
    statedTotal: extractionRes.extraction.statedTotal ?? undefined,
    deliveryDays: extractionRes.extraction.deliveryDays ?? undefined,
    validUntil: extractionRes.extraction.validUntil ? new Date(extractionRes.extraction.validUntil) : undefined,
    paymentTerms: extractionRes.extraction.paymentTerms ?? undefined,
    markReviewed: false,
  });

  res.json({
    data: {
      quote: updated,
      extraction: extractionRes.extraction,
      warnings: extractionRes.warnings,
      injectionSuspected: extractionRes.injectionSuspected,
    },
  });
}));
