import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * cart.service — unit test (issue #18, PRD-QA F-003/F-006).
 * Redis & Prisma di-mock in-memory → deterministik & offline.
 *
 * Golden pricing (kontrak repo): Latte 27.000 → Large 32.000 → +Extra Shot 37.000;
 * cart 2× = Subtotal 74.000 + Pajak 8.140 = Total 82.140.
 */

const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  products: [] as any[],
}));

vi.mock('../../config/redis.js', () => ({
  redisCache: {
    get: async (k: string) => h.store.get(k) ?? null,
    setex: async (k: string, _ttl: number, v: string) => void h.store.set(k, v),
    del: async (k: string) => void h.store.delete(k),
    quit: async () => undefined,
  },
  redisQueue: { quit: async () => undefined },
  pingRedis: async () => true,
}));

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    product: {
      findMany: async ({ where }: any = {}) => {
        const ids: string[] = where?.id?.in ?? [];
        return h.products.filter((p) => ids.includes(p.id));
      },
    },
  },
}));

import {
  normalizeCartItemInput,
  readCart,
  writeCart,
  readCartMeta,
  writeCartMeta,
  clearCartMeta,
  priceCart,
  cartKeyFor,
  mergeGuestCart,
  memberKey,
  guestKey,
} from './cart.service.js';

/** Fixture produk Latte (Large +5000, Extra Shot +5000) sesuai seed. */
const LATTE = {
  id: 'p-latte',
  name: 'Latte',
  base_price: '27000',
  is_active: true,
  is_available: true,
  variants: [
    { id: 'v-reg', name: 'Regular', price_delta: '0', stock_quantity: 100 },
    { id: 'v-lrg', name: 'Large', price_delta: '5000', stock_quantity: 50 },
    { id: 'v-habis', name: 'Sold Out', price_delta: '0', stock_quantity: 0 },
  ],
  options: [
    {
      id: 'opt-shot',
      values: [
        { id: 'shot-no', value: 'Tanpa Extra Shot', price_adjustment: '0' },
        { id: 'shot-yes', value: 'Extra Shot', price_adjustment: '5000' },
      ],
    },
  ],
};

beforeEach(() => {
  h.store.clear();
  h.products = [LATTE];
});

describe('normalizeCartItemInput — toleran dua nama field (PRD vs FE)', () => {
  it('menerima selected_options & quantity (nama PRD)', () => {
    const r = normalizeCartItemInput({ product_id: 'p1', selected_options: ['a'], quantity: 2 });
    expect(r).toEqual({ product_id: 'p1', variant_id: null, option_ids: ['a'], qty: 2, notes: undefined });
  });

  it('menerima option_ids & qty (nama FE)', () => {
    const r = normalizeCartItemInput({ product_id: 'p1', option_ids: ['b'], qty: 3 });
    expect(r.option_ids).toEqual(['b']);
    expect(r.qty).toBe(3);
  });

  it('default: option_ids [] & qty 1', () => {
    const r = normalizeCartItemInput({ product_id: 'p1' });
    expect(r.option_ids).toEqual([]);
    expect(r.qty).toBe(1);
  });
});

describe('cartKeyFor — Redis key member vs guest (ADR-006)', () => {
  it('member bila ada userId', () => {
    expect(cartKeyFor('u1', 'g1')).toBe('cart:member:u1');
  });
  it('guest bila hanya guestId', () => {
    expect(cartKeyFor(undefined, 'g1')).toBe('cart:guest:g1');
  });
  it('tanpa keduanya → BadRequest 400', () => {
    expect(() => cartKeyFor(undefined, undefined)).toThrow(/X-Guest-Id|autentikasi/i);
    try {
      cartKeyFor();
    } catch (e: any) {
      expect(e.status).toBe(400);
    }
  });
});

describe('read/write cart + meta (Redis source of truth)', () => {
  it('write lalu read mengembalikan item yang sama', async () => {
    const key = memberKey('u1');
    await writeCart(key, [{ id: 'i1', product_id: 'p1', qty: 1, option_ids: [] }]);
    const items = await readCart(key);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('i1');
  });

  it('read cart kosong → []', async () => {
    expect(await readCart(memberKey('nobody'))).toEqual([]);
  });

  it('meta cart (voucher/points) tersimpan terpisah dari items', async () => {
    const key = memberKey('u1');
    await writeCartMeta(key, { voucher_code: 'WELCOME10', discount: 10000, points_to_redeem: 50, points_discount: 50 });
    const meta = await readCartMeta(key);
    expect(meta?.voucher_code).toBe('WELCOME10');
    expect(meta?.discount).toBe(10000);
    await clearCartMeta(key);
    expect(await readCartMeta(key)).toBeNull();
  });
});

