import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartPage } from './CartPage.js';
import { useCartStore } from '../stores/cart.store.js';
import { render, h, waitFor } from '../test/render.js';

/**
 * CartPage — alur checkout ≤5 langkah (issue #18 poin 2, PRD-FRONTEND §2.3-D).
 * Langkah: (1) lihat item → (2) ubah qty → (3) pilih metode → (4) lihat total → (5) checkout.
 * Harga diambil dari PricingEngine; config (pajak/ongkir) dari GET /config.
 */

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return h(QueryClientProvider, { client: qc }, h(MemoryRouter, null, ui));
}

const latte = {
  product_id: 'p-latte',
  product_name: 'Latte',
  options: [],
  qty: 2,
  base_price: 37000,
  unit_price: 37000,
};

beforeEach(() => {
  localStorage.clear();
  useCartStore.setState({ items: [], fulfillment: 'pickup' });
  // GET /config — dipakai untuk pajak & ongkir.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { tax_rate: 0.11, shipping_flat_fee: 10000, tracking_poll_interval_ms: 3000 },
        error: null,
      }),
    } as unknown as Response),
  );
});

describe('CartPage — langkah 1: item', () => {
  it('keranjang kosong → EmptyState + CTA menu', () => {
    const r = render(wrap(h(CartPage, null)));
    expect(r.text()).toContain('Keranjang masih kosong');
    expect(r.text()).toContain('Lihat Menu');
    r.unmount();
  });

  it('menampilkan item + label varian/opsi/catatan', () => {
    useCartStore.getState().add({
      ...latte,
      variant: { variantId: 'v-l', name: 'Large', priceAdjustment: 5000 },
      options: [{ optionValueId: 'o-shot', name: 'Extra Shot', priceAdjustment: 5000 }],
      note: 'tanpa gula',
      qty: 1,
    });
    const r = render(wrap(h(CartPage, null)));
    expect(r.text()).toContain('Latte');
    expect(r.text()).toContain('Large');
    expect(r.text()).toContain('Extra Shot');
    expect(r.text()).toContain('tanpa gula');
    r.unmount();
  });
});

describe('CartPage — langkah 2: ubah qty', () => {
  it('tombol + stepper menaikkan qty di store', () => {
    useCartStore.getState().add({ ...latte, qty: 1 });
    const r = render(wrap(h(CartPage, null)));
    r.click('[aria-label="Tambah"]');
    expect(useCartStore.getState().items[0].qty).toBe(2);
    r.unmount();
  });

  it('tombol Hapus mengeluarkan item', () => {
    useCartStore.getState().add({ ...latte, qty: 1 });
    const r = render(wrap(h(CartPage, null)));
    const removeBtn = r.$$('button').find((b) => b.textContent === 'Hapus')!;
    r.clickNode(removeBtn);
    expect(useCartStore.getState().items).toHaveLength(0);
    r.unmount();
  });
});

describe('CartPage — langkah 3: metode pengambilan', () => {
  it('merender 3 metode dengan role radio', () => {
    useCartStore.getState().add({ ...latte, qty: 1 });
    const r = render(wrap(h(CartPage, null)));
    const radios = r.$$('[role="radio"]');
    expect(radios.map((x) => x.textContent)).toEqual(['Ambil di outlet', 'Dine-in', 'Delivery']);
    expect(radios[0].getAttribute('aria-checked')).toBe('true'); // default pickup
    r.unmount();
  });

  it('memilih Delivery mengubah fulfillment di store', () => {
    useCartStore.getState().add({ ...latte, qty: 1 });
    const r = render(wrap(h(CartPage, null)));
    const delivery = r.$$('[role="radio"]').find((x) => x.textContent === 'Delivery')!;
    r.clickNode(delivery);
    expect(useCartStore.getState().fulfillment).toBe('delivery');
    r.unmount();
  });
});

describe('CartPage — langkah 4: total (PricingEngine)', () => {
  it('GOLDEN: subtotal 74.000 + pajak 8.140 = total 82.140 (pickup)', async () => {
    useCartStore.getState().add({ ...latte, qty: 2 }); // 2 × 37.000
    const r = render(wrap(h(CartPage, null)));
    await waitFor(() => expect(r.text()).toContain('Rp 82.140'));
    expect(r.text()).toContain('Subtotal');
    expect(r.text()).toContain('Rp 74.000');
    expect(r.text()).toContain('Pajak');
    expect(r.text()).toContain('Rp 8.140');
    r.unmount();
  });

  it('delivery menambahkan ongkir ke total', async () => {
    useCartStore.getState().add({ ...latte, qty: 2 });
    useCartStore.getState().setFulfillment('delivery');
    const r = render(wrap(h(CartPage, null)));
    await waitFor(() => expect(r.text()).toContain('Ongkir'));
    expect(r.text()).toContain('Rp 10.000');
    expect(r.text()).toContain('Rp 92.140'); // 82.140 + 10.000
    r.unmount();
  });
});

describe('CartPage — langkah 5: checkout', () => {
  it('tombol Checkout ada saat cart berisi', () => {
    useCartStore.getState().add({ ...latte, qty: 1 });
    const r = render(wrap(h(CartPage, null)));
    expect(r.$$('button').some((b) => b.textContent?.includes('Checkout'))).toBe(true);
    r.unmount();
  });

  it('tanpa item → tidak ada tombol Checkout', () => {
    const r = render(wrap(h(CartPage, null)));
    expect(r.$$('button').some((b) => b.textContent?.includes('Checkout'))).toBe(false);
    r.unmount();
  });
});
