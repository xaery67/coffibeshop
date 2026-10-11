import { Router } from 'express';
import { asyncHandler, sendOk } from '../../lib/http.js';

/**
 * Notification — kerangka domain service (PRD-BACKEND §2).
 * Implementasi detail mengikuti sprint plan (docs/SPRINT-PLAN.md).
 */
export const notificationRouter = Router();

notificationRouter.get('/_status', asyncHandler(async (_req, res) =>
  sendOk(res, { service: 'notification', status: 'scaffolded' }),
));
