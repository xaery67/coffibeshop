import type { CartItemDTO, CheckoutResultDTO, OrderDTO, PaymentMethod } from '@coffibeshop/shared';
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
 * Normalisasi respons initiate ke bentuk kanonik camelCase.
 *
 * Backend mengembalikan `InitiatePaymentResult` camelCase (paymentUrl/expiresAt),
 * namun issue #11 & beberapa jalur menyebut `payment_url`/`expires_at`. Terima
 * KEDUA bentuk agar tautan pembayaran tidak pernah kosong bila kontrak bergeser.
 */
function normalizeInitiate(raw: unknown): InitiatePaymentResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
  return {
    paymentId: str(r.paymentId) ?? str(r.payment_id) ?? '',
    provider: str(r.provider) ?? 'midtrans',
    paymentUrl: str(r.paymentUrl) ?? str(r.payment_url) ?? '',
    token: str(r.token),
    expiresAt: str(r.expiresAt) ?? str(r.expires_at) ?? '',
    rawResponse: (r.rawResponse ?? r.raw_response) as Record<string, unknown> | undefined,
  };
}

/**
 * POST /payments/initiate — mulai pembayaran (idempotent via `Idempotency-Key`).
 * Key harus unik per order+method agar retry tidak membuat transaksi baru.
 */
export async function postInitiatePayment(
  payload: InitiatePaymentPayload,
  idempotencyKey: string,
): Promise<InitiatePaymentResult> {
  const raw = await apiFetch<unknown>('/payments/initiate', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });
  return normalizeInitiate(raw);
}

/** GET /orders/:id — detail order member (butuh login). */
export function getOrder(id: string): Promise<OrderDTO> {
  return apiFetch<OrderDTO>(`/orders/${id}`);
}

/** Riwayat order member (halaman). `GET /orders?page&limit`. */
export interface OrderHistoryPage {
  data: OrderDTO[];
  meta: { page: number; limit: number; total: number; total_pages: number };
}

export function getOrderHistory(params: { page?: number; limit?: number } = {}): Promise<OrderHistoryPage> {
  const search = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  });
  return apiFetch<OrderHistoryPage>(`/orders?${search.toString()}`);
}

/**
 * POST /orders/:id/reorder — reorder 1-klik (ADR-010, AC-10).
 * Mengembalikan item pre-filled (varian/opsi/harga terkini); item nonaktif
 * ditandai `unavailable: true`. FE mendorong ke cart lokal, bukan buat order baru.
 */
export function postReorder(orderId: string): Promise<{ items: CartItemDTO[] }> {
  return apiFetch<{ items: CartItemDTO[] }>(`/orders/${orderId}/reorder`, { method: 'POST' });
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
