import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { BadRequest } from '../../lib/http.js';

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

  /** POST /api/v1/loyalty/redeem — tukar poin ke voucher. */
  async redeemPoints(userId: string, pointsToRedeem: number) {
    if (pointsToRedeem <= 0) throw BadRequest('points_to_redeem harus > 0');

    // Check current balance
    const points = await this.getPoints(userId);
    if (pointsToRedeem > points.balance) {
      throw BadRequest('Saldo poin tidak cukup');
    }

    // Check if there's a voucher that matches this exact redemption
    // For now, we create a "loyalty voucher" internally
    // In Phase 2, this could be a catalog of rewards
    
    // Record the redemption
    await prisma.loyaltyPoint.create({
      data: {
        user_id: userId,
        points: pointsToRedeem,
        type: 'redeemed',
        order_id: null,
      },
    });

    // Return a simple voucher code for the redeemed amount
    const voucherCode = `LOYALTY-${userId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const discountAmount = pointsToRedeem * env.POINT_VALUE;

    await prisma.voucher.create({
      data: {
        code: voucherCode,
        discount_amount: discountAmount,
        min_purchase: 0,
        is_active: true,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    return {
      voucher_code: voucherCode,
      points_redeemed: pointsToRedeem,
      discount_amount: discountAmount,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }
}