describe('priceCart — pricing server-side (golden)', () => {
  it('Latte Large + Extra Shot ×1 = unit 37.000, subtotal 37.000', async () => {
    const r = await priceCart([{ product_id: 'p-latte', variant_id: 'v-lrg', option_ids: ['shot-yes'], qty: 1 }]);
    expect(r.items[0].unit_price).toBe(37000);
    expect(r.subtotal).toBe(37000);
  });

  it('GOLDEN: 2× (Large + Extra Shot) → Subtotal 74.000 + Pajak 8.140 = Total 82.140', async () => {
    const r = await priceCart([{ product_id: 'p-latte', variant_id: 'v-lrg', option_ids: ['shot-yes'], qty: 2 }]);
    expect(r.subtotal).toBe(74000);
    expect(r.tax).toBe(8140); // round(74000 × 0.11)
    expect(r.total).toBe(82140);
  });

  it('tanpa varian/opsi = base_price', async () => {
    const r = await priceCart([{ product_id: 'p-latte', option_ids: [], qty: 1 }]);
    expect(r.items[0].unit_price).toBe(27000);
  });

  it('produk tidak aktif/tidak tersedia → ditandai unavailable, tidak dihitung', async () => {
    h.products = [{ ...LATTE, is_available: false }];
    const r = await priceCart([{ product_id: 'p-latte', option_ids: [], qty: 1 }]);
    expect(r.items[0].unavailable).toBe(true);
    expect(r.subtotal).toBe(0);
  });

  it('produk tidak ada di DB → unavailable', async () => {
    const r = await priceCart([{ product_id: 'tidak-ada', option_ids: [], qty: 1 }]);
    expect(r.items[0].unavailable).toBe(true);
    expect(r.items[0].unavailable_reason).toMatch(/tidak tersedia/i);
  });

  it('stok varian 0 → unavailable (varian habis)', async () => {
    const r = await priceCart([{ product_id: 'p-latte', variant_id: 'v-habis', option_ids: [], qty: 1 }]);
    expect(r.items[0].unavailable).toBe(true);
    expect(r.items[0].unavailable_reason).toMatch(/habis/i);
  });

  it('opsi bukan milik produk → unavailable (anti-manipulasi harga)', async () => {
    const r = await priceCart([{ product_id: 'p-latte', option_ids: ['opsi-produk-lain'], qty: 1 }]);
    expect(r.items[0].unavailable).toBe(true);
    expect(r.items[0].unavailable_reason).toMatch(/opsi tidak valid/i);
  });

  it('diskon voucher mengurangi taxable sebelum pajak', async () => {
    const r = await priceCart([{ product_id: 'p-latte', variant_id: 'v-lrg', option_ids: ['shot-yes'], qty: 2 }], {
      discount: 10000,
    });
    // taxable = 74000 - 10000 = 64000 → tax = 7040
    expect(r.tax).toBe(7040);
    expect(r.total).toBe(64000 + 7040);
    expect(r.discount).toBe(10000);
  });

  it('ongkir flat hanya saat opts.shipping diisi (delivery)', async () => {
    const r = await priceCart([{ product_id: 'p-latte', option_ids: [], qty: 1 }], { shipping: 10000 });
    expect(r.shipping_fee).toBe(10000);
    expect(r.total).toBe(27000 + 2970 + 10000);
  });

  it('diskon > subtotal → taxable 0, total tidak negatif', async () => {
    const r = await priceCart([{ product_id: 'p-latte', option_ids: [], qty: 1 }], { discount: 999999 });
    expect(r.tax).toBe(0);
    expect(r.total).toBe(0);
  });
});

describe('mergeGuestCart — idempotent by fingerprint (ADR-011)', () => {
  const guestLine = { id: 'g1', product_id: 'p-latte', variant_id: 'v-lrg', option_ids: ['shot-yes'], qty: 1 };

  it('guest kosong → false (tidak ada yang digabung)', async () => {
    const merged = await mergeGuestCart('u1', 'guest-1');
    expect(merged).toBe(false);
  });

  it('tanpa guestId → false', async () => {
    expect(await mergeGuestCart('u1', '')).toBe(false);
  });

  it('menggabungkan cart guest ke member & menghapus key guest', async () => {
    await writeCart(guestKey('guest-1'), [guestLine]);
    const merged = await mergeGuestCart('u1', 'guest-1');
    expect(merged).toBe(true);
    expect(await readCart(memberKey('u1'))).toHaveLength(1);
    expect(await readCart(guestKey('guest-1'))).toEqual([]); // key guest dihapus
  });

  it('IDEMPOTENT: merge kedua kali tidak menggandakan qty (guest sudah kosong)', async () => {
    await writeCart(guestKey('guest-1'), [{ ...guestLine, qty: 2 }]);
    await mergeGuestCart('u1', 'guest-1');
    const firstQty = (await readCart(memberKey('u1')))[0].qty;
    const second = await mergeGuestCart('u1', 'guest-1'); // guest kosong → false
    expect(second).toBe(false);
    expect((await readCart(memberKey('u1')))[0].qty).toBe(firstQty);
  });

  it('fingerprint sama → qty dijumlahkan (bukan duplikat line)', async () => {
    await writeCart(memberKey('u1'), [{ ...guestLine, id: 'm1', qty: 1 }]);
    await writeCart(guestKey('guest-2'), [{ ...guestLine, id: 'g2', qty: 3 }]);
    await mergeGuestCart('u1', 'guest-2');
    const items = await readCart(memberKey('u1'));
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(4);
  });

  it('fingerprint berbeda → line terpisah', async () => {
    await writeCart(memberKey('u1'), [{ ...guestLine, id: 'm1', qty: 1 }]);
    await writeCart(guestKey('guest-3'), [{ ...guestLine, id: 'g2', variant_id: 'v-reg', qty: 1 }]);
    await mergeGuestCart('u1', 'guest-3');
    expect(await readCart(memberKey('u1'))).toHaveLength(2);
  });

  it('urutan option_ids tidak memengaruhi fingerprint (dedupe stabil)', async () => {
    await writeCart(memberKey('u1'), [{ id: 'm1', product_id: 'p-latte', variant_id: null, option_ids: ['a', 'b'], qty: 1 }]);
    await writeCart(guestKey('guest-4'), [{ id: 'g2', product_id: 'p-latte', variant_id: null, option_ids: ['b', 'a'], qty: 2 }]);
    await mergeGuestCart('u1', 'guest-4');
    const items = await readCart(memberKey('u1'));
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(3);
  });
});
