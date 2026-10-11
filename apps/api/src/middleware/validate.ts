import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../lib/http.js';

/**
 * Validasi request (body/query/params) dengan Zod → 422 VALIDATION_ERROR.
 * Dipasang sebelum handler; hasil parse (sudah ter-coerce & ter-strip field tak
 * dikenal) menggantikan sumbernya.
 *
 * Catatan Express 5: `req.query` adalah getter read-only, jadi kita definisikan
 * ulang propertinya agar handler membaca nilai hasil validasi.
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
    if (source === 'body') {
      req.body = result.data;
    } else {
      // req.query/req.params bisa read-only (Express 5) → definisikan ulang.
      Object.defineProperty(req, source, {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  };
