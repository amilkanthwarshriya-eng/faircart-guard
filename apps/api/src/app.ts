import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { getEnv } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';
import paymentsRouter from './routes/payments';
import webhooksRouter from './routes/webhooks';
import { getPrisma } from './db';
import {
  configurePayments,
  PrismaPaymentRepository,
  PrismaWebhookEventStore,
  ProcurementPayableProvider,
} from './services/paypal';
import { setAiAnalysisPort } from './services/procurement/integration/aiPortProvider';
import { RealAiAnalysisPort } from './services/ai/aiPortAdapter';

interface AppOptions {
  rateLimit?: boolean;
}

export function createApp(options: AppOptions = {}): Express {
  const env = getEnv();
  const app = express();

  app.disable('x-powered-by');

  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(helmet());

  app.use(cors({
    origin: env.FRONTEND_URL.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }));

  // PayPal webhook requires the raw body.
  app.use('/api', webhooksRouter);

  app.use(express.json({ limit: '1mb' }));

  if (options.rateLimit !== false) {
    app.use('/api', rateLimit({
      windowMs: 60_000,
      limit: env.RATE_LIMIT_PER_MINUTE,
      standardHeaders: true,
      legacyHeaders: false,
    }));
  }

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'faircart-api',
      demoMode: env.DEMO_MODE,
      time: new Date().toISOString(),
    });
  });

  app.use('/api', apiRouter);
  app.use('/api', paymentsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// Initialize shared services once for both Vercel and local server usage.
const prisma = getPrisma();

configurePayments({
  repo: new PrismaPaymentRepository(prisma),
  events: new PrismaWebhookEventStore(prisma),
  payables: new ProcurementPayableProvider(),
});

setAiAnalysisPort(new RealAiAnalysisPort());

// Vercel requires a default-exported request handler/server.
const app = Object.assign(createApp(), { createApp });

export default app;