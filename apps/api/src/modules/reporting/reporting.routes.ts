import { Router } from 'express';
import { asyncHandler, sendOk } from '../../lib/http.js';

/**
 * Reporting — kerangka domain service (PRD-BACKEND §2).
 * Implementasi detail mengikuti sprint plan (docs/SPRINT-PLAN.md).
 */
export const reportingRouter = Router();

reportingRouter.get('/_status', asyncHandler(async (_req, res) =>
  sendOk(res, { service: 'reporting', status: 'scaffolded' }),
));
