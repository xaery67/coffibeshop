import { describe, it, expect, beforeEach, vi } from 'vitest';

/** State in-memory untuk mock (Prisma, Redis, Env). */
const h = vi.hoisted(() => ({
  loyaltyPoints: [] as any[],
  vouchers: [] as any[],
  rewards: [] as any[],
  env: { POINT_VALUE: 1 },
  idempotencyStore: new Map<string, any>(),
}));

vi.mock('../../config/prisma.js', () => {
  const prisma = {
    $transaction: async (fn: any) => fn(prisma),
    loyaltyPoint: {
      aggregate: async ({ where }: any) => {
        const rows = h.loyaltyPoints.filter(
          (l) => l.user_id === where.user_id && l.type === where.type
        );
        return { _sum: { points: rows.reduce((s, r) => s + r.points, 0) } };
      },
      create: async ({ data }: any) => {
        const l = { id: `lp-${h.loyaltyPoints.length + 1}`, created_at: new Date().toISOString(), ...data };
        h.loyaltyPoints.push(l);
        return l;
      },
    },
    voucher: {
      findMany: async ({ where }: any) => {
        let rows = h.vouchers.filter((v) => v.is_active);
        if (where.OR) {
          // Filter expired
          const now = new Date();
          rows = rows.filter((v) => !v.expires_at || new Date(v.expires_at) >= now);
        }
        return rows.sort((a, b) => a.min_purchase - b.min_purchase);
      },
      create: async ({ data }: any) => {
        const v = { id: `vch-${h.vouchers.length + 1}`, created_at: new Date().toISOString(), ...data };
        h.vouchers.push(v);
        return v;
      },
    },
    reward: {
              findMany: async ({ where, orderBy }: any) => {
                const rows = h.rewards.filter((r) => !where.is_active || r.is_active === where.is_active);
                if (orderBy?.points_cost === 'asc') {
                  rows.sort((a, b) => a.points_cost - b.points_cost);
                }
                return rows;
              },
          findUnique: async ({ where }: any) => {
            return h.rewards.find((r) => r.id === where.id) ?? null;
          },
          update: async ({ where, data }: any) => {
            const r = h.rewards.find((x) => x.id === where.id);
            if (r) {
              if (data.stock?.decrement !== undefined) {
                r.stock = (r.stock ?? 0) - data.stock.decrement;
              } else {
                Object.assign(r, data);
              }
            }
            return r;
          },
        },
    paymentIdempotency: {
      findUnique: async ({ where }: any) => {
        return h.idempotencyStore.get(where.idempotency_key) ?? null;
      },
      create: async ({ data }: any) => {
        h.idempotencyStore.set(data.idempotency_key, data);
        return data;
      },
    },
  };
  return { prisma };
});

vi.mock('../../config/env.js', () => ({
  env: { POINT_VALUE: 1 },
}));

import { LoyaltyService } from './loyalty.service.js';

const svc = new LoyaltyService();
const USER_ID = 'user-loyalty-1';

