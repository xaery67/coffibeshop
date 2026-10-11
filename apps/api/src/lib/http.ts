import type { Response, NextFunction, RequestHandler } from 'express';
import type { ApiResponse } from '@coffibeshop/shared';
import { ZodError } from 'zod';

/** Error terstruktur dengan HTTP status + kode. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const BadRequest = (m: string, d?: unknown) => new AppError(400, 'BAD_REQUEST', m, d);
export const Unauthorized = (m = 'Unauthorized') => new AppError(401, 'UNAUTHORIZED', m);
export const Forbidden = (m = 'Forbidden') => new AppError(403, 'FORBIDDEN', m);
export const NotFound = (m = 'Not found') => new AppError(404, 'NOT_FOUND', m);
export const Conflict = (m: string) => new AppError(409, 'CONFLICT', m);
export const TooMany = (m = 'Too many requests') => new AppError(429, 'RATE_LIMITED', m);

/** Envelope sukses: { success: true, data, error: null } */
export function sendOk<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { success: true, data, error: null };
  res.status(status).json(body);
}

/** Bungkus async handler agar error-nya diteruskan ke error middleware. */
export const asyncHandler =
  (fn: (req: any, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/** Middleware error terakhir — semua error jadi envelope konsisten. */
export function errorHandler(
  err: unknown,
  _req: unknown,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: err.flatten() },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({
      success: false,
      data: null,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({
    success: false,
    data: null,
    error: { code: 'INTERNAL_ERROR', message },
  });
}
