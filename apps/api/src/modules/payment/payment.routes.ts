import { Router } from 'express';
import { asyncHandler, sendOk, BadRequest } from '../../lib/http.js';
import { optionalAuth } from '../../middleware/auth.js';
import { PaymentService } from './payment.service.js';

export const paymentRouter = Router();
let paymentServiceInstance: PaymentService | null = null;

async function getPaymentService(): Promise<PaymentService> {
  if (!paymentServiceInstance) {
    paymentServiceInstance = await PaymentService.create();
  }
  return paymentServiceInstance;
}

/** GET /api/v1/payments/methods — metode aktif (dari config). */
paymentRouter.get('/methods', asyncHandler(async (_req, res) =>
  sendOk(res, ['qris', 'gopay', 'ovo', 'dana', 'linkaja', 'shopeepay', 'virtual_account', 'credit_card', 'apple_pay', 'google_pay']),
));

/** POST /api/v1/payments/initiate — mulai pembayaran (idempotent by Idempotency-Key). */
paymentRouter.post('/initiate', optionalAuth, asyncHandler(async (req, res) => {
  const { order_id, amount, method, customer_email, customer_phone, customer_name, callback_url, metadata } = req.body;

  if (!order_id) throw BadRequest('order_id wajib diisi');
  if (!amount || amount <= 0) throw BadRequest('amount harus > 0');
  if (!method) throw BadRequest('method wajib diisi');

  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  // Normalisasi: empty string → undefined agar Midtrans tidak terkirim field kosong
  const normalize = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

  const paymentService = await getPaymentService();
  const result = await paymentService.initiatePayment({
    orderId: order_id,
    amount,
    method,
    customerEmail: normalize(customer_email),
    customerPhone: normalize(customer_phone),
    customerName: normalize(customer_name),
    callbackUrl: callback_url,
    metadata,
  }, idempotencyKey);

  sendOk(res, result, 201);
}));

/** POST /api/v1/payments/webhook/:provider — callback gateway (verifikasi signature). */
paymentRouter.post('/webhook/:provider', asyncHandler(async (req, res) => {
  const providerName = req.params.provider;
  // Midtrans sends signature_key in body, not header
  const signatureKey = req.body?.signature_key as string | undefined;

  const paymentService = await getPaymentService();
  const verification = await paymentService.handleWebhook(providerName, req.body, signatureKey);

  // Always return 200 for idempotent webhook
  sendOk(res, { received: true, provider: providerName, status: verification.status });
}));
