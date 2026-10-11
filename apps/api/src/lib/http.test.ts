import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { errorHandler, AppError, BadRequest } from './http.js';

/** Response palsu untuk menangkap status + body. */
function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('errorHandler — envelope konsisten', () => {
  it('ZodError → 422 VALIDATION_ERROR', () => {
    const schema = z.object({ a: z.string() });
    const parsed = schema.safeParse({ a: 1 });
    const res = mockRes();
    errorHandler(parsed.success ? null : parsed.error, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error.code).toBe('VALIDATION_ERROR');
  });

  it('AppError → status & code dari error', () => {
    const res = mockRes();
    errorHandler(BadRequest('input salah'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('BAD_REQUEST');
  });

  it('AppError kustom (404) dipertahankan', () => {
    const res = mockRes();
    errorHandler(new AppError(404, 'NOT_FOUND', 'x'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('PrismaClientValidationError → 400 (bukan 500)', () => {
    const err: any = new Error('Invalid invocation');
    err.name = 'PrismaClientValidationError';
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('BAD_REQUEST');
  });

  it('error UUID Prisma ("Error creating UUID") → 400', () => {
    const res = mockRes();
    errorHandler(new Error('Inconsistent column data: Error creating UUID, invalid character'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('Prisma P2002 (unique) → 409 CONFLICT', () => {
    const err: any = new Error('unique constraint');
    err.name = 'PrismaClientKnownRequestError';
    err.code = 'P2002';
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe('CONFLICT');
  });

  it('Prisma P2025 (not found) → 404', () => {
    const err: any = new Error('record not found');
    err.name = 'PrismaClientKnownRequestError';
    err.code = 'P2025';
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('Prisma P2003 (FK) → 400', () => {
    const err: any = new Error('fk');
    err.name = 'PrismaClientKnownRequestError';
    err.code = 'P2003';
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('error tak dikenal → 500 INTERNAL_ERROR', () => {
    const res = mockRes();
    errorHandler(new Error('boom'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.code).toBe('INTERNAL_ERROR');
  });

  it('semua respons memakai bentuk { success:false, data:null, error }', () => {
    const res = mockRes();
    errorHandler(BadRequest('x'), {}, res, () => {});
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
  });
});
