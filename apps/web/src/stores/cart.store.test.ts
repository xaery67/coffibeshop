import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from './cart.store.js';

describe('cart store', () => {
  beforeEach(() => useCartStore.setState({ items: [], fulfillment: 'pickup' }));

  it('menambah item', () => {
    useCartStore.getState().add({
      product_id: 'p1', product_name: 'Latte', option_ids: [], qty: 1, unit_price: 27000,
    });
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('menghapus item', () => {
    useCartStore.getState().add({
      product_id: 'p1', product_name: 'Latte', option_ids: [], qty: 1, unit_price: 27000,
    });
    const id = useCartStore.getState().items[0].id;
    useCartStore.getState().remove(id);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('setQty tidak boleh < 1', () => {
    useCartStore.getState().add({
      product_id: 'p1', product_name: 'Latte', option_ids: [], qty: 1, unit_price: 27000,
    });
    const id = useCartStore.getState().items[0].id;
    useCartStore.getState().setQty(id, 0);
    expect(useCartStore.getState().items[0].qty).toBe(1);
  });
});
