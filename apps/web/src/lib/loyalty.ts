import { apiFetch } from './api.js';

/**
 * Loyalty — kontrak issue #12 (backend @backend-engineer, PRD-BACKEND §2.6).
 *
 * Brief #12: `GET /loyalty/points`, `GET /loyalty/vouchers`, `POST /loyalty/redeem`.
 * PRD §4.3 memakai `/loyalty/profile` + `/loyalty/history`. Respons dinormalisasi
 * agar UI tetap jalan pada kedua bentuk kontrak (poin `points`/`total_points`,
 * voucher dari `vouchers` atau array langsung).
 */

export interface LoyaltyPointLog {
  id?: string;
  type: string; // 'earn' | 'redeem' | ...
  points: number;
  description?: string | null;
  created_at: string;
}

export interface LoyaltyPoints {
  points: number;
  history: LoyaltyPointLog[];
}

export interface Voucher {
  id?: string;
  code: string;
  title?: string;
  discount_type?: string;
  discount_value?: number;
  min_purchase?: number;
  expires_at?: string | null;
  is_active?: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function normalizePoints(raw: unknown): LoyaltyPoints {
  const r = (raw ?? {}) as Record<string, unknown>;
  const points = num(r.points) ?? num(r.total_points) ?? num(r.balance) ?? 0;
  const history = Array.isArray(r.history)
    ? (r.history as LoyaltyPointLog[])
    : Array.isArray(r.data)
      ? (r.data as LoyaltyPointLog[])
      : [];
  return { points, history };
}

/** GET /loyalty/points — saldo poin + riwayat. */
export async function getLoyaltyPoints(): Promise<LoyaltyPoints> {
  const raw = await apiFetch<unknown>('/loyalty/points');
  return normalizePoints(raw);
}

/** GET /loyalty/vouchers — daftar voucher aktif milik member. */
export async function getLoyaltyVouchers(): Promise<Voucher[]> {
  const raw = await apiFetch<unknown>('/loyalty/vouchers');
  const r = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(raw)) return raw as Voucher[];
  if (Array.isArray(r.vouchers)) return r.vouchers as Voucher[];
  if (Array.isArray(r.data)) return r.data as Voucher[];
  return [];
}

export interface RedeemInput {
  points_to_redeem: number;
}

export interface RedeemResult {
  voucher_code: string;
  points_redeemed: number;
  discount_amount: number;
  expires_at: string;
}

/** POST /loyalty/redeem — tukar poin jadi voucher/diskon. */
export async function postRedeem(input: RedeemInput): Promise<RedeemResult> {
  const raw = await apiFetch<unknown>('/loyalty/redeem', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    voucher_code: typeof r.voucher_code === 'string' ? r.voucher_code : '',
    points_redeemed: num(r.points_redeemed) ?? num(r.pointsRedeemed) ?? 0,
    discount_amount: num(r.discount_amount) ?? num(r.discountAmount) ?? 0,
    expires_at: typeof r.expires_at === 'string' ? r.expires_at : '',
  };
}

/** Nilai rupiah dari poin (untuk preview redeem); `point_value` dari /config. */
export function pointsToRupiah(points: number, pointValue: number): number {
  return Math.max(0, Math.floor(points)) * Math.max(0, pointValue);
}
