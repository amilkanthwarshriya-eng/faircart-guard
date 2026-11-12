/**
 * HTTP-level tests (Supertest). The service layer is mocked, so these verify routing, Zod validation,
 * the consistent error format, upload validation and database-error mapping - no database required.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AppError, conflict, notFound } from '../src/utils/errors';

vi.mock('../src/services/procurement/requestService', () => ({ createRequest: vi.fn(), listRequests: vi.fn(), patchRequest: vi.fn() }));
vi.mock('../src/services/procurement/quoteService', () => ({ createQuote: vi.fn(), listQuotes: vi.fn(), getQuote: vi.fn(), updateQuote: vi.fn() }));
vi.mock('../src/services/procurement/summaryService', () => ({ getPurchaseSummary: vi.fn() }));
vi.mock('../src/services/procurement/analyzeService', () => ({ analyzeRequest: vi.fn(), getLatestRecommendation: vi.fn() }));
vi.mock('../src/services/procurement/approvalApi', () => ({ approveRequestQuote: vi.fn() }));

import { createApp } from '../src/app';
import * as requestService from '../src/services/procurement/requestService';
import * as quoteService from '../src/services/procurement/quoteService';
import * as summaryService from '../src/services/procurement/summaryService';
import * as analyzeService from '../src/services/procurement/analyzeService';
import * as approvalApi from '../src/services/procurement/approvalApi';

const app = createApp({ rateLimit: false });
const validRequest = { title: '100 T-shirts', quantity: 100, budget: '20000', currency: 'INR', deadlineDays: 7, requiredSpecs: ['Cotton fabric', 'Custom printing'] };

beforeEach(() => { vi.clearAllMocks(); });

describe('health', () => {
  it('GET /health responds ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
  it('unknown routes return the standard error body', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('POST /api/requests', () => {
  it('creates a request (201)', async () => {
    vi.mocked(requestService.createRequest).mockResolvedValue({ id: 'r1' } as never);
    const res = await request(app).post('/api/requests').send(validRequest);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('r1');
    expect(vi.mocked(requestService.createRequest).mock.calls[0]?.[0]).toMatchObject({ budget: '20000', currency: 'INR', deadlineDays: 7 });
  });
  it('accepts a JSON-number budget but passes it on as a string', async () => {
    vi.mocked(requestService.createRequest).mockResolvedValue({ id: 'r1' } as never);
    await request(app).post('/api/requests').send({ ...validRequest, budget: 20000.5 });
    expect(vi.mocked(requestService.createRequest).mock.calls[0]?.[0].budget).toBe('20000.5');
  });
  it('rejects invalid input with a field-level VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/requests').send({ ...validRequest, title: '', budget: '-5', quantity: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toContain('title');
    expect(paths).toContain('budget');
    expect(paths).toContain('quantity');
    expect(requestService.createRequest).not.toHaveBeenCalled();
  });
  it('requires a deadline', async () => {
    const { deadlineDays: _d, ...noDeadline } = validRequest;
    expect((await request(app).post('/api/requests').send(noDeadline)).status).toBe(400);
  });
  it('rejects unknown fields (e.g. a client-supplied status)', async () => {
    expect((await request(app).post('/api/requests').send({ ...validRequest, status: 'PAID' })).status).toBe(400);
  });
  it('rejects malformed JSON', async () => {
    const res = await request(app).post('/api/requests').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('GET/PATCH /api/requests', () => {
  it('lists with pagination meta', async () => {
    vi.mocked(requestService.listRequests).mockResolvedValue({ items: [], total: 0 });
    const res = await request(app).get('/api/requests?limit=5&status=DRAFT');
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ total: 0, limit: 5, offset: 0 });
  });
  it('rejects an invalid status filter', async () => {
    expect((await request(app).get('/api/requests?status=BOGUS')).status).toBe(400);
  });
  it('returns 404 for a missing request', async () => {
    vi.mocked(summaryService.getPurchaseSummary).mockRejectedValue(notFound('Purchase request', 'x'));
    const res = await request(app).get('/api/requests/x');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });
  it('PATCH rejects empty bodies and system-owned statuses', async () => {
    expect((await request(app).patch('/api/requests/r1').send({})).status).toBe(400);
    expect((await request(app).patch('/api/requests/r1').send({ status: 'PAID' })).status).toBe(400);
  });
  it('PATCH applies a valid update', async () => {
    vi.mocked(requestService.patchRequest).mockResolvedValue({ id: 'r1', title: 'New' } as never);
    const res = await request(app).patch('/api/requests/r1').send({ title: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New');
  });
  it('PATCH on a locked request returns 409', async () => {
    vi.mocked(requestService.patchRequest).mockRejectedValue(conflict('REQUEST_LOCKED', 'locked'));
    expect((await request(app).patch('/api/requests/r1').send({ title: 'x' })).status).toBe(409);
  });
});

describe('quotes API', () => {
  const manual = { vendorName: 'Vendor A', subtotal: '14500', tax: '2610', shipping: '800', otherFees: '0', deliveryDays: 5 };

  it('creates a manual quote (201)', async () => {
    vi.mocked(quoteService.createQuote).mockResolvedValue({ id: 'q1' } as never);
    const res = await request(app).post('/api/requests/r1/quotes').send(manual);
    expect(res.status).toBe(201);
    expect(vi.mocked(quoteService.createQuote).mock.calls[0]?.[0]).toBe('r1');
  });
  it('NEVER accepts a client-supplied authoritative total', async () => {
    for (const field of ['calculatedTotal', 'total', 'amount']) {
      const res = await request(app).post('/api/requests/r1/quotes').send({ ...manual, [field]: '1' });
      expect(res.status).toBe(400);
    }
  });
  it('rejects invalid quote input', async () => {
    const res = await request(app).post('/api/requests/r1/quotes').send({ vendorName: '', subtotal: 'abc', deliveryDays: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('reports duplicate quotes as 409', async () => {
    vi.mocked(quoteService.createQuote).mockRejectedValue(conflict('DUPLICATE_QUOTE', 'dup'));
    const res = await request(app).post('/api/requests/r1/quotes').send(manual);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_QUOTE');
  });
  it('404 for quotes of a missing request / missing quote', async () => {
    vi.mocked(quoteService.listQuotes).mockRejectedValue(notFound('Purchase request'));
    vi.mocked(quoteService.getQuote).mockRejectedValue(notFound('Quote'));
    expect((await request(app).get('/api/requests/nope/quotes')).status).toBe(404);
    expect((await request(app).get('/api/quotes/nope')).status).toBe(404);
  });
  it('PATCH /api/quotes/:id accepts buyer-reviewed fields and markReviewed', async () => {
    vi.mocked(quoteService.updateQuote).mockResolvedValue({ id: 'q1', buyerReviewed: true } as never);
    const res = await request(app).patch('/api/quotes/q1').send({ shipping: '900', markReviewed: true });
    expect(res.status).toBe(200);
    expect(vi.mocked(quoteService.updateQuote).mock.calls[0]?.[1]).toMatchObject({ shipping: '900', markReviewed: true });
  });
  it('PATCH rejects an empty body', async () => {
    expect((await request(app).patch('/api/quotes/q1').send({})).status).toBe(400);
  });
});

describe('PDF upload validation', () => {
  const pdf = Buffer.from('%PDF-1.4\n% test\n');

  it('accepts a small PDF with vendor info', async () => {
    vi.mocked(quoteService.createQuote).mockResolvedValue({ id: 'q2' } as never);
    const res = await request(app).post('/api/requests/r1/quotes').field('vendorName', 'Vendor U').attach('file', pdf, { filename: 'quote.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    const file = vi.mocked(quoteService.createQuote).mock.calls[0]?.[2];
    expect(file?.originalname).toBe('quote.pdf');
  });
  it('rejects a non-PDF MIME type', async () => {
    const res = await request(app).post('/api/requests/r1/quotes').field('vendorName', 'V').attach('file', Buffer.from('hello'), { filename: 'q.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(quoteService.createQuote).not.toHaveBeenCalled();
  });
  it('rejects a file over the size limit (413)', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(4096)]);
    const res = await request(app).post('/api/requests/r1/quotes').field('vendorName', 'V').attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });
  it('requires the file field on multipart requests', async () => {
    const res = await request(app).post('/api/requests/r1/quotes').field('vendorName', 'V');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });
  it('requires a vendor name with an upload', async () => {
    const res = await request(app).post('/api/requests/r1/quotes').attach('file', pdf, { filename: 'q.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('analyze / recommendation / approve', () => {
  it('POST analyze returns the structured result', async () => {
    vi.mocked(analyzeService.analyzeRequest).mockResolvedValue({ requestStatus: 'AWAITING_APPROVAL', recommendation: {} } as never);
    const res = await request(app).post('/api/requests/r1/analyze');
    expect(res.status).toBe(200);
    expect(res.body.data.requestStatus).toBe('AWAITING_APPROVAL');
  });
  it('analyze with no quotes surfaces the 422', async () => {
    vi.mocked(analyzeService.analyzeRequest).mockRejectedValue(new AppError(422, 'NO_QUOTES', 'none'));
    expect((await request(app).post('/api/requests/r1/analyze')).status).toBe(422);
  });
  it('GET recommendation 404 before analysis', async () => {
    vi.mocked(analyzeService.getLatestRecommendation).mockRejectedValue(notFound('Recommendation'));
    expect((await request(app).get('/api/requests/r1/recommendation')).status).toBe(404);
  });
  it('approve: 201 for a new approval, 200 for an idempotent repeat', async () => {
    vi.mocked(approvalApi.approveRequestQuote).mockResolvedValueOnce({ approval: {}, idempotent: false, created: true } as never);
    vi.mocked(approvalApi.approveRequestQuote).mockResolvedValueOnce({ approval: {}, idempotent: true, created: false } as never);
    expect((await request(app).post('/api/requests/r1/approve').send({ quoteId: 'q1' })).status).toBe(201);
    expect((await request(app).post('/api/requests/r1/approve').send({ quoteId: 'q1' })).status).toBe(200);
  });
  it('approve NEVER accepts a client-supplied amount', async () => {
    const res = await request(app).post('/api/requests/r1/approve').send({ quoteId: 'q1', amount: '1.00' });
    expect(res.status).toBe(400);
    expect(approvalApi.approveRequestQuote).not.toHaveBeenCalled();
  });
  it('approve requires a quoteId', async () => {
    expect((await request(app).post('/api/requests/r1/approve').send({})).status).toBe(400);
  });
  it('approve of an ineligible quote surfaces the 422', async () => {
    vi.mocked(approvalApi.approveRequestQuote).mockRejectedValue(new AppError(422, 'QUOTE_NOT_ELIGIBLE', 'no'));
    const res = await request(app).post('/api/requests/r1/approve').send({ quoteId: 'q9' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('QUOTE_NOT_ELIGIBLE');
  });
});

describe('database error handling', () => {
  const dbError = (code: string, name = 'PrismaClientKnownRequestError') => Object.assign(new Error('connection string postgres://user:SECRET@host leaked?'), { name, code });

  it('maps unique violations to 409', async () => {
    vi.mocked(requestService.createRequest).mockRejectedValue(dbError('P2002'));
    expect((await request(app).post('/api/requests').send(validRequest)).status).toBe(409);
  });
  it('maps record-not-found to 404', async () => {
    vi.mocked(summaryService.getPurchaseSummary).mockRejectedValue(dbError('P2025'));
    expect((await request(app).get('/api/requests/x')).status).toBe(404);
  });
  it('maps other database errors to a generic 500 without leaking details', async () => {
    vi.mocked(requestService.createRequest).mockRejectedValue(dbError('P2034'));
    const res = await request(app).post('/api/requests').send(validRequest);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DATABASE_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
  });
  it('maps an unreachable database to 503', async () => {
    vi.mocked(requestService.createRequest).mockRejectedValue(dbError('P1001', 'PrismaClientInitializationError'));
    expect((await request(app).post('/api/requests').send(validRequest)).status).toBe(503);
  });
  it('unexpected errors become a generic 500', async () => {
    vi.mocked(requestService.createRequest).mockRejectedValue(new Error('boom internal'));
    const res = await request(app).post('/api/requests').send(validRequest);
    expect(res.status).toBe(500);
    expect(res.body.error.message).not.toContain('boom');
  });
});
