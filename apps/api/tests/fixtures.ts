/** Test fixtures mirroring the illustrative T-shirt scenario from the team workflow PDF. */
import type { QuoteRecord, RequestRecord } from '../src/services/procurement/types';

export const NOW = new Date('2026-11-11T00:00:00.000Z');
export const FUTURE = new Date('2026-12-11T00:00:00.000Z');

export function makeRequest(over: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: 'req_1', title: '100 custom T-shirts', quantity: 100, budget: '20000', currency: 'INR',
    deadlineDays: 7, requiredSpecs: ['Cotton fabric', 'Custom printing'], status: 'COLLECTING_QUOTES',
    createdAt: NOW, ...over,
  };
}

const specsOk = [
  { spec: 'cotton fabric', confirmed: true, evidence: '100% cotton' },
  { spec: 'custom printing', confirmed: true, evidence: 'custom print included' },
];

export function makeQuote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'quote_A', requestId: 'req_1', vendorId: 'vendor_A', vendorName: 'Vendor A', status: 'REVIEWED', currency: 'INR',
    product: 'T-shirt', quantity: 100, unitPrice: '145', lineItems: [],
    subtotal: '14500', tax: '2610', shipping: '800', otherFees: '0', otherFeesDescription: null, discount: null,
    statedTotal: '17910', deliveryDays: 5, deliveryDate: null, validUntil: FUTURE, paymentTerms: null,
    specConfirmations: specsOk, uncertainties: [], buyerReviewed: true, analyzedAt: null, ...over,
  };
}

export const quoteA = (): QuoteRecord => makeQuote();
export const quoteB = (): QuoteRecord =>
  makeQuote({ id: 'quote_B', vendorId: 'vendor_B', vendorName: 'Vendor B', unitPrice: '150', subtotal: '15000', tax: '2700', shipping: '0', otherFees: '1200', statedTotal: '18900', deliveryDays: 4 });
export const quoteC = (): QuoteRecord =>
  makeQuote({ id: 'quote_C', vendorId: 'vendor_C', vendorName: 'Vendor C', unitPrice: '135', subtotal: '13500', tax: '2430', shipping: '1000', otherFees: '0', statedTotal: '16930', deliveryDays: 10 });
