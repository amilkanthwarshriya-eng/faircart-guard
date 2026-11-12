import { createApp } from './app';
import { getEnv } from './config/env';
import { disconnectPrisma, getPrisma } from './db';
import { configurePayments, PrismaPaymentRepository, PrismaWebhookEventStore, ProcurementPayableProvider } from './services/paypal';
import { setAiAnalysisPort } from './services/procurement/integration/aiPortProvider';
import { RealAiAnalysisPort } from './services/ai/aiPortAdapter';

const env = getEnv();
const prisma = getPrisma();
configurePayments({
  repo: new PrismaPaymentRepository(prisma),
  events: new PrismaWebhookEventStore(prisma),
  payables: new ProcurementPayableProvider(),
});
setAiAnalysisPort(new RealAiAnalysisPort());

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`FairCart API listening on :${env.PORT} (${env.NODE_ENV}, DEMO_MODE=${env.DEMO_MODE})`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
