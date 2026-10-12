import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { BadRequest } from '../lib/http.js';

/**
 * Multer configuration untuk upload gambar produk ke Supabase Storage.
 * - memoryStorage: file disimpan di memory (buffer), bukan disk
 * - limit 5MB
 * - validasi MIME type di route handler
 */

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SIZE,
  },
});

/**
 * Multer instance untuk upload. Gunakan: multerUpload.single('image')
 */
export const multerUpload = multerInstance;

/**
 * Middleware error handling untuk multer.
 * Tangkap error multer dan return response yang konsisten.
 */
export const handleMulterError = (err: Error | multer.MulterError | unknown, _req: Request, _res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(BadRequest('Ukuran file melebihi batas 5MB'));
    }
    return next(BadRequest(`Upload error: ${err.message}`));
  }
  if (err) {
    return next(err as Error);
  }
  next();
};