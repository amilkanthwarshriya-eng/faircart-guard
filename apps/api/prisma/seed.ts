/**
 * Seeds the main T-shirt procurement scenario.
 * ALL DATA HERE IS ILLUSTRATIVE SEED/DEMO DATA taken from the team workflow PDF - not real vendor quotes.
 *   Budget INR 20,000 | 100 T-shirts | deadline 7 days | specs: cotton fabric + custom printing
 *   A: 17,910 / 5 days (eligible)   B: 18,900 / 4 days (eligible, extra fee)   C: 16,930 / 10 days (ineligible)
 * Idempotent: re-running replaces the previous seed request.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SEED_REQUEST_ID = 'seed-tshirt-request';
const DAY = 86_400_000;

const specEvidence = (cotton: string, printing: string) => [
  { spec: 'Cotton fabric', confirmed: true, evidence: cotton },
  { spec: 'Custom printing', confirmed: true, evidence: printing },
];

async function main() {
  const now = new Date();
  await prisma.purchaseRequest.deleteMany({ where: { id: SEED_REQUEST_ID } });

  await prisma.purchaseRequest.create({
    data: {
      id: SEED_REQUEST_ID,
      title: '[SEED DATA] 100 custom printed T-shirts',
      description: 'Illustrative demo scenario: club T-shirts, cotton fabric with custom printing.',
      quantity: 100,
      budget: '20000',
      currency: 'INR',
      deadlineDays: 7,
      deadline: new Date(now.getTime() + 7 * DAY),
      requiredSpecs: ['Cotton fabric', 'Custom printing'],
      status: 'COLLECTING_QUOTES',
      createdAt: now,
    },
  });

  const vendors = [
    {
      name: 'Vendor A (seed)', email: 'sales@vendor-a.example',
      q: { subtotal: '14500', tax: '2610', shipping: '800', otherFees: '0', statedTotal: '17910', unitPrice: '145', deliveryDays: 5, specs: specEvidence('100% combed cotton T-shirts (seed)', 'Custom screen printing included (seed)'), desc: null as string | null },
    },
    {
      name: 'Vendor B (seed)', email: 'sales@vendor-b.example',
      q: { subtotal: '15000', tax: '2700', shipping: '0', otherFees: '1200', statedTotal: '18900', unitPrice: '150', deliveryDays: 4, specs: specEvidence('Premium cotton T-shirts (seed)', 'Custom print included (seed)'), desc: null as string | null },
    },
    {
      name: 'Vendor C (seed)', email: 'sales@vendor-c.example',
      q: { subtotal: '13500', tax: '2430', shipping: '1000', otherFees: '0', statedTotal: '16930', unitPrice: '135', deliveryDays: 10, specs: specEvidence('Cotton T-shirts (seed)', 'Custom printing available (seed)'), desc: null as string | null },
    },
  ];

  for (const v of vendors) {
    const nameKey = v.name.trim().toLowerCase();
    const vendor = await prisma.vendor.upsert({ where: { nameKey }, update: { name: v.name, email: v.email }, create: { name: v.name, nameKey, email: v.email } });
    await prisma.quote.create({
      data: {
        requestId: SEED_REQUEST_ID,
        vendorId: vendor.id,
        source: 'MANUAL',
        status: 'REVIEWED',
        currency: 'INR',
        product: 'Custom printed cotton T-shirt',
        quantity: 100,
        unitPrice: v.q.unitPrice,
        subtotal: v.q.subtotal,
        tax: v.q.tax,
        shipping: v.q.shipping,
        otherFees: v.q.otherFees,
        otherFeesDescription: v.q.desc,
        statedTotal: v.q.statedTotal,
        calculatedTotal: v.q.statedTotal, // equals the calculation for all three seed quotes; re-computed on analyze
        deliveryDays: v.q.deliveryDays,
        validUntil: new Date(now.getTime() + 30 * DAY),
        specConfirmations: v.q.specs,
        buyerReviewed: true,
        reviewedAt: now,
        reviewedFields: ['subtotal', 'tax', 'shipping', 'otherFees', 'deliveryDays', 'validUntil', 'specConfirmations'],
        notes: 'SEED DATA (illustrative)',
        lineItems: { create: [{ position: 0, description: 'Custom printed cotton T-shirt', quantity: '100', unitPrice: v.q.unitPrice, lineTotal: v.q.subtotal }] },
      },
    });
  }
  console.log(`Seeded request ${SEED_REQUEST_ID} with ${vendors.length} vendors/quotes.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
