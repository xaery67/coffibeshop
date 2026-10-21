import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PaymentPage } from './PaymentPage.js';
import { render, h, waitFor } from '../test/render.js';

/**
 * PaymentPage — REGRESI bug "UI tidak ter-update setelah pembayaran".
 *
 * Gejala: setelah bayar sukses, klik "Cek status pembayaran" hanya memunculkan
 * notifikasi "terkonfirmasi" tapi badge tetap "Menunggu pembayaran…" karena
 * `checkStatus` tidak menyegarkan state tracking.
 *
 * Kontrak yang diuji: begitu `POST /payments/:id/verify` bilang `paid`, halaman
 * HARUS menampilkan "Pembayaran berhasil" (bukan hanya toast).
 */

const ORDER_ID = 'ord-pay-1';
const TRACKING_TOKEN = 'tok-pay-1';

const SESSION_KEY = `cs.pay.${ORDER_ID}`;

/** EventSource tiruan (jsdom tidak punya) — tidak memicu apa pun, cukup diam. */
class MockEventSource {
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener() {}
  close() {}
}

/**
 * `fetch` tiruan yang membedakan endpoint:
 *  - GET  /orders/track/:token        → status order (untuk tracking)
 *  - POST /payments/:id/verify        → hasil verifikasi gateway
 *  - GET  /config                     → config publik
 *
 * `statusState.value` mensimulasikan perubahan status di server: awalnya PENDING,
 * setelah verify menjadi PAID (persis seperti backend menandai order PAID).
 */
function makeFetch(statusState: { value: string }, verifyResult: any) {
  return vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const json = (data: any) => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data, error: null }),
    });

    if (url.includes('/payments/') && url.endsWith('/verify') && method === 'POST') {
      // Begitu verify dipanggil, server menganggap order sudah PAID.
      if (verifyResult.status === 'paid') statusState.value = 'PAID';
      return json(verifyResult);
    }
    if (url.includes('/orders/track/')) {
      return json({ status: statusState.value, estimated_ready_time: null, updated_at: new Date().toISOString() });
    }
    if (url.endsWith('/config')) {
      return json({ active_payment_methods: ['qris', 'gopay'], tax_rate: 0.1 });
    }
    if (url.includes('/payments/initiate')) {
      return json({ paymentId: 'p1', provider: 'midtrans', paymentUrl: 'https://x.test/pay', expiresAt: '' });
    }
    return json({});
  });
}

function renderPayment() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    h(
      QueryClientProvider,
      { client: qc },
      h(
        MemoryRouter,
        { initialEntries: [`/payment/${ORDER_ID}`] },
        h(Routes, null, h(Route, { path: '/payment/:orderId', element: h(PaymentPage, null) })),
      ),
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('EventSource', MockEventSource as any);
  // Ringkasan pembayaran yang biasanya dioper via location.state.
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      orderNumber: 'CS-TEST1',
      trackingToken: TRACKING_TOKEN,
      amount: 24420,
      method: 'qris',
      contact: { full_name: 'QA', phone: '08123' },
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PaymentPage — cek status pembayaran', () => {
  it('setelah verify bilang paid → UI berubah ke "Pembayaran berhasil" (bukan hanya toast)', async () => {
    const statusState = { value: 'PENDING' };
    vi.stubGlobal('fetch', makeFetch(statusState, { order_id: ORDER_ID, status: 'paid', provider: 'midtrans', order_status: 'PAID' }));

    const r = renderPayment();

    // Tunggu halaman menampilkan status awal "Menunggu pembayaran…"
    await waitFor(() => expect(r.text()).toContain('Menunggu pembayaran'));

    // Tombol "Cek status pembayaran" ada (hanya muncul bila initiate selesai).
    await waitFor(() => expect(r.text()).toContain('Cek status pembayaran'));

    // Klik tombol cek status.
    const btn = r.$$('button').find((b) => b.textContent?.includes('Cek status pembayaran'));
    expect(btn).toBeTruthy();
    r.clickNode(btn!);

    // INTI REGRESI: UI harus berubah ke status berhasil, bukan cuma toast.
    await waitFor(() => expect(r.text()).toContain('Pembayaran berhasil'));
    expect(r.text()).not.toContain('Menunggu pembayaran');
    r.unmount();
  });

  it('verify bilang pending → UI tetap "Menunggu pembayaran…"', async () => {
    const statusState = { value: 'PENDING' };
    vi.stubGlobal('fetch', makeFetch(statusState, { order_id: ORDER_ID, status: 'pending', provider: 'midtrans', order_status: 'PENDING' }));

    const r = renderPayment();
    await waitFor(() => expect(r.text()).toContain('Cek status pembayaran'));

    const btn = r.$$('button').find((b) => b.textContent?.includes('Cek status pembayaran'));
    r.clickNode(btn!);

    await waitFor(() => expect(r.text()).toContain('Pembayaran belum terdeteksi'));
    expect(r.text()).toContain('Menunggu pembayaran');
    r.unmount();
  });
});
