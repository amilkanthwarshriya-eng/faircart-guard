import Decimal from 'decimal.js';
import request from 'supertest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import {
  clearTokenCache,
  configurePayments,
  InMemoryPaymentRepository,
  InMemoryWebhookEventStore,
  type PayableProvider,
} from '../src/services/paypal';
import { B, captureBody, orderCreated, tokenOk } from './paypal/mocks';

const server = setupServer(
  http.post(`${B}/v1/oauth2/token`, () => HttpResponse.json(tokenOk)),
  http.post(`${B}/v2/checkout/orders`, () => HttpResponse.json(orderCreated('ORD123'))),
  http.get(`${B}/v2/checkout/orders/ORD123`, () => HttpResponse.json({ id: 'ORD123', status: 'APPROVED', links: [] })),
  http.post(`${B}/v2/checkout/orders/ORD123/capture`, () => HttpResponse.json(captureBody({ orderId: 'ORD123', ref: 'seed-tshirt-request', amount: '215.00' }))),
  http.post(`${B}/v1/notifications/verify-webhook-signature`, () => HttpResponse.json({ verification_status: 'SUCCESS' })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

let repo: InMemoryPaymentRepository;
let events: InMemoryWebhookEventStore;
let validApproval = true;

const payables: PayableProvider = {
  async getApprovedPayable(requestId: string) {
    if (requestId === 'req-no-approval') return null;
    return {
      requestId,
      approvalId: `app-${requestId}`,
      quoteId: `quote-${requestId}`,
      amount: new Decimal('215.00'),
      currency: 'USD',
      description: '100 T-shirts',
      valid: validApproval,
    };
  },
};

const app = createApp({ rateLimit: false });

beforeEach(() => {
  validApproval = true;
  clearTokenCache();
  repo = new InMemoryPaymentRepository();
  events = new InMemoryWebhookEventStore();
  configurePayments({ repo, events, payables });
});

describe('Payments & Webhooks API endpoints', () => {
  it('POST /api/payments/create-order creates order and returns approvalUrl', async () => {
    const res = await request(app)
      .post('/api/payments/create-order')
      .send({ requestId: 'seed-tshirt-request' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVAL_PENDING');
    expect(res.body.amount).toBe('215.00');
    expect(res.body.currency).toBe('USD');
    expect(res.body.approvalUrl).toContain('checkoutnow?token=ORD123');
  });

  it('POST /api/payments/create-order rejects missing requestId', async () => {
    const res = await request(app)
      .post('/api/payments/create-order')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  it('POST /api/payments/create-order returns 422 if no approval exists', async () => {
    const res = await request(app)
      .post('/api/payments/create-order')
      .send({ requestId: 'req-no-approval' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_APPROVAL');
  });

  it('POST /api/payments/capture-order captures approved order', async () => {
    const createRes = await request(app)
      .post('/api/payments/create-order')
      .send({ requestId: 'seed-tshirt-request' });

    const paymentId = createRes.body.id;

    const captureRes = await request(app)
      .post('/api/payments/capture-order')
      .send({ paymentId });

    expect(captureRes.status).toBe(200);
    expect(captureRes.body.status).toBe('COMPLETED');
    expect(captureRes.body.paypalCaptureId).toBe('CAP1');
  });

  it('GET /api/payments/:id returns the payment status', async () => {
    const createRes = await request(app)
      .post('/api/payments/create-order')
      .send({ requestId: 'seed-tshirt-request' });

    const paymentId = createRes.body.id;

    const getRes = await request(app).get(`/api/payments/${paymentId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(paymentId);
    expect(getRes.body.status).toBe('APPROVAL_PENDING');
  });

  it('POST /api/payments/:id/cancel cancels an uncaptured payment', async () => {
    const createRes = await request(app)
      .post('/api/payments/create-order')
      .send({ requestId: 'seed-tshirt-request' });

    const paymentId = createRes.body.id;

    const cancelRes = await request(app).post(`/api/payments/${paymentId}/cancel`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');
  });

  it('POST /api/webhooks/paypal rejects requests without PayPal headers', async () => {
    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('POST /api/webhooks/paypal verifies signature and processes event', async () => {
    const createRes = await request(app)
      .post('/api/payments/create-order')
      .send({ requestId: 'seed-tshirt-request' });
    const paymentId = createRes.body.id;

    // Simulate moving to capturing
    await repo.transition(paymentId, ['APPROVAL_PENDING'], 'CAPTURING');

    const webhookPayload = {
      id: 'WH-EVT-123',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAP1',
        custom_id: paymentId,
        amount: { currency_code: 'USD', value: '215.00' },
      },
    };

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .set('paypal-cert-url', 'https://api.sandbox.paypal.com/v1/cert')
      .set('paypal-transmission-id', 'tx-1')
      .set('paypal-transmission-sig', 'sig-1')
      .set('paypal-transmission-time', '2026-11-11T12:00:00Z')
      .send(JSON.stringify(webhookPayload));

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('PROCESSED');

    const payment = await repo.get(paymentId);
    expect(payment?.status).toBe('COMPLETED');
  });
});

