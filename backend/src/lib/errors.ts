import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) {
    super(message ?? code);
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found`);
export const forbidden = () => new HttpError(403, 'forbidden');

/** Wraps async route handlers so thrown errors reach the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'invalid_input', details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
  }
  if (err instanceof Error && err.message.includes('insufficient_credits')) {
    return res.status(402).json({ error: 'insufficient_credits' });
  }
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
}
