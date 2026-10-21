import { Router } from 'express';
import { asyncHandler, sendOk } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { LoyaltyService } from './loyalty.service.js';
import { z } from 'zod';

export const loyaltyRouter = Router();
const service = new LoyaltyService();

/** Zod schema for redeem request - supports reward_id (new) or points_to_redeem (deprecated). */
const RedeemInput = z.object({
  reward_id: z.string().uuid('reward_id harus UUID valid').optional(),
  points_to_redeem: z.number().int().min(1, 'points_to_redeem minimal 1').optional(),
}).refine(
  (data) => data.reward_id || data.points_to_redeem,
  { message: 'Harus menyertakan reward_id atau points_to_redeem' }
);

/** GET /api/v1/loyalty/_status — health check. */
loyaltyRouter.get('/_status', asyncHandler(async (_req, res) =>
  sendOk(res, { service: 'loyalty', status: 'ok' }),
));

/** GET /api/v1/loyalty/points — saldo poin member. */
loyaltyRouter.get(
  '/points',
  requireAuth,
  asyncHandler(async (req, res) => {
    const points = await service.getPoints((req as any).user.id);
    sendOk(res, points);
  }),
);

/** GET /api/v1/loyalty/rewards — daftar reward aktif (katalog). */
loyaltyRouter.get(
  '/rewards',
  asyncHandler(async (_req, res) => {
    const rewards = await service.getRewards();
    sendOk(res, rewards);
  }),
);

/** GET /api/v1/loyalty/vouchers — daftar voucher aktif (termasuk loyalty vouchers). */
loyaltyRouter.get(
  '/vouchers',
  asyncHandler(async (_req, res) => {
    const vouchers = await service.getVouchers();
    sendOk(res, vouchers);
  }),
);

/** POST /api/v1/loyalty/redeem — tukar poin ke voucher. */
loyaltyRouter.post(
  '/redeem',
  requireAuth,
  validate(RedeemInput),
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const result = await service.redeemPoints(
      (req as any).user.id,
      req.body,
      idempotencyKey
    );
    sendOk(res, result, 201);
  }),
);
