import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { BadRequest, NotFound, Conflict } from '../../lib/http.js';

export class LoyaltyService {
  /** GET /api/v1/loyalty/points — saldo poin member (earned - redeemed). */
  async getPoints(userId: string) {
    const [earned, redeemed] = await Promise.all([
      prisma.loyaltyPoint.aggregate({
        where: { user_id: userId, type: 'earned' },
        _sum: { points: true },
      }),
      prisma.loyaltyPoint.aggregate({
        where: { user_id: userId, type: 'redeemed' },
        _sum: { points: true },
      }),
    ]);

    const balance = (earned._sum.points ?? 0) - (redeemed._sum.points ?? 0);
    const valueIdr = balance * env.POINT_VALUE;

    return {
      balance,
      value_idr: valueIdr,
      earned: earned._sum.points ?? 0,
      redeemed: redeemed._sum.points ?? 0,
    };
  }

  /** GET /api/v1/loyalty/rewards — daftar reward aktif. */
  async getRewards() {
    return prisma.reward.findMany({
      where: { is_active: true },
      orderBy: { points_cost: 'asc' },
    });
  }

  /** GET /api/v1/loyalty/vouchers — daftar voucher aktif. */
  async getVouchers() {
    return prisma.voucher.findMany({
      where: {
        is_active: true,
        OR: [
          { expires_at: null },
          { expires_at: { gte: new Date() } },
        ],
      },
      orderBy: { min_purchase: 'asc' },
    });
  }

  /** POST /api/v1/loyalty/redeem — tukar poin ke voucher via reward catalog. */
  async redeemPoints(userId: string, input: { reward_id?: string; points_to_redeem?: number }, idempotencyKey?: string) {
    // Resolve reward and compute points/discount/minPurchase BEFORE transaction (read-only)
    let reward: any = null;
    let pointsToRedeem: number;
    let discountAmount: number;
    let minPurchase: number;

    if (input.reward_id) {
      // New flow: redeem via reward catalog
      reward = await prisma.reward.findUnique({ where: { id: input.reward_id } });
      if (!reward) throw NotFound('Reward tidak ditemukan');
      if (!reward.is_active) throw BadRequest('Reward tidak aktif');

      pointsToRedeem = reward.points_cost;
      discountAmount = Number(reward.discount_amount);
      minPurchase = Number(reward.min_purchase);
    } else if (input.points_to_redeem) {
      // Backward compat: direct points redeem (deprecated)
      if (input.points_to_redeem <= 0) throw BadRequest('points_to_redeem harus > 0');
      pointsToRedeem = input.points_to_redeem;
      discountAmount = pointsToRedeem * env.POINT_VALUE;
      minPurchase = 0;
    } else {
      throw BadRequest('Harus menyertakan reward_id atau points_to_redeem');
    }

    // Idempotency key scoped to user
    const idempotencyKeyFull = idempotencyKey ? `loyalty:redeem:${userId}:${idempotencyKey}` : null;
    const requestHash = JSON.stringify(input);

    // Semua langkah di dalam satu tx, diserialkan oleh row-lock `users`.
    // Tanpa lock ini: saldo bisa dibelanjakan dobel DAN idempotency bocor
    // (cek-lalu-tulis di luar tx → N request paralel = N voucher).
    const result = await prisma.$transaction(async (tx) => {
      // 1) Lock baris user. FOR UPDATE tak boleh dengan agregat, jadi kunci
      //    barisnya dulu, baru hitung saldo di query terpisah.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

      // 2) Idempotency: aman cek-lalu-tulis karena lock di atas.
      if (idempotencyKeyFull) {
        const existing = await tx.paymentIdempotency.findUnique({
          where: { idempotency_key: idempotencyKeyFull },
        });
        if (existing) {
          if (existing.request_hash !== requestHash) {
            throw Conflict('Idempotency-Key conflict: request payload berbeda');
          }
          return existing.response;
        }
      }

      // 3) Saldo (agregat, tanpa FOR UPDATE)
      const balRows = await tx.$queryRaw<{ balance: bigint }[]>`
        SELECT COALESCE(SUM(CASE WHEN type = 'earned' THEN points ELSE -points END), 0)::bigint AS balance
        FROM loyalty_points
        WHERE user_id = ${userId}::uuid
      `;
      const balance = Number(balRows[0]?.balance ?? 0);
      if (pointsToRedeem > balance) {
        throw BadRequest('Saldo poin tidak cukup');
      }

      // 2) Atomically decrement stock (if reward has stock tracking)
      if (reward && reward.stock !== null) {
        const dec = await tx.reward.updateMany({
          where: {
            id: reward.id,
            OR: [
              { stock: null },
              { stock: { gt: 0 } },
            ],
          },
          data: { stock: { decrement: 1 } },
        });
        if (dec.count === 0) {
          throw BadRequest('Stok reward habis');
        }
      }

      // 3) Record the redemption
      await tx.loyaltyPoint.create({
        data: {
          user_id: userId,
          points: pointsToRedeem,
          type: 'redeemed',
          order_id: null,
        },
      });

      // 4) Generate voucher code
      const voucherCode = `REWARD-${userId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // 5) Create voucher
      await tx.voucher.create({
        data: {
          code: voucherCode,
          discount_amount: discountAmount,
          min_purchase: minPurchase,
          is_active: true,
          expires_at: expiresAt,
        },
      });

      const response = {
        voucher_code: voucherCode,
        points_redeemed: pointsToRedeem,
        discount_amount: discountAmount,
        min_purchase: minPurchase,
        expires_at: expiresAt,
        reward_name: reward?.name ?? null,
      };

      // 6) Simpan idempotency di tx yang sama — commit bersama voucher,
      //    sehingga request paralel melihat hasil yang sama.
      if (idempotencyKeyFull) {
        await tx.paymentIdempotency.create({
          data: {
            idempotency_key: idempotencyKeyFull,
            provider: 'loyalty',
            request_hash: requestHash,
            response,
          },
        });
      }

      return response;
    });

    return result;
  }
}
