import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Payment — REGRESSION GUARD keamanan (issue #18, diperbarui setelah #7 mendarat).
 *
 * Dua kontrol kritis kini NYATA dan diuji di sini:
 *   1. Verifikasi signature webhook  (Midtrans: sha512(order_id+status_code+gross_amount+server_key))
 *   2. Idempotency                    (`Idempotency-Key` untuk initiate; `transaction_id` untuk webhook)
 *
 * Bagian "reference algorithm" RUNNABLE (mengunci algoritma). Bagian route-level
 * memakai HTTP harness offline + provider Midtrans/Prisma di-mock — TIDAK memanggil
 * jaringan nyata. Sebelumnya blok route-level di-`skip` (menunggu gateway); kini aktif.
 *
 * Lihat docs/QA-RELEASE-GATE.md.
 */

// Env kredensial Midtrans diset sebelum env.ts dievaluasi.
const ENV = vi.hoisted(() => {
  process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-TESTKEY';
  process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-TESTKEY';
  process.env.MIDTRANS_IS_PRODUCTION = 'false';
  return { serverKey: 'SB-Mid-server-TESTKEY' };
});

const db = vi.hoisted(() => ({
  payments: [] as any[],
  idempotency: new Map<string, any>(),
  orders: [] as any[],
  logs: [] as any[],
}));

vi.mock('midtrans-client', () => {
  class Snap {
    async createTransaction() {
      return {
        token: 'snap-token-123',
        redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/snap-token-123',
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

// ─────────────────────────── REFERENCE ALGORITHM (runnable) ───────────────────────────

/**
 * Algoritma `signature_key` Midtrans (Core API / webhook HTTP notification).
 * sha512(order_id + status_code + gross_amount + server_key) → hex.
 * gross_amount harus string persis seperti yang dikirim gateway (mis. "82140.00").
 */
export function midtransSignature(input: {
  order_id: string;
  status_code: string;
  gross_amount: string;
  server_key: string;
}): string {
  const raw = `${input.order_id}${input.status_code}${input.gross_amount}${input.server_key}`;
  return createHash('sha512').update(raw).digest('hex');
}

/** Perbandingan konstan-waktu untuk signature/token (anti timing attack). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

describe('REFERENCE: algoritma signature Midtrans (spec untuk implementasi)', () => {
  const fixture = {
    order_id: 'CS-ABC123',
    status_code: '200',
    gross_amount: '82140.00',
    server_key: 'SB-Mid-server-TESTKEY',
  };

  it('menghasilkan hex sha512 dengan panjang 128', () => {
    const sig = midtransSignature(fixture);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
  });

  it('deterministik untuk input identik', () => {
    expect(midtransSignature(fixture)).toBe(midtransSignature({ ...fixture }));
  });

  it('berubah bila salah satu komponen berubah (order_id/status/gross/server key)', () => {
    const base = midtransSignature(fixture);
    expect(midtransSignature({ ...fixture, order_id: 'CS-XYZ' })).not.toBe(base);
    expect(midtransSignature({ ...fixture, status_code: '201' })).not.toBe(base);
    expect(midtransSignature({ ...fixture, gross_amount: '82141.00' })).not.toBe(base);
    expect(midtransSignature({ ...fixture, server_key: 'KEY-LAIN' })).not.toBe(base);
  });

  it('cocok dengan nilai sha512 yang dihitung manual', () => {
    const manual = createHash('sha512')
      .update('CS-ABC123' + '200' + '82140.00' + 'SB-Mid-server-TESTKEY')
      .digest('hex');
    expect(midtransSignature(fixture)).toBe(manual);
  });

  it('safeEqual: true untuk sama, false untuk beda (konstan-waktu)', () => {
    const sig = midtransSignature(fixture);
    expect(safeEqual(sig, sig)).toBe(true);
    expect(safeEqual(sig, sig.slice(0, -1) + '0')).toBe(false);
    expect(safeEqual('pendek', 'jauhlebihpanjang')).toBe(false);
  });
});

// ─────────────────────────── ROUTE-LEVEL REGRESSION GUARD ───────────────────────────

let srv: TestServer;
const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const GROSS = '82140.00';

function sign(orderId: string, statusCode: string, gross: string): string {
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

describe('webhook signature enforcement (Midtrans)', () => {
  it('menolak payload TANPA signature_key → 400 Missing signature_key', async () => {
    const res = await srv.request('POST', '/api/v1/payments/webhook/midtrans', {
      body: { order_id: ORDER_ID, transaction_id: 'trx-x', transaction_status: 'settlement' },
    });
    expect(res.status).toBe(400);
    expect(expectError(res.json).message).toMatch(/Missing signature_key/i);
  });

  it('menolak signature TIDAK valid → 400 Invalid signature', async () => {
    const res = await srv.request('POST', '/api/v1/payments/webhook/midtrans', {
      body: {
        order_id: ORDER_ID,
        status_code: '200',
        gross_amount: GROSS,
        transaction_id: 'trx-x',
        transaction_status: 'settlement',
        signature_key: 'a'.repeat(128),
      },
    });
    expect(res.status).toBe(400);
    expect(expectError(res.json).message).toMatch(/Invalid signature/i);
  });

  it('menerima signature VALID (sha512 server key) → 200', async () => {
    db.orders.push({ id: ORDER_ID, status: 'PENDING' });
    const res = await srv.request('POST', '/api/v1/payments/webhook/midtrans', {
      body: {
        order_id: ORDER_ID,
        status_code: '200',
        gross_amount: GROSS,
        transaction_id: 'trx-valid',
        transaction_status: 'settlement',
        signature_key: sign(ORDER_ID, '200', GROSS),
      },
    });
    expect(res.status).toBe(200);
    expect(expectOk(res.json).received).toBe(true);
  });

  it('Xendit (belum dikonfigurasi) → 404 NOT_FOUND (failover skeleton)', async () => {
    const res = await srv.request('POST', '/api/v1/payments/webhook/xendit', {
      body: { id: 'xnd-1', status: 'PAID' },
      headers: { 'x-callback-token': 'whatever' },
    });
    expect(res.status).toBe(404);
    expect(expectError(res.json).code).toBe('NOT_FOUND');
  });
});

describe('idempotency', () => {
  it('initiate: Idempotency-Key sama + body sama → respons identik (tidak membuat sesi baru)', async () => {
    const key = 'sec-idem-1';
    const body = { order_id: ORDER_ID, amount: 82140, method: 'qris' };
    const a = await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'Idempotency-Key': key },
      body,
    });
    const b = await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'Idempotency-Key': key },
      body,
    });
    expect(a.status).toBe(201);
    expect(expectOk(b.json)).toEqual(expectOk(a.json));
  });

  it('initiate: Idempotency-Key sama + body beda → 409 CONFLICT', async () => {
    const key = 'sec-idem-2';
    await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'Idempotency-Key': key },
      body: { order_id: ORDER_ID, amount: 82140, method: 'qris' },
    });
    const res = await srv.request('POST', '/api/v1/payments/initiate', {
      headers: { 'Idempotency-Key': key },
      body: { order_id: ORDER_ID, amount: 1, method: 'qris' },
    });
    expect(res.status).toBe(409);
    expect(expectError(res.json).code).toBe('CONFLICT');
  });

  it('webhook: transaction_id sama dikirim dua kali → hanya diproses sekali (1 payment, 1 log)', async () => {
    db.orders.push({ id: ORDER_ID, status: 'PENDING' });
    const payload = {
      order_id: ORDER_ID,
      status_code: '200',
      gross_amount: GROSS,
      transaction_id: 'trx-idem-webhook',
      transaction_status: 'settlement',
      signature_key: sign(ORDER_ID, '200', GROSS),
    };
    await srv.request('POST', '/api/v1/payments/webhook/midtrans', { body: payload });
    await srv.request('POST', '/api/v1/payments/webhook/midtrans', { body: payload });
    expect(db.payments).toHaveLength(1);
    expect(db.logs).toHaveLength(1);
  });

  it('webhook: transaction_id sama dengan status berbeda tidak menggandakan efek', async () => {
    db.orders.push({ id: ORDER_ID, status: 'PENDING' });
    const base = {
      order_id: ORDER_ID,
      status_code: '200',
      gross_amount: GROSS,
      transaction_id: 'trx-idem-status',
      signature_key: sign(ORDER_ID, '200', GROSS),
    };
    await srv.request('POST', '/api/v1/payments/webhook/midtrans', {
      body: { ...base, transaction_status: 'settlement' },
    });
    await srv.request('POST', '/api/v1/payments/webhook/midtrans', {
      body: { ...base, transaction_status: 'capture' },
    });
    expect(db.payments).toHaveLength(1);
    expect(db.orders[0].status).toBe('PAID');
  });
});
