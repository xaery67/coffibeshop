import { Router } from 'express';
import { asyncHandler, sendOk } from '../../lib/http.js';
import { env } from '../../config/env.js';

export const adminRouter = Router();

/**
 * GET /api/v1/admin/config — KONFIG PUBLIK (ADR-007).
 * Dipakai FE pricing engine: tax, point value, metode bayar, ongkir flat.
 * (Catatan: juga tersedia di /api/v1/config untuk kompatibilitas.)
 */
adminRouter.get('/config', asyncHandler(async (_req, res) =>
  sendOk(res, {
    tax_rate: env.TAX_RATE,
    point_value: env.POINT_VALUE,
    currency: env.CURRENCY,
    active_payment_methods: ['qris', 'gopay', 'ovo', 'dana', 'linkaja', 'shopeepay', 'virtual_account', 'credit_card', 'apple_pay', 'google_pay'],
    shipping_flat_fee: env.SHIPPING_FLAT_FEE,
    sse_heartbeat_interval_ms: env.SSE_HEARTBEAT_INTERVAL_MS,
    tracking_poll_interval_ms: env.TRACKING_POLL_INTERVAL_MS,
  }),
));

adminRouter.get('/_status', asyncHandler(async (_req, res) =>
  sendOk(res, { service: 'admin', status: 'scaffolded' }),
));
