import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * CatalogService — TC-F001-01…-10 (PRD-QA F-001).
 * Prisma & Redis dimock in-memory: tidak menyentuh infra nyata.
 */

// ── State mock ──
const h = vi.hoisted(() => ({
  products: [] as any[],
  categories: [] as any[],
  outlets: [] as any[],
  store: new Map<string, string>(),
  rawResults: [] as any[],
  rawShouldThrow: false,
}));

vi.mock('../../config/redis.js', () => ({
  redisCache: {
    get: async (k: string) => h.store.get(k) ?? null,
    setex: async (k: string, _t: number, v: string) => void h.store.set(k, v),
    del: async (...keys: string[]) => keys.forEach((k) => h.store.delete(k)),
    scanStream: () => {
      // async iterator sederhana atas key yang ada (untuk invalidasi by pattern)
      const keys = [...h.store.keys()];
      return {
        async *[Symbol.asyncIterator]() {
          yield keys;
        },
      };
    },
  },
  redisQueue: { quit: async () => undefined },
  pingRedis: async () => true,
}));

vi.mock('../../config/prisma.js', () => {
  const productInclude = (p: any) => ({
    ...p,
    variants: h.products.length ? (p.variants ?? []) : [],
    options: p.options ?? [],
  });
  const prisma = {
    product: {
      findMany: async ({ where, skip = 0, take = 20 }: any = {}) => {
        let rows = h.products.filter((p) => p.is_active !== false);
        if (where?.is_available) rows = rows.filter((p) => p.is_available !== false);
        if (where?.category_id) rows = rows.filter((p) => p.category_id === where.category_id);
        if (where?.id?.in) rows = rows.filter((p) => where.id.in.includes(p.id));
        return rows.slice(skip, skip + take).map(productInclude);
      },
      findUnique: async ({ where }: any) =>
        h.products.find((p) => p.id === where.id) ?? null,
      count: async ({ where }: any = {}) => {
        let rows = h.products.filter((p) => p.is_active !== false);
        if (where?.is_available) rows = rows.filter((p) => p.is_available !== false);
        if (where?.category_id) rows = rows.filter((p) => p.category_id === where.category_id);
        return rows.length;
      },
      create: async ({ data }: any) => {
        const p = {
          id: `prod-${h.products.length + 1}`,
          is_active: true,
          is_available: true,
          variants: [],
          options: [],
          ...data,
          base_price: data.base_price?.toString?.() ?? data.base_price,
        };
        h.products.push(p);
        return p;
      },
      update: async ({ where, data }: any) => {
        const p = h.products.find((x) => x.id === where.id);
        Object.assign(p, data);
        return p;
      },
    },
    category: {
      findMany: async () => h.categories,
      findUnique: async ({ where }: any) => h.categories.find((c) => c.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const c = { id: `cat-${h.categories.length + 1}`, is_active: true, ...data };
        h.categories.push(c);
        return c;
      },
    },
    outlet: {
      findMany: async () => h.outlets.filter((o) => o.is_active !== false),
      findUnique: async ({ where }: any) => h.outlets.find((o) => o.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const o = { id: `out-${h.outlets.length + 1}`, is_active: true, ...data };
        h.outlets.push(o);
        return o;
      },
      update: async ({ where, data }: any) => {
        const o = h.outlets.find((x) => x.id === where.id);
        Object.assign(o, data);
        return o;
      },
    },
    productVariant: { create: async ({ data }: any) => ({ id: 'v1', ...data }) },
    productOption: {
      findUnique: async ({ where }: any) => ({ id: where.id, product: { id: '11111111-1111-4111-8111-111111111111', outlet_id: 'o1' } }),
      create: async ({ data }: any) => ({ id: 'opt1', values: [], ...data }),
    },
    optionValue: { create: async ({ data }: any) => ({ id: 'val1', ...data }) },
    $queryRaw: async () => {
      if (h.rawShouldThrow) throw new Error('function similarity does not exist');
      return h.rawResults;
    },
  };
  return { prisma };
});

import { CatalogService, sanitizeQuery, haversineKm, isValidUuid } from './catalog.service.js';

const svc = new CatalogService();

