import { Router } from 'express';
import { quotesRouter } from './quotes';
import { requestsRouter } from './requests';

/**
 * Mounted at /api. Member 4 adds its own routers next to these (payments, webhooks) - see app.ts.
 * Member 2's POST /api/quotes/:id/extract route is also added by that integration (not part of Member 3's scope list).
 */
export const apiRouter = Router();
apiRouter.use('/requests', requestsRouter);
apiRouter.use('/quotes', quotesRouter);
