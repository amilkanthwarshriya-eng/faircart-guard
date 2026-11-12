import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { optionalPdfUpload } from '../middleware/upload';
import { approveSchema } from '../schemas/approval';
import { idParam } from '../schemas/common';
import { createQuoteSchema, uploadQuoteSchema } from '../schemas/quotes';
import { createRequestSchema, listRequestsQuery, patchRequestSchema } from '../schemas/requests';
import { AppError } from '../utils/errors';
import { analyzeRequest, getLatestRecommendation } from '../services/procurement/analyzeService';
import { approveRequestQuote } from '../services/procurement/approvalApi';
import { createQuote, listQuotes } from '../services/procurement/quoteService';
import { createRequest, listRequests, patchRequest } from '../services/procurement/requestService';
import { getPurchaseSummary } from '../services/procurement/summaryService';

/** Controllers are intentionally thin: parse + validate -> call service -> shape the response. */
export const requestsRouter = Router();

requestsRouter.post('/', asyncHandler(async (req, res) => {
  const body = createRequestSchema.parse(req.body);
  res.status(201).json({ data: await createRequest(body) });
}));

requestsRouter.get('/', asyncHandler(async (req, res) => {
  const q = listRequestsQuery.parse(req.query);
  const { items, total } = await listRequests(q);
  res.json({ data: items, meta: { total, limit: q.limit, offset: q.offset } });
}));

requestsRouter.get('/:id', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ data: await getPurchaseSummary(id) });
}));

requestsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ data: await patchRequest(id, patchRequestSchema.parse(req.body)) });
}));

requestsRouter.post('/:id/quotes', optionalPdfUpload, asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (req.file) {
    const body = uploadQuoteSchema.parse(req.body);
    res.status(201).json({ data: await createQuote(id, body, req.file) });
    return;
  }
  if (req.is('multipart/form-data')) throw new AppError(400, 'FILE_REQUIRED', 'Attach the quotation PDF in the "file" field');
  res.status(201).json({ data: await createQuote(id, createQuoteSchema.parse(req.body)) });
}));

requestsRouter.get('/:id/quotes', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ data: await listQuotes(id) });
}));

requestsRouter.post('/:id/analyze', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ data: await analyzeRequest(id) });
}));

requestsRouter.get('/:id/recommendation', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ data: await getLatestRecommendation(id) });
}));

requestsRouter.post('/:id/approve', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { created, ...result } = await approveRequestQuote(id, approveSchema.parse(req.body));
  res.status(created ? 201 : 200).json({ data: result });
}));
