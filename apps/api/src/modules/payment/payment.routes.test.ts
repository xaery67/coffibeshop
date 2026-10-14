import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Payment routes — kontrak endpoint (issue #18, PRD-QA F-004).
 *
 * Sejak #7 (payment) mendarat, modul ini NYATA: `POST /payments/initiate`
 * memanggil provider (Midtrans) & menyimpan idempotency; `POST /payments/webhook/:provider`
 * memverifikasi signature & memproses pembayaran.
 *
 * Test ini OFFLINE: provider Midtrans di-mock (TIDAK memanggil API nyata) dan
 * Prisma di-mock in-memory. Verifikasi signature memakai algoritma SUNGGUHAN
 * (sha512 order_id+status_code+gross_amount+ServerKey) dari MidtransProvider,
 * sehingga test ini mengunci perilaku nyata sebagai regression guard.
 */

// Env kredensial Midtrans diset SEBELUM modul env.ts dievaluasi (vi.hoisted
// berjalan sebelum import). Tanpa ini MidtransProvider.create() gagal.
const ENV = vi.hoisted(() => {
  process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-TESTKEY';
  process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-TESTKEY';
  process.env.MIDTRANS_IS_PRODUCTION = 'false';
  return { serverKey: 'SB-Mid-server-TESTKEY' };
});

// State in-memory untuk Prisma mock.
const db = vi.hoisted(() => ({
  payments: [] as any[],
  idempotency: new Map<string, any>(),
  orders: [] as any[],
  logs: [] as any[],
  paymentIntents: [] as any[],
}));

// Provider Midtrans di-mock: konstruksi tetap nyata, tetapi panggilan jaringan
// (createTransaction / getTransactionStatus) diganti stub deterministik.
vi.mock('midtrans-client', () => {
  class Snap {
    async createTransaction(input: any) {
      // Return a response with our provider_order_id
      const providerOrderId = input.transaction_details?.order_id || 'test-provider-order-id';
      return {
        token: 'snap-token-123',
        redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/snap-token-123',
        // Include our provider_order_id in the response
        order_id: providerOrderId,
      };
    }
  }
  class CoreApi {
    async getTransactionStatus() {
      return { transaction_status: 'settlement' };
    }
  }
  return { default: { Snap, CoreApi } };
});

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

// Prisma di-mock in-memory (payment, idempotency, order, status log).
vi.mock('../../config/prisma.js', () => {
  const tx = {
    order: {
      update: async ({ where, data }: any) => {
        const o = db.orders.find((x) => x.id === where.id);
        if (o) Object.assign(o, data);
        return o;
      },
    },
    orderStatusLog: {
      create: async ({ data }: any) => {
        db.logs.push(data);
        return data;
      },
    },
  };
  return {
    prisma: {
      paymentIdempotency: {
        findUnique: async ({ where }: any) => db.idempotency.get(where.idempotency_key) ?? null,
        create: async ({ data }: any) => {
          db.idempotency.set(data.idempotency_key, data);
          return data;
        },
      },
      payment: {
        findUnique: async ({ where }: any) =>
          db.payments.find((p) => p.transaction_id === where.transaction_id) ?? null,
        create: async ({ data }: any) => {
          db.payments.push(data);
          return data;
        },
      },
      paymentIntent: {
        findUnique: async ({ where }: any) => {
          if (where.provider_order_id) {
            return db.paymentIntents.find((pi) => pi.provider_order_id === where.provider_order_id) ?? null;
          }
          return null;
        },
        create: async ({ data }: any) => {
          db.paymentIntents.push(data);
          return data;
        },
        update: async ({ where, data }: any) => {
          const idx = db.paymentIntents.findIndex((pi) => pi.id === where.id);
          if (idx >= 0) {
            db.paymentIntents[idx] = { ...db.paymentIntents[idx], ...data };
            return db.paymentIntents[idx];
          }
          return null;
        },
      },
      order: {
        findUnique: async ({ where }: any) => {
          const o = db.orders.find((x) => x.id === where.id);
          if (!o) return null;
          return { ...o, payments: db.payments.filter((p) => p.order_id === o.id) };
        },
      },
      orderStatusLog: {
        create: async ({ data }: any) => {
          db.logs.push(data);
          return data;
        },
      },
      $transaction: async (fn: any) => fn(tx),
    },
  };
});

import { paymentRouter } from './payment.routes.js';
import { startServer, mountApp, expectOk, expectError, type TestServer } from '../../../test/harness.js';

let srv: TestServer;

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const GROSS = '82140.00';

/** Hitung signature Midtrans yang valid (sha512 order_id+status_code+gross_amount+ServerKey). */
function midtransSign(orderId: string, statusCode: string, gross: string): string {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${gross}${ENV.serverKey}`)
    .digest('hex');
}

beforeAll(async () => {
  const app = await mountApp([{ path: '/api/v1/payments', router: paymentRouter }]);
  srv = await startServer(app);
});

afterAll(async () => {
  await srv?.close();
});

beforeEach(() => {
  db.payments.length = 0;
  db.orders.length = 0;
  db.logs.length = 0;
  db.idempotency.clear();
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

describe('POST /payments/initiate — validasi input', () => {
  it('menolak tanpa order_id → 400 BAD_REQUEST', async () => {
    const res = await srv.request('POST', '/api/v1/payments/initiate', {
      body: { amount: 82140, method: 'qris' },
    });
    expect(res.status).toBe(400);
    const err = expectError(res.json);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toMatch(/order_id/i);
  });

  it('menolak tanpa amount / amount <= 0 → 400 "amount harus > 0"', async () => {
    const res = await srv.request('POST', '/api/v1/payments/initiate', {
      body: { order_id: ORDER_ID, method: 'qris' },
    });
    expect(res.status).toBe(400);
    expect(expectError(res.json).message).toMatch(/amount harus > 0/i);
  });

  it('menolak tanpa method → 400', async () => {
    const res = await srv.request('POST', '/api/v1/payments/initiate', {
      body: { order_id: ORDER_ID, amount: 82140 },
    });
    expect(res.status).toBe(400);
    expect(expectError(res.json).message).toMatch(/method/i);
  });
});

describe('POST /payments/initiate — mulai pembayaran (happy path)', () => {
  it('order_id + amount + method valid → 201 + provider midtrans + paymentUrl + expiresAt', async () => {
    const res = await srv.request('POST', '/api/v1/payments/initiate', {
      body: { order_id: ORDER_ID, amount: 82140, method: 'qris' },
    });
    expect(res.status).toBe(201);
    const data = expectOk(res.json);
    expect(data.provider).toBe('midtrans');
    expect(typeof data.paymentUrl).toBe('string');
    expect(data.paymentUrl).toContain('midtrans');
    expect(Number.isNaN(Date.parse(data.expiresAt))).toBe(false);
  });

  it('bekerja untuk guest (header X-Guest-Id) tanpa JWT', async () => {
    const res = await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'X-Guest-Id': '22222222-2222-4222-8222-222222222222' },
      body: { order_id: ORDER_ID, amount: 82140, method: 'qris' },
    });
    expect(res.status).toBe(201);
    expectOk(res.json);
  });

  it('expiresAt ≈ 15 menit dari sekarang', async () => {
    const before = Date.now();
    const res = await srv.request('POST', '/api/v1/payments/initiate', {
      body: { order_id: ORDER_ID, amount: 82140, method: 'qris' },
    });
    const data = expectOk(res.json);
    const deltaMin = (Date.parse(data.expiresAt) - before) / 60000;
    expect(deltaMin).toBeGreaterThan(14);
    expect(deltaMin).toBeLessThan(16);
  });
});

describe('POST /payments/initiate — idempotency (Idempotency-Key)', () => {
  it('Idempotency-Key sama + body sama → respons IDENTIK (tidak membuat sesi baru)', async () => {
    const key = 'idem-key-abc';
    const payload = { order_id: ORDER_ID, amount: 82140, method: 'qris' };

    const a = await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'Idempotency-Key': key },
      body: payload,
    });
    const b = await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'Idempotency-Key': key },
      body: payload,
    });

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    // Dedupe aktif: respons kedua persis sama (termasuk expiresAt).
    expect(expectOk(b.json)).toEqual(expectOk(a.json));
  });

  it('Idempotency-Key sama + body BEDA → 409 CONFLICT', async () => {
    const key = 'idem-key-conflict';
    await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'Idempotency-Key': key },
      body: { order_id: ORDER_ID, amount: 82140, method: 'qris' },
    });
    const res = await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'Idempotency-Key': key },
      body: { order_id: ORDER_ID, amount: 99999, method: 'qris' },
    });
    expect(res.status).toBe(409);
    expect(expectError(res.json).code).toBe('CONFLICT');
  });
});

describe('POST /payments/webhook/:provider — callback gateway', () => {
  it('provider tidak dikenal → 404 NOT_FOUND (allowlist provider aktif)', async () => {
    const res = await srv.request('POST', '/api/v1/payments/webhook/unknown-gateway', {
      body: { transaction_id: 'x' },
    });
    expect(res.status).toBe(404);
    expect(expectError(res.json).code).toBe('NOT_FOUND');
  });

  it('tanpa signature_key → 400 "Missing signature_key" (ditolak sebelum sentuh DB)', async () => {
    const res = await srv.request('POST', '/api/v1/payments/webhook/midtrans', {
      body: { order_id: ORDER_ID, transaction_id: 'trx-1', transaction_status: 'settlement' },
    });
    expect(res.status).toBe(400);
    expect(expectError(res.json).message).toMatch(/Missing signature_key/i);
  });

  it('signature tidak valid → 400 "Invalid signature"', async () => {
    const res = await srv.request('POST', '/api/v1/payments/webhook/midtrans', {
      body: {
        order_id: ORDER_ID,
        status_code: '200',
        gross_amount: GROSS,
        transaction_id: 'trx-1',
        transaction_status: 'settlement',
        signature_key: 'deadbeef',
      },
    });
    expect(res.status).toBe(400);
    expect(expectError(res.json).message).toMatch(/Invalid signature/i);
  });

  it('signature valid tapi order tidak ada → 404 NOT_FOUND', async () => {
    const res = await srv.request('POST', '/api/v1/payments/webhook/midtrans', {
      body: {
        order_id: ORDER_ID,
        status_code: '200',
        gross_amount: GROSS,
        transaction_id: 'trx-1',
        transaction_status: 'settlement',
        signature_key: midtransSign(ORDER_ID, '200', GROSS),
      },
    });
    expect(res.status).toBe(404);
    expect(expectError(res.json).code).toBe('NOT_FOUND');
  });

  it('signature valid + order PENDING → 200 + order PAID + payment paid + log PAID', async () => {
    db.orders.push({ id: ORDER_ID, status: 'PENDING' });
    const res = await srv.request('POST', '/api/v1/payments/webhook/midtrans', {
      body: {
        order_id: ORDER_ID,
        status_code: '200',
        gross_amount: GROSS,
        transaction_id: 'trx-settle-1',
        transaction_status: 'settlement',
        payment_type: 'qris',
        signature_key: midtransSign(ORDER_ID, '200', GROSS),
      },
    });
    expect(res.status).toBe(200);
    expect(expectOk(res.json).received).toBe(true);

    expect(db.payments).toHaveLength(1);
    expect(db.payments[0]).toMatchObject({ order_id: ORDER_ID, status: 'paid', transaction_id: 'trx-settle-1' });
    expect(db.orders[0].status).toBe('PAID');
    expect(db.logs).toHaveLength(1);
    expect(db.logs[0]).toMatchObject({ order_id: ORDER_ID, to_status: 'PAID' });
  });

  it('webhook diulang (transaction_id sama) → idempotent: 1 payment, 1 log', async () => {
    db.orders.push({ id: ORDER_ID, status: 'PENDING' });
    const payload = {
      order_id: ORDER_ID,
      status_code: '200',
      gross_amount: GROSS,
      transaction_id: 'trx-settle-2',
      transaction_status: 'settlement',
      signature_key: midtransSign(ORDER_ID, '200', GROSS),
    };
    const a = await srv.request('POST', '/api/v1/payments/webhook/midtrans', { body: payload });
    const b = await srv.request('POST', '/api/v1/payments/webhook/midtrans', { body: payload });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(db.payments).toHaveLength(1);
    expect(db.logs).toHaveLength(1);
  });
});
