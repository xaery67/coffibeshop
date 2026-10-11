import { Router } from 'express';
import { asyncHandler, sendOk } from '../../lib/http.js';

/**
 * Inventory — kerangka domain service (PRD-BACKEND §2).
 * Implementasi detail mengikuti sprint plan (docs/SPRINT-PLAN.md).
 */
export const inventoryRouter = Router();

inventoryRouter.get('/_status', asyncHandler(async (_req, res) =>
  sendOk(res, { service: 'inventory', status: 'scaffolded' }),
));