beforeEach(() => {
  h.loyaltyPoints.length = 0;
  h.vouchers.length = 0;
  h.rewards.length = 0;
  h.idempotencyStore.clear();
  
  // Seed default rewards
  h.rewards.push(
    { id: 'r1', name: 'Potong Rp 10.000', points_cost: 100, discount_amount: 10000, min_purchase: 50000, is_active: true, stock: 100, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'r2', name: 'Potong Rp 25.000', points_cost: 250, discount_amount: 25000, min_purchase: 100000, is_active: true, stock: 50, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'r3', name: 'Gratis Extra Shot', points_cost: 50, discount_amount: 5000, min_purchase: 20000, is_active: true, stock: 200, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'r4', name: 'Gratis Large Upgrade', points_cost: 80, discount_amount: 5000, min_purchase: 25000, is_active: true, stock: 150, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  );
});

describe('Loyalty Service', () => {
  it('GET /points → balance = earned - redeemed', async () => {
    h.loyaltyPoints.push(
      { user_id: USER_ID, type: 'earned', points: 100 },
      { user_id: USER_ID, type: 'earned', points: 50 },
      { user_id: USER_ID, type: 'redeemed', points: 30 }
    );
    const points = await svc.getPoints(USER_ID);
    expect(points.earned).toBe(150);
    expect(points.redeemed).toBe(30);
    expect(points.balance).toBe(120);
    expect(points.value_idr).toBe(120);
  });

  it('GET /points → zero saat belum ada poin', async () => {
    const points = await svc.getPoints(USER_ID);
    expect(points.balance).toBe(0);
    expect(points.value_idr).toBe(0);
  });

  it('GET /vouchers → hanya voucher aktif & tidak expired', async () => {
    const now = new Date();
    h.vouchers.push(
      { code: 'ACTIVE1', is_active: true, expires_at: null, min_purchase: 0 },
      { code: 'ACTIVE2', is_active: true, expires_at: new Date(now.getTime() + 86400000).toISOString(), min_purchase: 10000 },
      { code: 'INACTIVE', is_active: false, expires_at: null, min_purchase: 0 },
      { code: 'EXPIRED', is_active: true, expires_at: new Date(now.getTime() - 86400000).toISOString(), min_purchase: 0 },
    );
    const vouchers = await svc.getVouchers();
    expect(vouchers).toHaveLength(2);
    expect(vouchers.map(v => v.code)).toEqual(['ACTIVE1', 'ACTIVE2']);
  });

  it('GET /rewards → daftar reward aktif urut points_cost asc', async () => {
    const rewards = await svc.getRewards();
    expect(rewards).toHaveLength(4);
    expect(rewards.map(r => r.points_cost)).toEqual([50, 80, 100, 250]);
    expect(rewards.map(r => r.name)).toEqual(['Gratis Extra Shot', 'Gratis Large Upgrade', 'Potong Rp 10.000', 'Potong Rp 25.000']);
  });

  it('POST /redeem (legacy) → gagal bila saldo tidak cukup', async () => {
    h.loyaltyPoints.push(
      { user_id: USER_ID, type: 'earned', points: 50 },
      { user_id: USER_ID, type: 'redeemed', points: 10 }
    );
    await expect(svc.redeemPoints(USER_ID, { points_to_redeem: 50 })).rejects.toMatchObject({ status: 400 });
  });

  it('POST /redeem (legacy) → gagal bila points_to_redeem <= 0', async () => {
    await expect(svc.redeemPoints(USER_ID, { points_to_redeem: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(svc.redeemPoints(USER_ID, { points_to_redeem: -1 })).rejects.toMatchObject({ status: 400 });
  });

  it('POST /redeem (legacy) → gagal bila reward_id & points_to_redeem keduanya tidak ada', async () => {
    await expect(svc.redeemPoints(USER_ID, {})).rejects.toMatchObject({ status: 400 });
  });

  it('POST /redeem (reward_id) → gagal bila reward tidak ditemukan', async () => {
    h.loyaltyPoints.push({ user_id: USER_ID, type: 'earned', points: 200 });
    await expect(svc.redeemPoints(USER_ID, { reward_id: 'tidak-ada' })).rejects.toMatchObject({ status: 404 });
  });

  it('POST /redeem (reward_id) → gagal bila reward tidak aktif', async () => {
    h.loyaltyPoints.push({ user_id: USER_ID, type: 'earned', points: 200 });
    h.rewards[0].is_active = false;
    await expect(svc.redeemPoints(USER_ID, { reward_id: 'r1' })).rejects.toMatchObject({ status: 400 });
  });

  it('POST /redeem (reward_id) → gagal bila stok reward habis', async () => {
    h.loyaltyPoints.push({ user_id: USER_ID, type: 'earned', points: 200 });
    h.rewards[0].stock = 0;
    await expect(svc.redeemPoints(USER_ID, { reward_id: 'r1' })).rejects.toMatchObject({ status: 400 });
  });

  it('POST /redeem (reward_id) → gagal bila saldo poin tidak cukup', async () => {
    h.loyaltyPoints.push({ user_id: USER_ID, type: 'earned', points: 50 });
    await expect(svc.redeemPoints(USER_ID, { reward_id: 'r2' })).rejects.toMatchObject({ status: 400 }); // r2 butuh 250 poin
  });

  it('POST /redeem (reward_id) → sukses, membuat loyaltyPoint redeemed + voucher + kurangi stok', async () => {
    h.loyaltyPoints.push({ user_id: USER_ID, type: 'earned', points: 200 });
    const result = await svc.redeemPoints(USER_ID, { reward_id: 'r1' }); // 100 poin, diskon 10000
    
    expect(result.points_redeemed).toBe(100);
    expect(result.discount_amount).toBe(10000);
    expect(result.min_purchase).toBe(50000);
    expect(result.voucher_code).toMatch(/^REWARD-/);
    expect(result.reward_name).toBe('Potong Rp 10.000');
    expect(result.expires_at).toBeInstanceOf(Date);
    
    // Verify loyaltyPoint created
    const redeemed = h.loyaltyPoints.find(l => l.type === 'redeemed' && l.points === 100);
    expect(redeemed).toBeDefined();
    
    // Verify voucher created
    const vch = h.vouchers.find(v => v.code === result.voucher_code);
    expect(vch).toBeDefined();
    expect(vch?.discount_amount).toBe(10000);
    expect(vch?.min_purchase).toBe(50000);
    expect(vch?.is_active).toBe(true);
    
    // Verify stock decremented
    expect(h.rewards.find(r => r.id === 'r1')?.stock).toBe(99);
  });

  it('POST /redeem (legacy) → berhasil, backward compat', async () => {
    h.loyaltyPoints.push(
      { user_id: USER_ID, type: 'earned', points: 200 },
      { user_id: USER_ID, type: 'redeemed', points: 50 }
    );
    const result = await svc.redeemPoints(USER_ID, { points_to_redeem: 100 });
    
    expect(result.points_redeemed).toBe(100);
    expect(result.discount_amount).toBe(100); // POINT_VALUE = 1
    expect(result.voucher_code).toMatch(/^REWARD-/); // new format
    expect(result.reward_name).toBeNull();
    expect(result.min_purchase).toBe(0);
    
    // Verify loyaltyPoint created
    const redeemed = h.loyaltyPoints.find(l => l.type === 'redeemed' && l.points === 100);
    expect(redeemed).toBeDefined();
    
    // Verify voucher created
    const vch = h.vouchers.find(v => v.code === result.voucher_code);
    expect(vch).toBeDefined();
    expect(vch?.discount_amount).toBe(100);
    expect(vch?.min_purchase).toBe(0);
  });

  it('POST /redeem (idempotency) → double submit → 1 voucher', async () => {
    h.loyaltyPoints.push({ user_id: USER_ID, type: 'earned', points: 200 });
    const idempotencyKey = 'test-idempotency-123';
    
    const result1 = await svc.redeemPoints(USER_ID, { reward_id: 'r1' }, idempotencyKey);
    const result2 = await svc.redeemPoints(USER_ID, { reward_id: 'r1' }, idempotencyKey);
    
    expect(result1.voucher_code).toBe(result2.voucher_code);
    expect(result1.points_redeemed).toBe(result2.points_redeemed);
    
    // Only 1 loyaltyPoint created
    const redeemed = h.loyaltyPoints.filter(l => l.type === 'redeemed' && l.points === 100);
    expect(redeemed).toHaveLength(1);
    
    // Only 1 voucher created
    expect(h.vouchers).toHaveLength(1);
  });
});