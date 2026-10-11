import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../lib/http.js';

/**
 * Validasi request body dengan Zod → 422 VALIDATION_ERROR (envelope konsisten).
 * Dipasang sebelum handler; hasil parse menggantikan `req.body` (sudah ter-coerce
 * & ter-strip field tak dikenal).
 */
export const validate =
  (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new AppError(422, 'VALIDATION_ERROR', 'Data tidak valid', result.error.flatten()),
      );
    }
    // req.query/params bersifat read-only di Express 5 — hanya body yang ditimpa.
    if (source === 'body') req.body = result.data;
    else Object.assign(req[source] as object, result.data);
    next();
  };
