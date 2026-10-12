import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postInitiatePayment } from './orders.js';

/**
 * `postInitiatePayment` — normalisasi kontrak initiate pembayaran.
 *
 * Backend (#7/#18) mengembalikan camelCase (`paymentUrl`/`expiresAt`), tetapi
 * issue #11 & sebagian dokumen menyebut snake_case (`payment_url`/`expires_at`).
 * Kunci perilaku: tautan pembayaran TIDAK boleh kosong pada kedua bentuk.
 */

function stubFetch(data: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data, error: null }),
    } as unknown as Response),
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('postInitiatePayment — normalisasi respons', () => {
  it('bentuk camelCase → paymentUrl & expiresAt terisi', async () => {
    stubFetch({
      paymentId: 'p-1',
      provider: 'midtrans',
      paymentUrl: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/snap-token-123',
      token: 'snap-token-123',
      expiresAt: '2026-10-12T13:02:33.296Z',
    });
    const res = await postInitiatePayment(
      { order_id: 'o-1', amount: 82140, method: 'qris' },
      'o-1:qris:0',
    );
    expect(res.provider).toBe('midtrans');
    expect(res.paymentUrl).toContain('midtrans');
    expect(Number.isNaN(Date.parse(res.expiresAt))).toBe(false);
  });

  it('bentuk snake_case → tetap terpetakan ke paymentUrl & expiresAt', async () => {
    stubFetch({
      order_id: 'o-1',
      provider: 'midtrans',
      payment_url: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/o-1',
      expires_at: '2026-10-12T13:02:33.296Z',
    });
    const res = await postInitiatePayment(
      { order_id: 'o-1', amount: 82140, method: 'qris' },
      'o-1:qris:0',
    );
    expect(res.paymentUrl).toContain('midtrans');
    expect(res.paymentUrl).not.toBe('');
    expect(Number.isNaN(Date.parse(res.expiresAt))).toBe(false);
  });

  it('mengirim header Idempotency-Key pada permintaan', async () => {
    stubFetch({ provider: 'midtrans', paymentUrl: 'https://x', expiresAt: '2026-01-01T00:00:00Z' });
    await postInitiatePayment({ order_id: 'o-1', amount: 82140, method: 'qris' }, 'KEY-123');
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('KEY-123');
  });
});
