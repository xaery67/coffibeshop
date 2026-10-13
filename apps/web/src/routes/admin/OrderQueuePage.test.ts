import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderQueuePage } from './OrderQueuePage.js';
import { OutletCtx } from '../../components/admin/AdminShell.js';
import { render, h, waitFor } from '../../test/render.js';

/**
 * OrderQueuePage — papan antrian dari `GET /orders/queue` NYATA (issue #68).
 *
 * Regresi #68: aksi status dulu hanya memunculkan toast tanpa request. Sekarang
 * klik "Konfirmasi" WAJIB memanggil `PUT /orders/{id}/status` (assert di sini).
 */

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return h(
    QueryClientProvider,
    { client: qc },
    h(OutletCtx.Provider, { value: { outletId: 'o1', outletName: 'Pusat' } }, ui),
  );
}

const QUEUE = [
  {
    id: 'q1',
    order_number: 'ORD-1001',
    status: 'PAID',
    outlet_id: 'o1',
    fulfillment_type: 'pickup',
    customer_name: 'Andi',
    total: 32000,
    created_at: new Date().toISOString(),
    items: [{ id: 'i1', product_name: 'Latte', qty: 1, unit_price: 32000, line_total: 32000, options: [] }],
  },
  {
    id: 'q2',
    order_number: 'ORD-1002',
    status: 'READY',
    outlet_id: 'o1',
    fulfillment_type: 'pickup',
    customer_name: 'Budi',
    total: 25000,
    created_at: new Date().toISOString(),
    items: [{ id: 'i2', product_name: 'Americano', qty: 1, unit_price: 25000, line_total: 25000, options: [] }],
  },
];

let calls: { url: string; method: string }[] = [];

beforeEach(() => {
  localStorage.clear();
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({ url, method });
      const data = method === 'GET' ? QUEUE : { id: 'q1', status: 'CONFIRMED' };
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data, error: null }),
      } as unknown as Response;
    }),
  );
  // WebSocket tidak ada di jsdom → hook harus jatuh ke polling tanpa melempar.
  vi.stubGlobal(
    'WebSocket',
    class {
      readyState = 0;
      onopen: (() => void) | null = null;
      onmessage: ((e: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      constructor() {
        setTimeout(() => this.onclose?.(), 0);
      }
      close() {}
    },
  );
});

describe('OrderQueuePage', () => {
  it('menampilkan papan 4 kolom', async () => {
    const r = render(wrap(h(OrderQueuePage, null)));
    await waitFor(() => expect(r.text()).toContain('ORD-1001'));
    expect(r.text()).toContain('Baru');
    expect(r.text()).toContain('Diproses');
    expect(r.text()).toContain('Siap');
    expect(r.text()).toContain('Selesai');
    r.unmount();
  });

  it('menampilkan nomor order & aksi sesuai state machine', async () => {
    const r = render(wrap(h(OrderQueuePage, null)));
    await waitFor(() => expect(r.text()).toContain('ORD-1001'));
    // PAID → aksi Konfirmasi + Batalkan; READY → Selesaikan.
    expect(r.text()).toContain('Konfirmasi');
    expect(r.text()).toContain('Selesaikan');
    r.unmount();
  });

  it('klik "Konfirmasi" benar-benar memanggil PUT /orders/{id}/status (bukan toast palsu)', async () => {
    const r = render(wrap(h(OrderQueuePage, null)));
    await waitFor(() => expect(r.text()).toContain('ORD-1001'));
    const confirm = r.$$('button').find((b) => b.textContent?.includes('Konfirmasi'))!;
    r.clickNode(confirm);
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.url.includes('/orders/q1/status'))).toBe(true));
    r.unmount();
  });
});
