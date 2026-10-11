import { Router } from 'express';
import { asyncHandler, sendOk } from '../lib/http.js';
import { env } from '../config/env.js';

export const configRouter = Router();

/**
 * GET /api/v1/config — konfigurasi PUBLIK (ADR-007).
 * Pricing engine FE ambil tax/point/metode bayar/ongkir dari sini (tidak hardcode).
 */
configRouter.get(
  '/',
  asyncHandler(async (_req, res) =>
    sendOk(res, {
      tax_rate: env.TAX_RATE,
      point_value: env.POINT_VALUE,
      currency: env.CURRENCY,
      active_payment_methods: [
        'qris', 'gopay', 'ovo', 'dana', 'linkaja', 'shopeepay',
        'virtual_account', 'credit_card', 'apple_pay', 'google_pay',
      ],
      shipping_flat_fee: env.SHIPPING_FLAT_FEE,
      sse_heartbeat_interval_ms: env.SSE_HEARTBEAT_INTERVAL_MS,
      tracking_poll_interval_ms: env.TRACKING_POLL_INTERVAL_MS,
    }),
  ),
);
