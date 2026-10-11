import { describe, it, expect } from 'vitest';
import { validate } from './validate.js';
import { RegisterInput, LoginInput, PhoneSchema, PasswordSchema } from '@coffibeshop/shared';

function run(mw: any, req: any) {
  return new Promise<{ err?: any }>((resolve) => mw(req, {}, (e?: any) => resolve({ err: e })));
}

describe('validate middleware', () => {
  it('meneruskan body valid & menggantikan req.body dengan hasil parse', async () => {
    const req: any = { body: { email: 'A@B.COM', password: 'Rahasia123', full_name: 'AB' } };
    const { err } = await run(validate(RegisterInput), req);
    expect(err).toBeUndefined();
    expect(req.body.email).toBe('a@b.com'); // lowercase dari transform
  });

  it('menolak body tidak valid → 422 VALIDATION_ERROR', async () => {
    const req: any = { body: { email: 'bukan-email', password: 'x', full_name: 'A' } };
    const { err } = await run(validate(RegisterInput), req);
    expect(err.status).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toBeTruthy();
  });

  it('menolak field tak dikenal sesuai skema Zod (strip)', async () => {
    const req: any = {
      body: { email: 'a@b.com', password: 'Rahasia123', full_name: 'AB', role: 'owner' },
    };
    await run(validate(RegisterInput), req);
    expect(req.body.role).toBeUndefined(); // eskalasi privilege dicegah
  });
});

describe('skema auth (shared)', () => {
  it('PasswordSchema: minimal 8 karakter, wajib huruf & angka', () => {
    expect(PasswordSchema.safeParse('Rahasia123').success).toBe(true);
    expect(PasswordSchema.safeParse('pendek1').success).toBe(false);
    expect(PasswordSchema.safeParse('tanpaangka').success).toBe(false);
    expect(PasswordSchema.safeParse('12345678').success).toBe(false);
  });

  it('PhoneSchema: format Indonesia', () => {
    for (const p of ['08123456789', '+628123456789', '628123456789']) {
      expect(PhoneSchema.safeParse(p).success).toBe(true);
    }
    for (const p of ['12345', '0812', 'abc']) {
      expect(PhoneSchema.safeParse(p).success).toBe(false);
    }
  });

  it('LoginInput: butuh email ATAU phone', () => {
    expect(LoginInput.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
    expect(LoginInput.safeParse({ phone: '08123456789', password: 'x' }).success).toBe(true);
    expect(LoginInput.safeParse({ password: 'x' }).success).toBe(false);
  });
});
