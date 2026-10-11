import { describe, it, expect } from 'vitest';
import { ok, fail } from '@coffibeshop/shared';
import { AppError, BadRequest, NotFound } from './http.js';

describe('envelope helpers', () => {
  it('ok() membungkus data dengan success=true', () => {
    expect(ok({ a: 1 })).toEqual({ success: true, data: { a: 1 }, error: null });
  });
  it('fail() membungkus error', () => {
    const r = fail('X', 'msg');
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe('X');
  });
});

describe('AppError', () => {
  it('BadRequest → 400', () => {
    const e = BadRequest('bad');
    expect(e).toBeInstanceOf(AppError);
    expect(e.status).toBe(400);
  });
  it('NotFound → 404', () => {
    expect(NotFound().status).toBe(404);
  });
});
