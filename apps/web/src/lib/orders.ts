import type { CheckoutResultDTO, OrderDTO, PaymentMethod } from '@coffibeshop/shared';
import { apiFetch } from './api.js';

/** Kontrak order/checkout/pembayaran (PRD-BACKEND §4, live sejak #7). */

export interface CheckoutPayload {
  fulfillment_type: string;
  payment_method: PaymentMethod | string;
  notes?: string;
}

/** POST /orders/checkout — buat order + tracking_token (ADR-008). */
export function postCheckout(payload: CheckoutPayload): Promise<CheckoutResultDTO> {
  return apiFetch<CheckoutResultDTO>('/orders/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Respons `POST /payments/initiate` (InitiatePaymentResult backend). */
export interface InitiatePaymentResult {
  paymentId: string;
  provider: string;
  paymentUrl: string;
  token?: string;
  expiresAt: string;
  rawResponse?: Record<string, unknown>;
}

export interface InitiatePaymentPayload {
  order_id: string;
  amount: number;
  method: PaymentMethod | string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
}

/**
 * POST /payments/initiate — mulai pembayaran (idempotent via `Idempotency-Key`).
 * Key harus unik per order+method agar retry tidak membuat transaksi baru.
 */
export function postInitiatePayment(
  payload: InitiatePaymentPayload,
  idempotencyKey: string,
): Promise<InitiatePaymentResult> {
  return apiFetch<InitiatePaymentResult>('/payments/initiate', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });
}

/** GET /orders/:id — detail order member (butuh login). */
export function getOrder(id: string): Promise<OrderDTO> {
  return apiFetch<OrderDTO>(`/orders/${id}`);
}

/** GET /orders/track/:token — lacak guest (publik). */
export interface TrackResult {
  order_number: string;
  status: string;
  estimated_ready_time: string | null;
  updated_at: string;
}

export function getTrackByToken(token: string): Promise<TrackResult> {
  return apiFetch<TrackResult>(`/orders/track/${token}`);
}