beforeEach(() => {
  h.store.clear();
  h.rawResults = [];
  h.rawShouldThrow = false;
  h.categories = [
    { id: 'c1111111-1111-4111-8111-111111111111', name: 'Coffee', slug: 'coffee', sort_order: 1, is_active: true, outlet_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', _count: { products: 3 } },
    { id: 'c2222222-2222-4222-8222-222222222222', name: 'Non-Coffee', slug: 'non-coffee', sort_order: 2, is_active: true, outlet_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', _count: { products: 1 } },
  ];
  h.outlets = [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Pusat', code: 'JKT-PUSAT', is_active: true, latitude: -6.2088, longitude: 106.8456, opening_hours: { mon: '08:00-22:00' } },
    { id: 'out-2', name: 'Bandung', code: 'BDG-01', is_active: true, latitude: -6.9175, longitude: 107.6191, opening_hours: {} },
  ];
  h.products = [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Espresso', slug: 'espresso', base_price: '18000', category_id: 'c1111111-1111-4111-8111-111111111111', outlet_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', is_active: true, is_available: true,
      variants: [{ id: 'v1', name: 'Regular', price_delta: '0', sort_order: 1, is_active: true }], options: [] },
    { id: 'p2', name: 'Cappuccino', slug: 'cappuccino', base_price: '25000', category_id: 'c1111111-1111-4111-8111-111111111111', outlet_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', is_active: true, is_available: true,
      variants: [{ id: 'v2', name: 'Large', price_delta: '5000', sort_order: 2, is_active: true }], options: [] },
    { id: '33333333-3333-4333-8333-333333333333', name: 'Latte', slug: 'latte', base_price: '27000', category_id: 'c1111111-1111-4111-8111-111111111111', outlet_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', is_active: true, is_available: true, variants: [], options: [] },
    { id: '44444444-4444-4444-8444-444444444444', name: 'Matcha Latte', slug: 'matcha-latte', base_price: '30000', category_id: 'c2222222-2222-4222-8222-222222222222', outlet_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', is_active: true, is_available: true, variants: [], options: [] },
    { id: 'p5', name: 'Habis', slug: 'habis', base_price: '10000', category_id: 'c1111111-1111-4111-8111-111111111111', outlet_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', is_active: true, is_available: false, variants: [], options: [] },
  ];
});

// ═══════════ TC-F001-01 · tampil menu default ═══════════
describe('TC-F001-01 — daftar produk default', () => {
  it('hanya produk is_active & is_available yang tampil', async () => {
    const r = await svc.listProducts({});
    expect(r.data.every((p: any) => p.is_active !== false)).toBe(true);
    // tanpa filter available → produk habis tetap tampil (badge "Habis" di FE)
    expect(r.data.map((p: any) => p.name)).toContain('Habis');
  });

  it('mengembalikan meta paginasi', async () => {
    const r = await svc.listProducts({ page: 1, limit: 2 });
    expect(r.meta).toMatchObject({ page: 1, limit: 2, total: 5, total_pages: 3 });
    expect(r.data).toHaveLength(2);
  });

  it('harga Decimal diserialisasi jadi number', async () => {
    const r = await svc.listProducts({});
    for (const p of r.data) expect(typeof p.base_price).toBe('number');
  });

  it('filter available=true membuang produk habis (TC-F001-07)', async () => {
    const r = await svc.listProducts({ available: 'true' });
    expect(r.data.map((p: any) => p.name)).not.toContain('Habis');
  });
});

// ═══════════ TC-F001-02 · filter kategori ═══════════
describe('TC-F001-02 — filter kategori', () => {
  it('hanya produk kategori terpilih', async () => {
    const r = await svc.listProducts({ category_id: 'c2222222-2222-4222-8222-222222222222' });
    expect(r.data).toHaveLength(1);
    expect(r.data[0].name).toBe('Matcha Latte');
  });

  it('kategori menyertakan product_count untuk badge', async () => {
    const cats = await svc.categories();
    const coffee = cats.find((c: any) => c.slug === 'coffee');
    expect(coffee.product_count).toBe(3);
    expect(coffee).not.toHaveProperty('_count');
  });
});

// ═══════════ TC-F001-03 · pencarian (pg_trgm) ═══════════
describe('TC-F001-03 — pencarian', () => {
  it('memakai pg_trgm (similarity) dan mengembalikan hasil relevan', async () => {
    h.rawResults = [{ id: '33333333-3333-4333-8333-333333333333' }, { id: '44444444-4444-4444-8444-444444444444' }]; // Latte, Matcha Latte
    const r = await svc.listProducts({ q: 'lat' });
    expect(r.data.map((p: any) => p.name)).toEqual(['Latte', 'Matcha Latte']);
    expect(r.meta.query).toBe('lat');
  });

  it('menyimpan query asli (ter-sanitasi) di meta', async () => {
    h.rawResults = [{ id: '33333333-3333-4333-8333-333333333333' }];
    const r = await svc.listProducts({ q: '  lat  ' });
    expect(r.meta.query).toBe('lat');
  });

  it('fallback ke ILIKE bila pg_trgm tidak tersedia', async () => {
    h.rawShouldThrow = true;
    const r = await svc.listProducts({ q: 'Latte' });
    expect(r.data.map((p: any) => p.name)).toContain('Latte');
  });
});

// ═══════════ TC-F001-05 · pencarian tanpa hasil ═══════════
describe('TC-F001-05 — pencarian tanpa hasil', () => {
  it('mengembalikan array kosong + total 0 (bukan error)', async () => {
    h.rawResults = [];
    const r = await svc.listProducts({ q: 'xyzabc' });
    expect(r.data).toEqual([]);
    expect(r.meta.total).toBe(0);
  });
});

// ═══════════ TC-F001-08 · produk dinonaktifkan ═══════════
describe('TC-F001-08 — produk dinonaktifkan → 404 ramah', () => {
  it('product() melempar 404 untuk produk nonaktif', async () => {
    h.products[0].is_active = false;
    await expect(svc.product('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({ status: 404 });
  });

  it('product() 404 untuk id tidak ada', async () => {
    await expect(svc.product('tidak-ada')).rejects.toMatchObject({ status: 404 });
  });

  it('produk nonaktif hilang dari daftar', async () => {
    h.products[0].is_active = false;
    const r = await svc.listProducts({});
    expect(r.data.map((p: any) => p.id)).not.toContain('11111111-1111-4111-8111-111111111111');
  });
});

// ═══════════ TC-F001-09 · anti-injeksi ═══════════
describe('TC-F001-09 — sanitasi input pencarian', () => {
  it('membuang wildcard SQL % _ dan backslash', () => {
    expect(sanitizeQuery('100%')).toBe('100');
    expect(sanitizeQuery('a_b')).toBe('a b');
    expect(sanitizeQuery('x\\y')).toBe('x y');
  });

  it('SQLi klasik jadi string biasa (tidak ada wildcard berbahaya)', () => {
    const out = sanitizeQuery("' OR 1=1 --");
    expect(out).toBe("' OR 1=1 --"); // tetap dikirim sebagai parameter, bukan SQL
    expect(out).not.toContain('%');
  });

  it('membuang karakter kontrol & batasi panjang 100', () => {
    expect(sanitizeQuery('ab\u0000cd')).toBe('abcd');
    expect(sanitizeQuery('a'.repeat(200))!.length).toBe(100);
  });

  it('string kosong / spasi → undefined', () => {
    expect(sanitizeQuery('')).toBeUndefined();
    expect(sanitizeQuery('   ')).toBeUndefined();
    expect(sanitizeQuery('%_')).toBeUndefined();
    expect(sanitizeQuery(undefined)).toBeUndefined();
  });
});

// ═══════════ Cache Redis (AC: cache + invalidasi) ═══════════
describe('Cache katalog', () => {
  it('listProducts menyimpan hasil ke Redis dengan key catalog:products:*', async () => {
    await svc.listProducts({ category_id: 'c1111111-1111-4111-8111-111111111111' });
    const keys = [...h.store.keys()].filter((k) => k.startsWith('catalog:products:'));
    expect(keys.length).toBe(1);
  });

  it('panggilan kedua dilayani cache (tanpa query DB ulang)', async () => {
    const r1 = await svc.listProducts({ category_id: 'c1111111-1111-4111-8111-111111111111' });
    // ubah data di "DB" — cache harus tetap mengembalikan hasil lama
    h.products = [];
    const r2 = await svc.listProducts({ category_id: 'c1111111-1111-4111-8111-111111111111' });
    expect(r2.data).toEqual(r1.data);
  });

  it('product() memakai key catalog:product:{id}', async () => {
    await svc.product('11111111-1111-4111-8111-111111111111');
    expect(h.store.has('catalog:product:11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('menu() memakai key menu:{outlet_id} (TTL 5m)', async () => {
    const m = await svc.menu('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(h.store.has('menu:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(true);
    expect(m.outlet_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(m).toHaveProperty('categories');
    expect(m).toHaveProperty('products');
  });

  it('update produk menginvalidasi cache (AC invalidasi saat update)', async () => {
    await svc.product('11111111-1111-4111-8111-111111111111');
    expect(h.store.has('catalog:product:11111111-1111-4111-8111-111111111111')).toBe(true);
    await svc.updateProduct('11111111-1111-4111-8111-111111111111', { base_price: 20000 });
    expect(h.store.has('catalog:product:11111111-1111-4111-8111-111111111111')).toBe(false);
  });

  it('createProduct menginvalidasi cache katalog', async () => {
    await svc.listProducts({});
    const before = [...h.store.keys()].filter((k) => k.startsWith('catalog:')).length;
    await svc.createProduct({ name: 'Baru', base_price: 10000, category_id: 'c1111111-1111-4111-8111-111111111111', outlet_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    const after = [...h.store.keys()].filter((k) => k.startsWith('catalog:')).length;
    expect(after).toBeLessThan(before);
  });

  it('cache rusak / Redis error → fallback ke DB tanpa melempar', async () => {
    h.store.set('catalog:products:-|-|-|0|1|20', 'bukan-json{{{');
    const r = await svc.listProducts({});
    expect(Array.isArray(r.data)).toBe(true);
  });
});

// ═══════════ Outlet ═══════════
describe('Outlet — daftar & jarak', () => {
  it('daftar outlet aktif', async () => {
    const o = await svc.outlets();
    expect(o).toHaveLength(2);
  });

  it('urut berdasarkan jarak bila lat/lng diberikan', async () => {
    const o = await svc.outlets({ lat: -6.2, lng: 106.8, radius: 100 });
    expect(o[0].code).toBe('JKT-PUSAT');
    expect(typeof o[0].distance_km).toBe('number');
  });

  it('radius menyaring outlet yang jauh', async () => {
    // Pusat ≈5,1 km dari titik uji → radius 10 km hanya menyisakan Pusat.
    const o = await svc.outlets({ lat: -6.2, lng: 106.8, radius: 10 });
    expect(o.map((x: any) => x.code)).toEqual(['JKT-PUSAT']);
  });

  it('radius lebih kecil dari jarak → hasil kosong', async () => {
    const o = await svc.outlets({ lat: -6.2, lng: 106.8, radius: 2 });
    expect(o).toEqual([]);
  });

  it('detail outlet menyertakan opening_hours', async () => {
    const o = await svc.outlet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(o.opening_hours.mon).toBe('08:00-22:00');
  });

  it('outlet nonaktif → 404', async () => {
    h.outlets[0].is_active = false;
    await expect(svc.outlet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).rejects.toMatchObject({ status: 404 });
  });

  it('haversine: jarak Jakarta–Bandung ≈ 120 km', () => {
    const d = haversineKm(-6.2088, 106.8456, -6.9175, 107.6191);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(140);
  });
});

// ═══════════ Validasi UUID (anti 500) ═══════════
describe('isValidUuid & guard id', () => {
  it('menerima UUID v4 valid', () => {
    expect(isValidUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isValidUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('menolak string non-UUID', () => {
    for (const v of ['tidak-ada', '123', '', null, undefined, 42, 'xxx-yyy']) {
      expect(isValidUuid(v)).toBe(false);
    }
  });

  it('product() dengan id non-UUID → 404 (bukan 500)', async () => {
    await expect(svc.product('tidak-ada')).rejects.toMatchObject({ status: 404 });
  });

  it('outlet() dengan id non-UUID → 404 (bukan 500)', async () => {
    await expect(svc.outlet('tidak-ada')).rejects.toMatchObject({ status: 404 });
  });

  it('createProduct dengan category_id non-UUID → 400 (bukan 500)', async () => {
    await expect(
      svc.createProduct({ name: 'X', base_price: 1000, category_id: 'tidak-ada' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ═══════════ Admin CRUD ═══════════
describe('Admin katalog', () => {
  it('createProduct butuh category_id valid (400)', async () => {
    await expect(
      svc.createProduct({ name: 'X', base_price: 1000, category_id: 'tidak-ada' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('createProduct butuh name & base_price (400)', async () => {
    await expect(svc.createProduct({ category_id: 'c1111111-1111-4111-8111-111111111111' })).rejects.toMatchObject({ status: 400 });
  });

  it('updateProduct 404 untuk produk tak ada', async () => {
    await expect(svc.updateProduct('hantu', { name: 'X' })).rejects.toMatchObject({ status: 404 });
  });

  it('deleteProduct = soft delete (is_active=false)', async () => {
    const r = await svc.deleteProduct('11111111-1111-4111-8111-111111111111');
    expect(r.is_active).toBe(false);
    expect(h.products.find((p) => p.id === '11111111-1111-4111-8111-111111111111').is_active).toBe(false);
  });

  it('createVariant butuh produk yang ada (404)', async () => {
    await expect(svc.createVariant('hantu', { name: 'L' })).rejects.toMatchObject({ status: 404 });
  });

  it('createCategory butuh name & slug (400)', async () => {
    await expect(svc.createCategory({ name: 'X' })).rejects.toMatchObject({ status: 400 });
  });

  it('createOutlet butuh name & code (400)', async () => {
    await expect(svc.createOutlet({ name: 'X' })).rejects.toMatchObject({ status: 400 });
  });

  it('invalidate() mengosongkan cache katalog', async () => {
    await svc.listProducts({});
    await svc.outlets();
    await svc.invalidate();
    const left = [...h.store.keys()].filter((k) => k.startsWith('catalog:') || k.startsWith('menu:'));
    expect(left).toHaveLength(0);
  });
});
