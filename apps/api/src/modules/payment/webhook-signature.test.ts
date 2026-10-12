import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Webhook signature Midtrans (issue #55, §4.11) — SHA512 **plain** dari body.
 *
 * Midtrans (HTTP notification) mengirim `signature_key` **di body**, bukan header,
 * dengan rumus: sha512(order_id + status_code + gross_amount + ServerKey).
 *
 * Di sini kami memakai **provider Midtrans NYATA** (`MidtransProvider`) — bukan mock —
 * sehingga yang diuji adalah algoritma produksi, termasuk timing-safe compare.
 * Klien Midtrans di-stub agar tidak menyentuh jaringan.
 */

const ENV = vi.hoisted(() => {
  process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-SIGTEST';
  process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-SIGTEST';
  process.env.MIDTRANS_IS_PRODUCTION = 'false';
  return { serverKey: 'SB-Mid-server-SIGTEST' };
});

vi.mock('midtrans-client', () => ({
  default: {
    Snap: class { async createTransaction() { return { token: 't', redirect_url: 'u' }; } },
    CoreApi: class { async getTransactionStatus() { return {}; } },
  },
}));

import { MidtransProvider } from './providers/midtrans.provider.js';

let provider: any;

function sign(orderId: string, statusCode: string, gross: string, serverKey = ENV.serverKey): string {
  return createHash('sha512').update(`${orderId}${statusCode}${gross}${serverKey}`).digest('hex');
}

beforeAll(async () => {
  provider = await MidtransProvider.create();
});

describe('Midtrans verifyWebhook — signature sha512 dari BODY', () => {
  const base = {
    order_id: 'CS-SIG-1',
    status_code: '200',
    gross_amount: '82140.00',
    transaction_id: 'trx-sig-1',
    transaction_status: 'settlement',
    payment_type: 'qris',
  };

  it('signature VALID (sha512 body) → diterima, success=true, status=settlement', () => {
    const payload = { ...base, signature_key: sign(base.order_id, base.status_code, base.gross_amount) };
    const r = provider.verifyWebhook(payload, payload.signature_key);
    expect(r.success).toBe(true);
    expect(r.status).toBe('settlement');
    expect(r.orderId).toBe('CS-SIG-1');
    expect(r.transactionId).toBe('trx-sig-1');
    expect(r.amount).toBe(82140);
  });

  it('TANPA signature_key → 400 Missing signature_key', () => {
    expect(() => provider.verifyWebhook({ ...base }, undefined)).toThrowError(/Missing signature_key/i);
  });

  it('signature TIDAK valid → 400 Invalid signature', () => {
    const payload = { ...base, signature_key: 'a'.repeat(128) };
    expect(() => provider.verifyWebhook(payload, payload.signature_key)).toThrowError(/Invalid signature/i);
  });

  it('signature valid tapi ServerKey berbeda → ditolak (bukti server key ikut di-hash)', () => {
    const wrong = sign(base.order_id, base.status_code, base.gross_amount, 'SB-Mid-server-LAIN');
    const payload = { ...base, signature_key: wrong };
    expect(() => provider.verifyWebhook(payload, payload.signature_key)).toThrowError(/Invalid signature/i);
  });

  it('mengubah gross_amount setelah sign → signature jadi tidak valid', () => {
    const sig = sign(base.order_id, base.status_code, base.gross_amount);
    const tampered = { ...base, gross_amount: '1.00', signature_key: sig };
    expect(() => provider.verifyWebhook(tampered, sig)).toThrowError(/Invalid signature/i);
  });

  it('signature valid tanpa transaction_id → 400 Missing transaction_id', () => {
    const payload: any = { ...base, signature_key: sign(base.order_id, base.status_code, base.gross_amount) };
    delete payload.transaction_id;
    expect(() => provider.verifyWebhook(payload, payload.signature_key)).toThrowError(/Missing transaction_id/i);
  });

  it('capture juga dianggap sukses; deny/cancel/expire tidak', () => {
    const mk = (st: string) => {
      const p = { ...base, transaction_status: st };
      return { ...p, signature_key: sign(p.order_id, p.status_code, p.gross_amount) };
    };
    for (const st of ['capture', 'settlement']) {
      const p = mk(st);
      expect(provider.verifyWebhook(p, p.signature_key).success, st).toBe(true);
    }
    for (const st of ['deny', 'cancel', 'expire', 'failure']) {
      const p = mk(st);
      expect(provider.verifyWebhook(p, p.signature_key).success, st).toBe(false);
    }
  });
});
