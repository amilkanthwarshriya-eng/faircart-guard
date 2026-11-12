import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { MoneyError } from '../utils/money';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found' } } satisfies ErrorBody);
}

interface PrismaLikeError { name?: string; code?: string; meta?: unknown }

/** Consistent error format: { error: { code, message, details? } }. Never leaks stack traces, SQL or secrets. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const send = (status: number, code: string, message: string, details?: unknown): void => {
    res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) } } satisfies ErrorBody);
  };

  if (err instanceof ZodError) {
    return send(400, 'VALIDATION_ERROR', 'Request validation failed', err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);
  if (err instanceof MoneyError) return send(400, 'INVALID_AMOUNT', err.message);

  const e = err as PrismaLikeError & { type?: string; message?: string };
  if (e?.name === 'MulterError') {
    return e.code === 'LIMIT_FILE_SIZE'
      ? send(413, 'FILE_TOO_LARGE', 'Uploaded file exceeds the maximum allowed size')
      : send(400, 'UPLOAD_ERROR', 'Invalid upload');
  }
  if (e?.type === 'entity.parse.failed') return send(400, 'INVALID_JSON', 'Request body is not valid JSON');
  if (e?.type === 'entity.too.large') return send(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');

  if (e?.name === 'PrismaClientKnownRequestError') {
    if (e.code === 'P2025') return send(404, 'NOT_FOUND', 'Record not found');
    if (e.code === 'P2002') return send(409, 'DUPLICATE_RECORD', 'A record with these unique values already exists');
    if (e.code === 'P2003') return send(409, 'RELATION_CONFLICT', 'The record is referenced by, or references, another record');
    console.error('[db-error]', e.code, req.method, req.path);
    return send(500, 'DATABASE_ERROR', 'A database error occurred');
  }
  if (e?.name === 'PrismaClientInitializationError') {
    console.error('[db-unavailable]', req.method, req.path);
    return send(503, 'DATABASE_UNAVAILABLE', 'The database is currently unavailable');
  }

  console.error('[unhandled-error]', req.method, req.path, err instanceof Error ? err.name : typeof err);
  return send(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}
