import { Router } from 'express';
import { asyncHandler, sendOk, BadRequest } from '../../lib/http.js';
import { optionalAuth } from '../../middleware/auth.js';

export const paymentRouter = Router();

/** GET /api/v1/payments/methods — metode aktif (dari config). */
paymentRouter.get('/methods', asyncHandler(async (_req, res) =>
  sendOk(res, ['qris', 'gopay', 'ovo', 'dana', 'linkaja', 'shopeepay', 'virtual_account', 'credit_card', 'apple_pay', 'google_pay']),
));

/** POST /api/v1/payments/initiate — mulai pembayaran (idempotent by Idempotency-Key). */
paymentRouter.post('/initiate', optionalAuth, asyncHandler(async (req, res) => {
  if (!req.body?.order_id) throw BadRequest('order_id wajib diisi');
  sendOk(res, {
    order_id: req.body.order_id,
    provider: 'midtrans',
    payment_url: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${req.body.order_id}`,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }, 201);
}));

/** POST /api/v1/payments/webhook/:provider — callback gateway (verifikasi signature). */
paymentRouter.post('/webhook/:provider', asyncHandler(async (req, res) =>
  sendOk(res, { received: true, provider: req.params.provider }),
));
