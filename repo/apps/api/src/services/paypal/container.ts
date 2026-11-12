import { devStubPayables } from "./dev-stub";
import { InMemoryPaymentRepository, type PaymentRepository } from "./repository";
import { createPaymentService, type PayableProvider, type PaymentService } from "./service";
import { createWebhookProcessor, InMemoryWebhookEventStore, type WebhookEventStore, type WebhookProcessor } from "./webhook";

let repo: PaymentRepository = new InMemoryPaymentRepository();
let events: WebhookEventStore = new InMemoryWebhookEventStore();
let payables: PayableProvider | null = null;
let service: PaymentService | null = null;
let processor: WebhookProcessor | null = null;

/** Member 3's server.ts calls this once at startup with the Prisma repository and the real approval provider. */
export function configurePayments(o: { repo?: PaymentRepository; events?: WebhookEventStore; payables?: PayableProvider }) {
  if (o.repo) repo = o.repo;
  if (o.events) events = o.events;
  if (o.payables) payables = o.payables;
  service = null; processor = null;
}

export function getPaymentService(): PaymentService {
  if (!payables) {
    if (process.env.PAYMENTS_DEV_STUB === "true" && process.env.NODE_ENV !== "production") payables = devStubPayables();
    else throw new Error("Payments not configured: call configurePayments({ payables }) at startup");
  }
  return (service ??= createPaymentService({ repo, payables }));
}
export function getWebhookProcessor(): WebhookProcessor {
  return (processor ??= createWebhookProcessor({ repo, events }));
}
