import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Redeem loyalty vs Postgres SUNGGUHAN (issue #76, QA blocker PR #87).
 *
 * Mock tidak bisa menangkap bug SQL (`FOR UPDATE` + agregat, bind text ke uuid)
 * maupun race idempotency — semuanya hanya muncul di DB nyata + request paralel.
 * Di-skip bila `QA_TEST_DATABASE_URL` tidak diset (lihat test/db.ts).
 */

import { hasTestDb, provisionTempDb, teardownTempDb } from '../../../test/db.js';

const run = hasTestDb();

describe.skipIf(!run)('Loyalty redeem — Postgres nyata (race + idempotency)', () => {
  let prisma: any;
  let svc: any;
  let temp: any;

  beforeAll(async () => {
    temp = await provisionTempDb('cb_qa_loyalty');
    prisma = temp.prisma;
    process.env.DATABASE_URL = temp.url;
    process.env.DIRECT_URL = temp.url;
    const { LoyaltyService } = await import('./loyalty.service.js');
    svc = new LoyaltyService();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await teardownTempDb(temp);
  });

  async function seedMember(points: number): Promise<string> {
    const u = await prisma.user.create({
      data: {
        email: `qa-loyalty-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
        full_name: 'QA Loyalty',
        password_hash: 'x',
        role: 'member',
      },
    });
    if (points > 0) {
      await prisma.loyaltyPoint.create({ data: { user_id: u.id, points, type: 'earned', order_id: null } });
    }
    return u.id;
  }

  async function seedReward(pointsCost: number, stock: number | null): Promise<string> {
    const r = await prisma.reward.create({
      data: {
        name: `QA Reward ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        points_cost: pointsCost,
        discount_amount: 10000,
        min_purchase: 0,
        is_active: true,
        stock,
      },
    });
    return r.id;
  }

  async function countVouchers(userId: string): Promise<number> {
    // voucher_code selalu diawali 8 char pertama userId
    return prisma.voucher.count({ where: { code: { startsWith: `REWARD-${userId.slice(0, 8).toUpperCase()}-` } } });
  }

  it('happy path → voucher dibuat, poin terpotong, stok turun', async () => {
    const userId = await seedMember(500);
    const rewardId = await seedReward(100, 5);

    const res = await svc.redeemPoints(userId, { reward_id: rewardId });

    expect(res.points_redeemed).toBe(100);
    expect(res.voucher_code).toMatch(/^REWARD-/);
    expect(await countVouchers(userId)).toBe(1);

    const stock = await prisma.reward.findUnique({ where: { id: rewardId }, select: { stock: true } });
    expect(stock.stock).toBe(4);
    expect((await svc.getPoints(userId)).balance).toBe(400);
  }, 60_000);

  it('saldo = 1×cost, 5 redeem PARALEL → tepat 1 sukses, saldo tak negatif', async () => {
    const userId = await seedMember(100);
    const rewardId = await seedReward(100, null);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => svc.redeemPoints(userId, { reward_id: rewardId })),
    );

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(1);
    expect(await countVouchers(userId)).toBe(1);
    expect((await svc.getPoints(userId)).balance).toBe(0);
  }, 60_000);

  it('stok = 1, 5 redeem PARALEL → tepat 1 sukses, stok tak negatif', async () => {
    const userId = await seedMember(1000);
    const rewardId = await seedReward(100, 1);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => svc.redeemPoints(userId, { reward_id: rewardId })),
    );

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(1);

    const stock = await prisma.reward.findUnique({ where: { id: rewardId }, select: { stock: true } });
    expect(stock.stock).toBe(0);
    expect(await countVouchers(userId)).toBe(1);
  }, 60_000);

  it('5 redeem PARALEL dengan Idempotency-Key SAMA → 1 voucher', async () => {
    const userId = await seedMember(1000);
    const rewardId = await seedReward(100, null);
    const key = 'key-sama-123';

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => svc.redeemPoints(userId, { reward_id: rewardId }, key)),
    );

    const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    expect(ok.length).toBe(5); // semua mengembalikan hasil yang sama, bukan error
    expect(new Set(ok.map((r) => r.value.voucher_code)).size).toBe(1);
    expect(await countVouchers(userId)).toBe(1);
    expect((await svc.getPoints(userId)).balance).toBe(900);
  }, 60_000);

  it('Idempotency-Key sama + payload beda → 409, tak ada voucher tambahan', async () => {
    const userId = await seedMember(1000);
    const r1 = await seedReward(100, null);
    const r2 = await seedReward(100, null);
    const key = 'key-konflik';

    await svc.redeemPoints(userId, { reward_id: r1 }, key);
    await expect(svc.redeemPoints(userId, { reward_id: r2 }, key)).rejects.toMatchObject({ status: 409 });
    expect(await countVouchers(userId)).toBe(1);
  }, 60_000);

  it('anti-IDOR: key user A tidak memengaruhi user B', async () => {
    const a = await seedMember(500);
    const b = await seedMember(500);
    const rewardId = await seedReward(100, null);

    const ra = await svc.redeemPoints(a, { reward_id: rewardId }, 'key-bersama');
    const rb = await svc.redeemPoints(b, { reward_id: rewardId }, 'key-bersama');

    expect(ra.voucher_code).not.toBe(rb.voucher_code);
    expect(await countVouchers(a)).toBe(1);
    expect(await countVouchers(b)).toBe(1);
  }, 60_000);
});
