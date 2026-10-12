import type { QueueOrderDTO } from '@coffibeshop/shared';

/**
 * Order queue (F-011, PRD-BACKEND §2.3) — state machine + realtime transport.
 *
 * Fungsi di sini **murni** (tanpa React/DOM) agar bisa diuji dan dipakai ulang oleh
 * hook realtime. Transisi status identik dengan `order.service.ts#updateStatus`.
 */

/** Transisi status kanonik — cermin backend (satu-satunya sumber kebenaran). */
export const ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['BEING_PREPARED', 'CANCELLED'],
  BEING_PREPARED: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const ACTION_LABELS: Record<string, string> = {
  CONFIRMED: 'Konfirmasi',
  BEING_PREPARED: 'Mulai siapkan',
  READY: 'Tandai siap',
  COMPLETED: 'Selesaikan',
  CANCELLED: 'Batalkan',
};

export type ActionVariant = 'primary' | 'secondary' | 'danger';

export interface QueueAction {
  status: string;
  label: string;
  variant: ActionVariant;
}

/** Transisi yang diizinkan dari `from` (array kosong bila tak dikenal / terminal). */
export function allowedTransitions(from?: string | null): string[] {
  if (!from) return [];
  return [...(ORDER_TRANSITIONS[from] ?? [])];
}

export function canTransition(from?: string | null, to?: string | null): boolean {
  if (!from || !to) return false;
  return allowedTransitions(from).includes(to);
}

/** Aksi tombol untuk staff (aksi maju + batal), urut sesuai state machine. */
export function staffActions(from?: string | null): QueueAction[] {
  return allowedTransitions(from).map((status) => ({
    status,
    label: ACTION_LABELS[status] ?? status,
    variant: status === 'CANCELLED' ? 'danger' : 'primary',
  }));
}

/** Kolom papan antrian (PRD-FRONTEND §2.4: Baru · Diproses · Siap · Selesai). */
export interface QueueColumn {
  key: string;
  label: string;
  statuses: readonly string[];
}

export const QUEUE_COLUMNS: readonly QueueColumn[] = [
  { key: 'new', label: 'Baru', statuses: ['PAID'] },
  { key: 'in_progress', label: 'Diproses', statuses: ['CONFIRMED', 'BEING_PREPARED'] },
  { key: 'ready', label: 'Siap', statuses: ['READY'] },
  { key: 'done', label: 'Selesai', statuses: ['COMPLETED'] },
];

/** Bagi daftar order ke kolom papan; order di luar kolom diabaikan (mis. CANCELLED). */
export function groupByColumn(orders: QueueOrderDTO[]): Record<string, QueueOrderDTO[]> {
  const out: Record<string, QueueOrderDTO[]> = {};
  for (const col of QUEUE_COLUMNS) {
    out[col.key] = orders.filter((o) => (col.statuses as readonly string[]).includes(o.status));
  }
  return out;
}

// ── Transport realtime ──

/**
 * Bangun URL WebSocket antrian: `wss://host/api/v1/orders/queue/ws?outlet_id=&token=`.
 * Base diambil dari `VITE_API_BASE_URL` (fallback `/api/v1`); bila base absolut
 * http(s) → dikonversi ke ws(s), bila relatif → memakai origin halaman.
 */
export function buildQueueWsUrl(
  outletId: string,
  token?: string | null,
  base?: string,
): string {
  const apiBase = base ?? import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
  let origin: string;
  let path: string;

  if (/^https?:\/\//i.test(apiBase)) {
    const u = new URL(apiBase);
    origin = `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`;
    path = u.pathname.replace(/\/+$/, '');
  } else {
    const loc = typeof window !== 'undefined' ? window.location : undefined;
    const proto = loc?.protocol === 'https:' ? 'wss:' : 'ws:';
    origin = loc ? `${proto}//${loc.host}` : 'ws://localhost';
    path = apiBase.replace(/\/+$/, '');
  }

  const params = new URLSearchParams({ outlet_id: outletId });
  if (token) params.set('token', token);
  return `${origin}${path}/orders/queue/ws?${params.toString()}`;
}

export interface QueueEvent {
  type: string;
  order?: QueueOrderDTO;
  order_id?: string;
  status?: string;
  timestamp?: string;
}

/** Parse payload WS; kembalikan `null` bila bukan JSON objek valid. */
export function parseQueueEvent(raw: unknown): QueueEvent | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const evt = parsed as QueueEvent;
    if (typeof evt.type !== 'string') return null;
    return evt;
  } catch {
    return null;
  }
}

/**
 * Terapkan satu event WS ke daftar order (imutabel):
 * - `order.created`/`order.updated` dengan `order` → upsert.
 * - `order.status_changed` dengan `order_id` + `status` → patch status; bila order
 *   belum ada di daftar, event diabaikan (refetch akan menyusul).
 * - `order.deleted`/status `CANCELLED` → keluarkan dari antrian.
 */
export function applyQueueEvent(orders: QueueOrderDTO[], event: QueueEvent): QueueOrderDTO[] {
  const isRemoval = event.type === 'order.deleted' || event.status === 'CANCELLED';

  if (event.order) {
    if (isRemoval) return orders.filter((o) => o.id !== event.order!.id);
    const idx = orders.findIndex((o) => o.id === event.order!.id);
    if (idx === -1) return [...orders, event.order];
    const next = orders.slice();
    next[idx] = { ...orders[idx], ...event.order };
    return next;
  }

  if (event.order_id && event.status) {
    if (isRemoval) return orders.filter((o) => o.id !== event.order_id);
    return orders.map((o) => (o.id === event.order_id ? { ...o, status: event.status as QueueOrderDTO['status'] } : o));
  }

  return orders;
}

/** Interval polling fallback (ms) — PRD-BACKEND §2.3 (short polling). */
export const QUEUE_POLL_INTERVAL_MS = 5000;
