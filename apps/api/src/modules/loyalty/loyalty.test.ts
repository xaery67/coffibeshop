import { describe, it, expect, beforeEach, vi } from 'vitest';

/** State in-memory untuk mock (Prisma, Redis, Env). */
const h = vi.hoisted(() => ({
  loyaltyPoints: [] as any[],
  vouchers: [] as any[],
  env: { POINT_VALUE: 1 },
}));

vi.mock('../../config/prisma.js', () => {
  const prisma = {
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

  it('POST /redeem → gagal bila saldo tidak cukup', async () => {
    h.loyaltyPoints.push(
      { user_id: USER_ID, type: 'earned', points: 50 },
      { user_id: USER_ID, type: 'redeemed', points: 10 }
    );
    await expect(svc.redeemPoints(USER_ID, 50)).rejects.toMatchObject({ status: 400 });
  });

  it('POST /redeem → gagal bila points_to_redeem <= 0', async () => {
    await expect(svc.redeemPoints(USER_ID, 0)).rejects.toMatchObject({ status: 400 });
    await expect(svc.redeemPoints(USER_ID, -1)).rejects.toMatchObject({ status: 400 });
  });

  it('POST /redeem → berhasil, membuat loyaltyPoint redeemed + voucher baru', async () => {
    h.loyaltyPoints.push(
      { user_id: USER_ID, type: 'earned', points: 200 },
      { user_id: USER_ID, type: 'redeemed', points: 50 }
    );
    const result = await svc.redeemPoints(USER_ID, 100);
    
    expect(result.points_redeemed).toBe(100);
    expect(result.discount_amount).toBe(100); // POINT_VALUE = 1
    expect(result.voucher_code).toMatch(/^LOYALTY-/);
    expect(result.expires_at).toBeInstanceOf(Date);
    
    // Verify loyaltyPoint created
    const redeemed = h.loyaltyPoints.find(l => l.type === 'redeemed' && l.points === 100);
    expect(redeemed).toBeDefined();
    
    // Verify voucher created
    const vch = h.vouchers.find(v => v.code === result.voucher_code);
    expect(vch).toBeDefined();
    expect(vch?.discount_amount).toBe(100);
    expect(vch?.min_purchase).toBe(0);
    expect(vch?.is_active).toBe(true);
  });
});