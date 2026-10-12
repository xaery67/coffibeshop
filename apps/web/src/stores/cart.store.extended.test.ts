import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore, buildFingerprint } from './cart.store.js';

/**
 * Cart store — perluasan (issue #18 poin 2, PRD-FRONTEND §3.2/§3.8).
 * Melengkapi cart.store.test.ts: fulfillment, dedupe lintas varian/opsi,
 * batas qty, fingerprint, dan persistensi.
 */

const latte = {
  product_id: 'p-latte',
  product_name: 'Latte',
  options: [] as any[],
  qty: 1,
  base_price: 27000,
  unit_price: 27000,
};

beforeEach(() => useCartStore.setState({ items: [], fulfillment: 'pickup' }));

describe('cart store — fulfillment (pickup/delivery/dine_in)', () => {
  it('default pickup', () => {
    expect(useCartStore.getState().fulfillment).toBe('pickup');
  });

  it('setFulfillment mengganti metode pengambilan', () => {
    useCartStore.getState().setFulfillment('delivery');
    expect(useCartStore.getState().fulfillment).toBe('delivery');
    useCartStore.getState().setFulfillment('dine_in');
    expect(useCartStore.getState().fulfillment).toBe('dine_in');
  });

  it('mengubah fulfillment tidak menghapus item', () => {
    useCartStore.getState().add(latte);
    useCartStore.getState().setFulfillment('delivery');
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});

describe('cart store — dedupe & fingerprint', () => {
  it('opsi sama (urutan beda) → satu line, qty dijumlahkan', () => {
    useCartStore.getState().add({
      ...latte,
      options: [
        { optionValueId: 'b', name: 'B', priceAdjustment: 0 },
        { optionValueId: 'a', name: 'A', priceAdjustment: 0 },
      ],
      qty: 1,
    });
    useCartStore.getState().add({
      ...latte,
      options: [
        { optionValueId: 'a', name: 'A', priceAdjustment: 0 },
        { optionValueId: 'b', name: 'B', priceAdjustment: 0 },
      ],
      qty: 2,
    });
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(3);
  });

  it('catatan berbeda → line terpisah (note ikut fingerprint)', () => {
    useCartStore.getState().add({ ...latte, note: 'tanpa gula' });
    useCartStore.getState().add({ ...latte, note: 'extra panas' });
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('catatan sama → digabung', () => {
    useCartStore.getState().add({ ...latte, note: 'panas' });
    useCartStore.getState().add({ ...latte, note: 'panas', qty: 2 });
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].qty).toBe(3);
  });

  it('fingerprint eksplisit dihormati bila disediakan', () => {
    useCartStore.getState().add({ ...latte, fingerprint: 'custom|fp' });
    expect(useCartStore.getState().items[0].fingerprint).toBe('custom|fp');
  });

  it('buildFingerprint menyertakan product|variant|opsi|note', () => {
    const fp = buildFingerprint({
      product_id: 'p1',
      variant: { variantId: 'v1', name: 'L', priceAdjustment: 0 },
      options: [{ optionValueId: 'o1', name: 'O', priceAdjustment: 0 }],
      note: 'n',
    });
    expect(fp).toBe('p1|v1|o1|n');
  });

  it('buildFingerprint tanpa varian/note → bagian kosong', () => {
    expect(buildFingerprint({ product_id: 'p1', options: [] })).toBe('p1|||');
  });
});

describe('cart store — batas qty & dedupe saat add', () => {
  it('qty gabungan dibatasi 99 (add berulang tidak melampaui)', () => {
    useCartStore.getState().add({ ...latte, qty: 60 });
    useCartStore.getState().add({ ...latte, qty: 60 });
    expect(useCartStore.getState().items[0].qty).toBe(99);
  });

  it('setQty ke 0 → dikunci minimal 1', () => {
    useCartStore.getState().add(latte);
    const id = useCartStore.getState().items[0].id;
    useCartStore.getState().setQty(id, 0);
    expect(useCartStore.getState().items[0].qty).toBe(1);
  });

  it('setQty negatif → 1', () => {
    useCartStore.getState().add(latte);
    const id = useCartStore.getState().items[0].id;
    useCartStore.getState().setQty(id, -5);
    expect(useCartStore.getState().items[0].qty).toBe(1);
  });

  it('setQty > 99 → 99', () => {
    useCartStore.getState().add(latte);
    const id = useCartStore.getState().items[0].id;
    useCartStore.getState().setQty(id, 1000);
    expect(useCartStore.getState().items[0].qty).toBe(99);
  });
});

describe('cart store — remove & clear', () => {
  it('remove hanya menghapus id terkait', () => {
    useCartStore.getState().add(latte);
    useCartStore.getState().add({ ...latte, variant: { variantId: 'v2', name: 'L', priceAdjustment: 5000 } });
    const firstId = useCartStore.getState().items[0].id;
    useCartStore.getState().remove(firstId);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].id).not.toBe(firstId);
  });

  it('clear mengosongkan item tapi mempertahankan fulfillment', () => {
    useCartStore.getState().add(latte);
    useCartStore.getState().setFulfillment('delivery');
    useCartStore.getState().clear();
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().fulfillment).toBe('delivery');
  });
});

describe('cart store — persistensi (localStorage)', () => {
  it('menulis state ke key cs.cart', () => {
    useCartStore.getState().add(latte);
    const raw = localStorage.getItem('cs.cart');
    expect(raw).toBeTruthy();
    expect(raw!).toContain('p-latte');
  });
});
