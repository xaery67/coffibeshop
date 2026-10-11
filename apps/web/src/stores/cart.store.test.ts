import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore, buildFingerprint } from './cart.store.js';

const latteLine = {
  product_id: 'p1',
  product_name: 'Latte',
  options: [],
  qty: 1,
  base_price: 27000,
  unit_price: 27000,
};

describe('cart store', () => {
  beforeEach(() => useCartStore.setState({ items: [], fulfillment: 'pickup' }));

  it('menambah item', () => {
    useCartStore.getState().add(latteLine);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].fingerprint).toBe('p1|||');
  });

  it('menghapus item', () => {
    useCartStore.getState().add(latteLine);
    const id = useCartStore.getState().items[0].id;
    useCartStore.getState().remove(id);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('setQty tidak boleh < 1', () => {
    useCartStore.getState().add(latteLine);
    const id = useCartStore.getState().items[0].id;
    useCartStore.getState().setQty(id, 0);
    expect(useCartStore.getState().items[0].qty).toBe(1);
  });

  it('setQty dibatasi maksimal 99', () => {
    useCartStore.getState().add(latteLine);
    const id = useCartStore.getState().items[0].id;
    useCartStore.getState().setQty(id, 500);
    expect(useCartStore.getState().items[0].qty).toBe(99);
  });

  it('line dengan fingerprint identik → qty dijumlahkan (dedupe)', () => {
    useCartStore.getState().add({ ...latteLine, qty: 1 });
    useCartStore.getState().add({ ...latteLine, qty: 2 });
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].qty).toBe(3);
  });

  it('varian berbeda → line terpisah', () => {
    useCartStore.getState().add(latteLine);
    useCartStore.getState().add({
      ...latteLine,
      variant: { variantId: 'v-lrg', name: 'Large', priceAdjustment: 5000 },
      unit_price: 32000,
    });
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('buildFingerprint mengurutkan optionValueIds (urutan klik tidak berpengaruh)', () => {
    const a = buildFingerprint({
      product_id: 'p',
      options: [
        { optionValueId: 'b', name: 'B', priceAdjustment: 0 },
        { optionValueId: 'a', name: 'A', priceAdjustment: 0 },
      ],
    });
    const b = buildFingerprint({
      product_id: 'p',
      options: [
        { optionValueId: 'a', name: 'A', priceAdjustment: 0 },
        { optionValueId: 'b', name: 'B', priceAdjustment: 0 },
      ],
    });
    expect(a).toBe(b);
  });

  it('clear mengosongkan cart', () => {
    useCartStore.getState().add(latteLine);
    useCartStore.getState().clear();
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});
