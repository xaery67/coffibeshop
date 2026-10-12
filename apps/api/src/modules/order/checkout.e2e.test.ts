import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * cart → checkout END-TO-END dengan Postgres SUNGGUHAN (issue #18 poin 1).
 *
 * Dijalankan hanya bila `QA_TEST_DATABASE_URL` diset (lihat apps/api/test/db.ts).
 * Redis di-mock in-memory (deterministik, tanpa infra Redis). DB yang dipakai
 * adalah DB test yang sudah di-`prisma migrate deploy` (fresh).
 *
 * Membuktikan alur nyata: seed katalog → add ke cart (Redis) → checkout (atomic TX
 * di Postgres) → order + order_items + status log benar-benar tersimpan.
 */

// Redis in-memory (cart = source of truth via Redis, ADR-006).
const h = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock('../../config/redis.js', () => ({
  redisCache: {
    get: async (k: string) => h.store.get(k) ?? null,
    setex: async (k: string, _ttl: number, v: string) => void h.store.set(k, v),
    del: async (k: string) => void h.store.delete(k),
    quit: async () => undefined,
  },
  redisQueue: { quit: async () => undefined },
  // Sprint 4: order.service mem-publish event fan-out (order:created/status/cancelled).
  redisPubSub: { publish: async () => 1 },
  redisSubscriber: { on: () => undefined, subscribe: async () => undefined, unsubscribe: async () => undefined },
  pingRedis: async () => true,
}));
vi.mock('./sse.controller.js', () => ({
  publishOrderEvent: () => undefined,
  streamOrderEvents: () => undefined,
}));

import { hasTestDb, TEST_DB_URL, truncateForTest } from '../../../test/db.js';

// Arahkan Prisma singleton ke DB test SEBELUM modul service diimpor.
if (hasTestDb()) {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.DIRECT_URL = TEST_DB_URL;
}

const run = hasTestDb();

describe.skipIf(!run)('E2E cart → checkout (Postgres nyata)', () => {
  let prisma: any;
  let OrderService: any;
  let outletId: string;
  let categoryId: string;
  let productId: string;
  let variantLargeId: string;
  let optionValueShotId: string;

  beforeAll(async () => {
    const db = await import('../../../test/db.js');
    prisma = await db.makeTestPrisma();
    ({ OrderService } = await import('./order.service.js'));

    await truncateForTest(prisma);

    const outlet = await prisma.outlet.create({
      data: { name: 'QA Outlet', code: 'QA-01', opening_hours: {} },
    });
    outletId = outlet.id;
    const category = await prisma.category.create({
      data: { name: 'Coffee', slug: `coffee-${Date.now()}`, outlet_id: outletId },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: 'Latte',
        slug: `latte-${Date.now()}`,
        base_price: 27000,
        category_id: categoryId,
        outlet_id: outletId,
        variants: {
          create: [
            { name: 'Regular', price_delta: 0, stock_quantity: 100, sort_order: 1 },
            { name: 'Large', price_delta: 5000, stock_quantity: 50, sort_order: 2 },
          ],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantLargeId = product.variants.find((v: any) => v.name === 'Large').id;

    const opt = await prisma.productOption.create({
      data: {
        product_id: productId,
        name: 'Extra Shot',
        option_type: 'single',
        min_select: 0,
        max_select: 1,
        values: { create: [{ value: 'Extra Shot', price_adjustment: 5000, sort_order: 1 }] },
      },
      include: { values: true },
    });
    optionValueShotId = opt.values[0].id;
  });

  /** Buat user member nyata (FK orders_user_id_fkey) & kembalikan id-nya. */
  async function seedUser(n: number): Promise<string> {
    const u = await prisma.user.create({
      data: {
        email: `qa-member-${n}-${Date.now()}@example.com`,
        full_name: `QA Member ${n}`,
        password_hash: 'x',
        role: 'member',
      },
    });
    return u.id;
  }

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(() => h.store.clear());

  it('alur penuh: add 2× (Large+ExtraShot) → checkout → order tersimpan dengan total 82.140', async () => {
    const svc = new OrderService();
    const userId = await seedUser(1);

    const added = await svc.addItem(userId, undefined, {
      product_id: productId,
      variant_id: variantLargeId,
      selected_options: [optionValueShotId],
      quantity: 2,
    });
    expect(added.items[0].unit_price).toBe(37000);
    expect(added.subtotal).toBe(74000);

    const result = await svc.checkout(userId, undefined, {
      fulfillment_type: 'pickup',
      payment_method: 'qris',
    });
    expect(result.status).toBe('PENDING');
    expect(result.tracking_token).toBeTruthy();

    // Verifikasi di DB nyata
    const order = await prisma.order.findUnique({
      where: { id: result.order_id },
      include: { items: true, logs: true },
    });
    expect(order).toBeTruthy();
    expect(Number(order.subtotal)).toBe(74000);
    expect(Number(order.tax)).toBe(8140);
    expect(Number(order.total)).toBe(82140);
    expect(order.items).toHaveLength(1);
    expect(Number(order.items[0].unit_price)).toBe(37000);
    expect(Number(order.items[0].line_total)).toBe(74000);
    expect(order.logs.some((l: any) => l.to_status === 'PENDING')).toBe(true);
  });

  it('checkout mengosongkan cart Redis (cart tidak bisa dipakai dua kali)', async () => {
    const svc = new OrderService();
    const userId = await seedUser(2);
    await svc.addItem(userId, undefined, { product_id: productId, option_ids: [], quantity: 1 });
    await svc.checkout(userId, undefined, { fulfillment_type: 'pickup' });
    const after = await svc.getCart(userId);
    expect(after.items).toHaveLength(0);
  });

  it('delivery menyimpan shipping_fee 10.000', async () => {
    const svc = new OrderService();
    const userId = await seedUser(3);
    await svc.addItem(userId, undefined, { product_id: productId, option_ids: [], quantity: 1 });
    const result = await svc.checkout(userId, undefined, { fulfillment_type: 'delivery' });
    const order = await prisma.order.findUnique({ where: { id: result.order_id } });
    expect(Number(order.shipping_fee)).toBe(10000);
  });

  it('guest checkout menyimpan tracking_token & bisa dilacak via token', async () => {
    const svc = new OrderService();
    const guestId = '44444444-4444-4444-8444-444444444444';
    await svc.addItem(undefined, guestId, { product_id: productId, option_ids: [], quantity: 1 });
    const result = await svc.checkout(undefined, guestId, { fulfillment_type: 'pickup' });
    const tracked = await svc.trackByToken(result.tracking_token);
    expect(tracked.status).toBe('PENDING');
    expect(tracked).not.toHaveProperty('user_id');
  });

  it('updateStatus mempersist status + audit log di DB', async () => {
    const svc = new OrderService();
    const userId = await seedUser(5);
    await svc.addItem(userId, undefined, { product_id: productId, option_ids: [], quantity: 1 });
    const result = await svc.checkout(userId, undefined, { fulfillment_type: 'pickup' });

    await svc.updateStatus(result.order_id, { status: 'PAID' });
    await svc.updateStatus(result.order_id, { status: 'CONFIRMED' });

    const order = await prisma.order.findUnique({ where: { id: result.order_id }, include: { logs: true } });
    expect(order.status).toBe('CONFIRMED');
    expect(order.logs.map((l: any) => l.to_status)).toEqual(
      expect.arrayContaining(['PENDING', 'PAID', 'CONFIRMED']),
    );
  });

  it('cancel customer mempersist status CANCELLED + cancel_reason', async () => {
    const svc = new OrderService();
    const userId = await seedUser(6);
    await svc.addItem(userId, undefined, { product_id: productId, option_ids: [], quantity: 1 });
    const result = await svc.checkout(userId, undefined, { fulfillment_type: 'pickup' });

    const cancelled = await svc.cancel(userId, result.order_id, 'Berubah pikiran');
    expect(cancelled.status).toBe('CANCELLED');
    const order = await prisma.order.findUnique({ where: { id: result.order_id } });
    expect(order.status).toBe('CANCELLED');
    expect(order.cancel_reason).toBe('Berubah pikiran');
  });

  it('produk tidak tersedia di DB → checkout 409 Conflict', async () => {
    const svc = new OrderService();
    const userId = await seedUser(7);
    await svc.addItem(userId, undefined, { product_id: productId, option_ids: [], quantity: 1 });
    await prisma.product.update({ where: { id: productId }, data: { is_available: false } });
    await expect(svc.checkout(userId, undefined, { fulfillment_type: 'pickup' })).rejects.toMatchObject({ status: 409 });
    await prisma.product.update({ where: { id: productId }, data: { is_available: true } });
  });
});
