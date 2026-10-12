import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * E2E HAPPY PATH Sprint 4 (issue #55, §4.9) — dengan Postgres SUNGGUHAN.
 *
 * Dijalankan hanya bila `QA_TEST_DATABASE_URL` diset (lihat apps/api/test/db.ts).
 * Redis & SSE di-mock in-memory (deterministik, tanpa infra tambahan).
 *
 * Alur yang dibuktikan:
 *   1. GUEST  : add item → checkout → tracking_token → track publik (tanpa user_id)
 *   2. MEMBER : poin loyalty (earned) → checkout → order PAID → poin redeemed tercatat
 *   3. STAFF  : state machine PENDING→PAID→CONFIRMED (trigger inventori) → READY→COMPLETED
 *   4. INVENTORY: CONFIRMED mengurangi stok + inventory_logs; stok kurang → 409
 *
 * Membuktikan integrasi NYATA: cart (Redis-mock) → order (Postgres TX) → trigger PG
 * → loyalty ledger.
 */

const h = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock('../../config/redis.js', () => ({
  redisCache: {
    get: async (k: string) => h.store.get(k) ?? null,
    setex: async (k: string, _ttl: number, v: string) => void h.store.set(k, v),
    del: async (k: string) => void h.store.delete(k),
    quit: async () => undefined,
  },
  redisQueue: { quit: async () => undefined },
  redisPubSub: { publish: async () => 1 },
  redisSubscriber: { on: () => undefined, subscribe: async () => undefined, unsubscribe: async () => undefined },
  pingRedis: async () => true,
}));
vi.mock('./sse.controller.js', () => ({
  publishOrderEvent: () => undefined,
  streamOrderEvents: () => undefined,
}));

import { hasTestDb, provisionTempDb, teardownTempDb } from '../../../test/db.js';

const run = hasTestDb();

describe.skipIf(!run)('E2E Sprint 4 — guest/member/staff happy path (Postgres nyata, DB terisolasi)', () => {
  let prisma: any;
  let OrderService: any;
  let LoyaltyService: any;
  let temp: any;
  let outletId: string;
  let productId: string;
  let variantLargeId: string;
  let invItemId: string;

  beforeAll(async () => {
    // DB SEMENTARA sendiri → tidak berbagi tabel dengan checkout.e2e.test.ts
    // (aman paralel; lihat catatan isolasi di test/db.ts).
    temp = await provisionTempDb('cb_qa_s4');
    prisma = temp.prisma;
    process.env.DATABASE_URL = temp.url;
    process.env.DIRECT_URL = temp.url;

    ({ OrderService } = await import('./order.service.js'));
    ({ LoyaltyService } = await import('../loyalty/loyalty.service.js'));

    const outlet = await prisma.outlet.create({
      data: { name: 'QA S4 Outlet', code: `QA-S4-${Date.now()}`, opening_hours: {} },
    });
    outletId = outlet.id;

    const category = await prisma.category.create({
      data: { name: 'Coffee', slug: `coffee-s4-${Date.now()}`, outlet_id: outletId },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Latte',
        slug: `latte-s4-${Date.now()}`,
        base_price: 27000,
        category_id: category.id,
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

    // Inventori + BOM: 1 Latte = 0.1 kg biji kopi (agar deduksi terlihat: 10 → 9.9).
    const inv = await prisma.inventoryItem.create({
      data: { outlet_id: outletId, name: 'Biji Kopi', unit: 'kg', quantity: 10, min_stock: 2 },
    });
    invItemId = inv.id;
    await prisma.productBOM.create({
      data: { product_id: productId, inventory_item_id: invItemId, quantity: 0.1, unit: 'kg' },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await teardownTempDb(temp);
  });

  beforeEach(() => h.store.clear());

  async function seedUser(role = 'member'): Promise<string> {
    const u = await prisma.user.create({
      data: {
        email: `qa-s4-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
        full_name: `QA S4 ${role}`,
        password_hash: 'x',
        role,
      },
    });
    return u.id;
  }

  it('GUEST: add → checkout → tracking_token → track publik (tanpa user_id)', async () => {
    const svc = new OrderService();
    const guestId = `guest-s4-${Date.now()}`;
    await svc.addItem(undefined, guestId, { product_id: productId, variant_id: variantLargeId, quantity: 1 });
    const res = await svc.checkout(undefined, guestId, { fulfillment_type: 'pickup', payment_method: 'qris' });
    expect(res.status).toBe('PENDING');
    expect(res.tracking_token).toBeTruthy();

    const tracked = await svc.trackByToken(res.tracking_token);
    expect(tracked.status).toBe('PENDING');
    expect(tracked).not.toHaveProperty('user_id');

    const order = await prisma.order.findUnique({ where: { id: res.order_id } });
    expect(order.user_id).toBeNull();
  });

  it('MEMBER: poin earned → checkout → PAID → poin redeemed tercatat di ledger', async () => {
    const svc = new OrderService();
    const loyalty = new LoyaltyService();
    const userId = await seedUser('member');

    // Member punya 500 poin earned.
    await prisma.loyaltyPoint.create({ data: { user_id: userId, points: 500, type: 'earned' } });
    const before = await loyalty.getPoints(userId);
    expect(before.balance).toBe(500);

    await svc.addItem(userId, undefined, { product_id: productId, variant_id: variantLargeId, quantity: 2 });
    // Tukar 100 poin → diskon 100 (POINT_VALUE=1).
    await svc.applyVoucher(userId, undefined, { points_to_redeem: 100 });
    const res = await svc.checkout(userId, undefined, { fulfillment_type: 'pickup', payment_method: 'qris' });
    expect(res.status).toBe('PENDING');

    const order = await prisma.order.findUnique({ where: { id: res.order_id } });
    expect(Number(order.points_discount)).toBe(100);
    // Pajak dihitung atas (subtotal - diskon): (64000 - 100) * 0.11 = 7029 → total 70929.
    expect(Number(order.subtotal)).toBe(64000);
    expect(Number(order.total)).toBe(70929);

    // Ledger: redeemed 100 tercatat.
    const redeemed = await prisma.loyaltyPoint.aggregate({
      where: { user_id: userId, type: 'redeemed' },
      _sum: { points: true },
    });
    expect(redeemed._sum.points).toBe(100);
    const after = await loyalty.getPoints(userId);
    expect(after.balance).toBe(400);

    // Transisi ke PAID (webhook/manual) tersimpan.
    await svc.updateStatus(res.order_id, { status: 'PAID' });
    const paid = await prisma.order.findUnique({ where: { id: res.order_id } });
    expect(paid.status).toBe('PAID');
  });

  it('STAFF: state machine penuh PENDING→PAID→CONFIRMED→BEING_PREPARED→READY→COMPLETED', async () => {
    const svc = new OrderService();
    const userId = await seedUser('member');
    await svc.addItem(userId, undefined, { product_id: productId, variant_id: variantLargeId, quantity: 1 });
    const { order_id } = await svc.checkout(userId, undefined, { fulfillment_type: 'pickup' });

    for (const status of ['PAID', 'CONFIRMED', 'BEING_PREPARED', 'READY', 'COMPLETED']) {
      await svc.updateStatus(order_id, { status, changed_by: userId });
    }
    const order = await prisma.order.findUnique({ where: { id: order_id }, include: { logs: true } });
    expect(order.status).toBe('COMPLETED');
    const transitions = order.logs.map((l: any) => l.to_status);
    expect(transitions).toEqual(
      expect.arrayContaining(['PENDING', 'PAID', 'CONFIRMED', 'BEING_PREPARED', 'READY', 'COMPLETED']),
    );
  });

  it('STAFF: transisi ilegal CONFIRMED→COMPLETED → 409 (state machine)', async () => {
    const svc = new OrderService();
    const userId = await seedUser('member');
    await svc.addItem(userId, undefined, { product_id: productId, variant_id: variantLargeId, quantity: 1 });
    const { order_id } = await svc.checkout(userId, undefined, { fulfillment_type: 'pickup' });
    await svc.updateStatus(order_id, { status: 'PAID' });
    await svc.updateStatus(order_id, { status: 'CONFIRMED' });
    await expect(svc.updateStatus(order_id, { status: 'COMPLETED' })).rejects.toMatchObject({ status: 409 });
  });

  it('INVENTORY: order → CONFIRMED mengurangi stok (10→9.9) + catat inventory_logs', async () => {
    const svc = new OrderService();
    const userId = await seedUser('member');
    // Reset stok ke 10 sebelum test.
    await prisma.inventoryItem.update({ where: { id: invItemId }, data: { quantity: 10 } });

    await svc.addItem(userId, undefined, { product_id: productId, variant_id: variantLargeId, quantity: 1 });
    const { order_id } = await svc.checkout(userId, undefined, { fulfillment_type: 'pickup' });
    await svc.updateStatus(order_id, { status: 'PAID' });
    await svc.updateStatus(order_id, { status: 'CONFIRMED' });

    const inv = await prisma.inventoryItem.findUnique({ where: { id: invItemId } });
    expect(Number(inv.quantity)).toBeCloseTo(9.9, 3);

    const logs = await prisma.inventoryLog.findMany({ where: { order_id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('deduction');
    expect(Number(logs[0].quantity)).toBeCloseTo(0.1, 3);
  });

  it('INVENTORY: stok kurang saat CONFIRMED → 409 + order tetap PAID (rollback)', async () => {
    const svc = new OrderService();
    const userId = await seedUser('member');
    // Stok nyaris habis (0.05 kg, butuh 0.1) → trigger RAISE check_violation.
    await prisma.inventoryItem.update({ where: { id: invItemId }, data: { quantity: 0.05 } });

    await svc.addItem(userId, undefined, { product_id: productId, variant_id: variantLargeId, quantity: 1 });
    const { order_id } = await svc.checkout(userId, undefined, { fulfillment_type: 'pickup' });
    await svc.updateStatus(order_id, { status: 'PAID' });

    await expect(svc.updateStatus(order_id, { status: 'CONFIRMED' })).rejects.toMatchObject({ status: 409 });

    // Rollback: order tetap PAID, stok tidak berubah.
    const order = await prisma.order.findUnique({ where: { id: order_id } });
    expect(order.status).toBe('PAID');
    const inv = await prisma.inventoryItem.findUnique({ where: { id: invItemId } });
    expect(Number(inv.quantity)).toBeCloseTo(0.05, 3);

    // Pulihkan stok untuk test berikutnya.
    await prisma.inventoryItem.update({ where: { id: invItemId }, data: { quantity: 10 } });
  });

  it('REPORTS: order COMPLETED ikut terhitung di daily report (revenue statuses)', async () => {
    const svc = new OrderService();
    const { ReportingService } = await import('../reporting/reporting.service.js');
    const reporting = new ReportingService();
    const userId = await seedUser('member');

    await svc.addItem(userId, undefined, { product_id: productId, variant_id: variantLargeId, quantity: 1 });
    const { order_id } = await svc.checkout(userId, undefined, { fulfillment_type: 'pickup' });
    for (const s of ['PAID', 'CONFIRMED', 'BEING_PREPARED', 'READY', 'COMPLETED']) {
      await svc.updateStatus(order_id, { status: s });
    }

    const report = await reporting.getDailyReport(null);
    expect(report.orders).toBeGreaterThanOrEqual(1);
    expect(report.gross_revenue).toBeGreaterThan(0);
    expect(report.top_products.length).toBeGreaterThanOrEqual(1);
  });
});
