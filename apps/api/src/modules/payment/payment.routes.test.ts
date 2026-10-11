import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Payment routes — kontrak endpoint (issue #18, PRD-QA F-004).
 *
 * CATATAN PENTING (lihat docs/QA-RELEASE-GATE.md → "Known Gaps"):
 * Modul payment di branch ini masih SCAFFOLD (`payment.routes.ts`):
 *   - `POST /payments/initiate`  : belum memanggil Midtrans (mock/tidak), belum idempotent.
 *   - `POST /payments/webhook/:provider` : BELUM memverifikasi signature & BELUM idempotent.
 * Karena itu file ini menguji KONTRAK yang SUDAH ADA (characterization test) agar
 * tidak ada regresi diam-diam; spesifikasi yang DIHARAPKAN untuk signature & idempotency
 * ada di `payment.security-gaps.test.ts` (di-skip sampai gateway mendarat).
 */

// Redis di-mock: endpoint di sini tidak boleh menyentuh infra nyata (offline).
vi.mock('../../config/redis.js', () => ({
  redisCache: {
    get: async () => null,
    setex: async () => 'OK',
    del: async () => 1,
    quit: async () => undefined,
  },
  redisQueue: { quit: async () => undefined },
  pingRedis: async () => true,
}));

import { paymentRouter } from './payment.routes.js';
import { startServer, mountApp, expectOk, expectError, type TestServer } from '../../../test/harness.js';

let srv: TestServer;

beforeAll(async () => {
  const app = await mountApp([{ path: '/api/v1/payments', router: paymentRouter }]);
  srv = await startServer(app);
});

afterAll(async () => {
  await srv?.close();
});

describe('GET /payments/methods — daftar metode aktif (publik)', () => {
  it('mengembalikan envelope sukses berisi 10 metode', async () => {
    const res = await srv.request('GET', '/api/v1/payments/methods');
    expect(res.status).toBe(200);
    const data = expectOk(res.json);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(10);
    expect(data).toContain('qris');
    expect(data).toContain('virtual_account');
  });

  it('tidak butuh autentikasi (tanpa token tetap 200)', async () => {
    const res = await srv.request('GET', '/api/v1/payments/methods');
    expect(res.status).toBe(200);
  });
});

describe('POST /payments/initiate — mulai pembayaran', () => {
  it('menolak tanpa order_id → 400 BAD_REQUEST (envelope error)', async () => {
    const res = await srv.request('POST', '/api/v1/payments/initiate', { body: {} });
    expect(res.status).toBe(400);
    const err = expectError(res.json);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toMatch(/order_id/i);
  });

  it('order_id valid → 201 + provider midtrans + payment_url + expires_at', async () => {
    const res = await srv.request('POST', '/api/v1/payments/initiate', {
      body: { order_id: '11111111-1111-4111-8111-111111111111' },
    });
    expect(res.status).toBe(201);
    const data = expectOk(res.json);
    expect(data.order_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(data.provider).toBe('midtrans');
    expect(typeof data.payment_url).toBe('string');
    expect(data.payment_url).toContain('midtrans');
    expect(Number.isNaN(Date.parse(data.expires_at))).toBe(false);
  });

  it('bekerja untuk guest (header X-Guest-Id) tanpa JWT', async () => {
    const res = await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'X-Guest-Id': '22222222-2222-4222-8222-222222222222' },
      body: { order_id: '33333333-3333-4333-8333-333333333333' },
    });
    expect(res.status).toBe(201);
    expectOk(res.json);
  });

  it('expires_at ≈ 15 menit dari sekarang', async () => {
    const before = Date.now();
    const res = await srv.request('POST', '/api/v1/payments/initiate', {
      body: { order_id: '44444444-4444-4444-8444-444444444444' },
    });
    const data = expectOk(res.json);
    const deltaMin = (Date.parse(data.expires_at) - before) / 60000;
    expect(deltaMin).toBeGreaterThan(14);
    expect(deltaMin).toBeLessThan(16);
  });

  /**
   * GAP #18-2 (characterization): endpoint BELUM idempotent.
   * Memanggil ulang dengan `Idempotency-Key` yang sama tetap membuat respons baru
   * (belum ada penyimpanan key → respons). Test ini mendokumentasikan perilaku saat ini;
   * setelah gateway idempotent mendarat, test ini HARUS diperbarui (lihat security-gaps).
   */
  it('[GAP] Idempotency-Key belum berpengaruh — dua panggilan menghasilkan respons berbeda', async () => {
    const key = 'idem-key-abc';
    const a = await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'Idempotency-Key': key },
      body: { order_id: '55555555-5555-4555-8555-555555555555' },
    });
    const b = await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'Idempotency-Key': key },
      body: { order_id: '55555555-5555-4555-8555-555555555555' },
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    // Belum ada dedupe → waktu kedaluwarsa berbeda (bukti tidak idempotent).
    expect(expectOk(a.json).expires_at).not.toBe(expectOk(b.json).expires_at);
  });
});

describe('POST /payments/webhook/:provider — callback gateway', () => {
  it('menerima payload provider dikenal → 200 + received:true', async () => {
    const res = await srv.request('POST', '/api/v1/payments/webhook/midtrans', {
      body: { transaction_id: 'trx-1', order_id: 'o1', transaction_status: 'settlement' },
    });
    expect(res.status).toBe(200);
    const data = expectOk(res.json);
    expect(data.received).toBe(true);
    expect(data.provider).toBe('midtrans');
  });

  it('provider xendit juga diterima (dual gateway)', async () => {
    const res = await srv.request('POST', '/api/v1/payments/webhook/xendit', {
      body: { id: 'xnd-1', status: 'PAID' },
    });
    expect(res.status).toBe(200);
    expect(expectOk(res.json).provider).toBe('xendit');
  });

  /**
   * GAP #18-1 (characterization): webhook BELUM memverifikasi signature.
   * Payload tanpa signature apa pun tetap diterima 200 — ini risiko keamanan
   * (attacker bisa memalsukan "pembayaran sukses"). Spesifikasi yang diharapkan
   * (invalid signature → 401) ada di payment.security-gaps.test.ts.
   */
  it('[GAP] payload TANPA signature tetap diterima (bukti belum ada verifikasi)', async () => {
    const res = await srv.request('POST', '/api/v1/payments/webhook/midtrans', {
      rawBody: JSON.stringify({ transaction_id: 'forged', transaction_status: 'settlement' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(expectOk(res.json).received).toBe(true);
  });

  it('[GAP] provider tidak dikenal tetap diterima 200 (belum ada allowlist)', async () => {
    const res = await srv.request('POST', '/api/v1/payments/webhook/unknown-gateway', {
      body: { transaction_id: 'x' },
    });
    expect(res.status).toBe(200);
    expect(expectOk(res.json).provider).toBe('unknown-gateway');
  });
});
