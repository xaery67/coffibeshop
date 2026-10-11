import { useEffect, useState } from 'react';

export interface TrackState {
  status: string | null;
  estimated_ready_time: string | null;
  connected: boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/**
 * Lacak order: SSE primary + fallback polling 3s (ADR-009).
 * SSE dianggap "primary"; bila error, beralih ke polling.
 */
export function useOrderTracking(token?: string): TrackState {
  const [state, setState] = useState<TrackState>({ status: null, estimated_ready_time: null, connected: false });

  useEffect(() => {
    if (!token) return;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const apply = (d: any) =>
      setState({ status: d.status ?? null, estimated_ready_time: d.estimated_ready_time ?? null, connected: true });

    const startPolling = () => {
      if (poll || closed) return;
      const tick = async () => {
        try {
          const res = await fetch(`${API_BASE}/orders/track/${token}`);
          const body = await res.json();
          if (body?.success) apply(body.data);
        } catch { /* ignore */ }
      };
      tick();
      poll = setInterval(tick, 3000);
    };

    try {
      es = new EventSource(`${API_BASE}/orders/track/${token}/events`);
      es.addEventListener('status_change', (e) => apply(JSON.parse((e as MessageEvent).data)));
      es.onopen = () => setState((s) => ({ ...s, connected: true }));
      es.onerror = () => {
        es?.close();
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      closed = true;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [token]);

  return state;
}
