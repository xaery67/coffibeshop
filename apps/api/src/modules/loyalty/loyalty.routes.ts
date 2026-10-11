import { Router } from 'express';
import { asyncHandler, sendOk } from '../../lib/http.js';

/**
 * Loyalty — kerangka domain service (PRD-BACKEND §2).
 * Implementasi detail mengikuti sprint plan (docs/SPRINT-PLAN.md).
 */
export const loyaltyRouter = Router();

loyaltyRouter.get('/_status', asyncHandler(async (_req, res) =>
  sendOk(res, { service: 'loyalty', status: 'scaffolded' }),
));
