import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { BadRequest, NotFound } from '../../lib/http.js';

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
    // Idempotency check
    if (idempotencyKey) {
          const existing = await prisma.paymentIdempotency.findUnique({
            where: { idempotency_key: `loyalty:redeem:${idempotencyKey}` },
          });
          if (existing) {
            // Return cached response
            return existing.response;
          }
        }

        let reward: any;
        let pointsToRedeem: number;
        let discountAmount: number;
        let minPurchase: number;

        if (input.reward_id) {
          // New flow: redeem via reward catalog
          reward = await prisma.reward.findUnique({ where: { id: input.reward_id } });
          if (!reward) throw NotFound('Reward tidak ditemukan');
          if (!reward.is_active) throw BadRequest('Reward tidak aktif');
          if (reward.stock !== null && reward.stock <= 0) throw BadRequest('Stok reward habis');

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

        // Check current balance
        const points = await this.getPoints(userId);
        if (pointsToRedeem > points.balance) {
          throw BadRequest('Saldo poin tidak cukup');
        }

        // Atomic transaction: redeem points + create voucher + decrement stock
        const result = await prisma.$transaction(async (tx) => {
          // Record the redemption
          await tx.loyaltyPoint.create({
            data: {
              user_id: userId,
              points: pointsToRedeem,
              type: 'redeemed',
              order_id: null,
            },
          });

          // Generate voucher code
          const voucherCode = `REWARD-${userId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

          // Create voucher
          await tx.voucher.create({
            data: {
              code: voucherCode,
              discount_amount: discountAmount,
              min_purchase: minPurchase,
              is_active: true,
              expires_at: expiresAt,
            },
          });

          // Decrement reward stock if applicable
          if (reward && reward.stock !== null) {
            await tx.reward.update({
              where: { id: reward.id },
              data: { stock: { decrement: 1 } },
            });
          }

          return {
            voucher_code: voucherCode,
            points_redeemed: pointsToRedeem,
            discount_amount: discountAmount,
            min_purchase: minPurchase,
            expires_at: expiresAt,
            reward_name: reward?.name ?? null,
          };
        });

        // Store idempotency response
                if (idempotencyKey) {
                  await prisma.paymentIdempotency.create({
                    data: {
                      idempotency_key: `loyalty:redeem:${idempotencyKey}`,
                      provider: 'loyalty',
                      request_hash: JSON.stringify(input),
                      response: result,
                    },
                  });
                }

                return result;
          }
        }