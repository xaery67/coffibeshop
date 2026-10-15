import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * `useOrderTracking` — pelacakan real-time (PRD-FRONTEND §4.4b, ADR-009, AC-09).
 *
 * Transport:
 * 1. **SSE primary** — `GET /orders/track/{token}/events` (guest, publik).
 *    Event `status_change` → update tanpa refetch penuh; heartbeat 15s.
 * 2. **Fallback polling** — `GET /orders/track/{token}` tiap
 *    `config.tracking_poll_interval_ms` (default 3s) bila SSE gagal/terputus.
 * 3. **Backoff** — jeda polling naik 3s → 6s → 12s → … (maks 30s) saat gagal
 *    berturut-turut; **kembali ke SSE saat `online`** (reconnect).
 *
 * Catatan member: `EventSource` tidak bisa menyetel header `Authorization`,
 * sedangkan `GET /orders/{id}/events` butuh JWT. Untuk `orderId` (member) kita
 * memakai polling ber-header sebagai jalur utama; guest (token) memakai SSE.
 */

export type TrackingMode = 'idle' | 'sse' | 'polling';

export interface TrackState {
  status: string | null;
  estimated_ready_time: string | null;
  updated_at: string | null;
  connected: boolean;
  mode: TrackingMode;
  error: string | null;
  /**
   * Paksa muat ulang status SEKARANG (tanpa menunggu interval SSE/polling).
   *
   * Dipakai halaman pembayaran setelah `POST /payments/:orderId/verify` bilang
   * gateway sudah settled: tanpa ini UI tetap "Menunggu pembayaran" walau order
   * sudah PAID (event SSE bisa tak sampai / telat).
   */
  refresh: () => Promise<void>;
}

export interface TrackingTarget {
  orderId?: string;
  token?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const DEFAULT_POLL_MS = 3000;
const MAX_BACKOFF_MS = 30_000;

const INITIAL: TrackState = {
  status: null,
  estimated_ready_time: null,
  updated_at: null,
  connected: false,
  mode: 'idle',
  error: null,
  refresh: async () => {},
};

function normalizeTarget(target?: string | TrackingTarget): TrackingTarget {
  if (!target) return {};
  if (typeof target === 'string') return { token: target };
  return target;
}

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cs.accessToken') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function pick(data: any): Partial<TrackState> {
  if (!data || typeof data !== 'object') return {};
  return {
    status: data.status ?? null,
    estimated_ready_time: data.estimated_ready_time ?? null,
    updated_at: data.updated_at ?? data.at ?? null,
  };
}

/**
 * @param target `token` (guest, SSE) dan/atau `orderId` (member, polling).
 *   Boleh string (dianggap token) demi kompatibilitas pemanggil lama.
 * @param opts.pollMs interval polling; default dari config (3s).
 */
export function useOrderTracking(
  target?: string | TrackingTarget,
  opts: { pollMs?: number } = {},
): TrackState {
  const { token, orderId } = normalizeTarget(target);
  const pollMs = opts.pollMs && opts.pollMs > 0 ? opts.pollMs : DEFAULT_POLL_MS;

  const [state, setState] = useState<TrackState>(INITIAL);
  const backoffRef = useRef(0);

  const apply = useCallback((data: unknown) => {
    setState((s) => ({ ...s, ...pick(data), connected: true, error: null }));
  }, []);

  const pollOnce = useCallback(async (): Promise<boolean> => {
    const url = token ? `${API_BASE}/orders/track/${token}` : `${API_BASE}/orders/${orderId}`;
    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body?.success) throw new Error(body?.error?.message ?? 'Gagal memuat status');
      apply(body.data);
      return true;
    } catch (e) {
      setState((s) => ({
        ...s,
        connected: false,
        error: e instanceof Error ? e.message : 'Koneksi terputus',
      }));
      return false;
    }
  }, [token, orderId, apply]);

  useEffect(() => {
    if (!token && !orderId) {
      setState(INITIAL);
      return;
    }

    let closed = false;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // ── Polling dengan backoff eksponensial ──
    const schedulePoll = (delayMs: number) => {
      if (closed) return;
      timer = setTimeout(async () => {
        if (closed) return;
        const ok = await pollOnce();
        if (closed) return;
        if (ok) {
          backoffRef.current = 0;
          setState((s) => ({ ...s, mode: 'polling' }));
          schedulePoll(pollMs);
        } else {
          backoffRef.current = Math.min(backoffRef.current + 1, 4);
          schedulePoll(Math.min(pollMs * 2 ** (backoffRef.current - 1), MAX_BACKOFF_MS));
        }
      }, delayMs);
    };

    const startPolling = () => {
      if (closed || timer) return;
      setState((s) => ({ ...s, mode: 'polling' }));
      void pollOnce();
      schedulePoll(pollMs);
    };

    const stopPolling = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    // ── SSE (guest token) ──
    const startSse = () => {
      if (closed || !token || typeof EventSource === 'undefined') {
        startPolling();
        return;
      }
      try {
        setState((s) => ({ ...s, mode: 'sse' }));
        // Ambil status AWAL sekarang juga. Tanpa ini halaman guest yang dibuka
        // SETELAH order dibuat (kasus normal) tak pernah tahu status terkini —
        // `status_change` hanya datang saat status BERUBAH, jadi UI macet di
        // "Memuat status pesanan…" sampai ada perubahan status.
        void pollOnce();
        es = new EventSource(`${API_BASE}/orders/track/${token}/events`);
        es.addEventListener('status_change', (e) => {
          try {
            apply(JSON.parse((e as MessageEvent).data));
          } catch {
            /* payload rusak — abaikan, tunggu event berikutnya */
          }
        });
        es.onopen = () => {
          backoffRef.current = 0;
          setState((s) => ({ ...s, connected: true, error: null, mode: 'sse' }));
        };
        es.onerror = () => {
          es?.close();
          es = null;
          if (closed) return;
          setState((s) => ({ ...s, error: 'Koneksi real-time terputus — beralih ke polling.' }));
          startPolling();
        };
      } catch {
        startPolling();
      }
    };

    // ── Reconnect ke SSE saat jaringan kembali (bila guest) ──
    const onOnline = () => {
      if (closed) return;
      if (token && !es) {
        stopPolling();
        startSse();
      } else {
        void pollOnce();
      }
    };

    if (token) startSse();
    else startPolling();

    window.addEventListener?.('online', onOnline);

    return () => {
      closed = true;
      es?.close();
      stopPolling();
      window.removeEventListener?.('online', onOnline);
    };
  }, [token, orderId, pollMs, apply, pollOnce]);

  /**
   * `refresh` — muat ulang status sekarang juga (dipakai PaymentPage setelah
   * `verify` bilang gateway sudah settled, agar UI langsung berubah tanpa
   * menunggu SSE/polling).
   */
  const refresh = useCallback(async () => {
    await pollOnce();
  }, [pollOnce]);

  return { ...state, refresh };
}