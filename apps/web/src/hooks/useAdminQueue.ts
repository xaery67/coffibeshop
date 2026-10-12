import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueueOrderDTO } from '@coffibeshop/shared';
import { getOrderQueue, updateOrderStatus } from '../lib/admin.js';
import { applyQueueEvent, buildQueueWsUrl, parseQueueEvent, QUEUE_POLL_INTERVAL_MS } from '../lib/queue.js';
import { getToken } from './useAuth.js';

/**
 * Order queue realtime (F-011, PRD-BACKEND §2.3).
 *
 * Primary: WebSocket `wss://.../orders/queue/ws?outlet_id=`. Bila WS gagal/terputus,
 * otomatis jatuh ke **short polling** tiap 5s (fallback), lalu coba WS lagi saat
 * `online`. Data awal dari `GET /orders/queue` (juga jadi sumber setelah reconnect).
 */

export type QueueConnection = 'connecting' | 'live' | 'polling' | 'offline';

export function useAdminQueue(outletId: string | null, enabled = true) {
  const qc = useQueryClient();
  const [liveOrders, setLiveOrders] = useState<QueueOrderDTO[] | null>(null);
  const [connection, setConnection] = useState<QueueConnection>('connecting');
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'queue', outletId],
    queryFn: () => getOrderQueue(outletId!),
    enabled: enabled && Boolean(outletId),
    refetchInterval: connection === 'polling' ? QUEUE_POLL_INTERVAL_MS : false,
    staleTime: 0,
  });

  // Snapshot awal / hasil poll → jadikan basis daftar live (kecuali sudah ada event WS).
  const queryData = query.data;
  useEffect(() => {
    if (queryData && liveOrders === null) setLiveOrders(queryData);
  }, [queryData, liveOrders]);

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !outletId) {
      setConnection('offline');
      return;
    }
    closedRef.current = false;

    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closedRef.current) return;
      setConnection((c) => (c === 'live' ? c : 'connecting'));

      let ws: WebSocket;
      try {
        ws = new WebSocket(buildQueueWsUrl(outletId, getToken()));
      } catch {
        setConnection('polling');
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnection('live');
        // Sinkronkan ulang agar tidak ada event yang terlewat saat terputus.
        qc.invalidateQueries({ queryKey: ['admin', 'queue', outletId] });
      };

      ws.onmessage = (ev) => {
        const event = parseQueueEvent(ev.data);
        if (!event) return;
        setLastEventAt(Date.now());
        setLiveOrders((prev) => applyQueueEvent(prev ?? [], event));
      };

      ws.onerror = () => {
        // Biarkan onclose menangani reconnect.
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (closedRef.current) return;
        setConnection('polling');
        const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
        retryRef.current += 1;
        pollTimer = setTimeout(connect, delay);
      };
    };

    connect();

    const onOnline = () => {
      if (!closedRef.current && (!wsRef.current || wsRef.current.readyState > WebSocket.OPEN)) connect();
    };
    window.addEventListener('online', onOnline);

    return () => {
      closedRef.current = true;
      window.removeEventListener('online', onOnline);
      if (pollTimer) clearTimeout(pollTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [outletId, enabled, qc]);

  const orders = liveOrders ?? query.data ?? [];
  const isLoading = query.isLoading && liveOrders === null;

  return useMemo(
    () => ({
      orders,
      isLoading,
      error: query.error as Error | null,
      connection,
      lastEventAt,
      refetch: query.refetch,
    }),
    [orders, isLoading, query.error, query.refetch, connection, lastEventAt],
  );
}

/** PUT /orders/{id}/status dengan optimistic update pada cache queue. */
export function useUpdateOrderStatus(outletId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status, note }: { orderId: string; status: string; note?: string }) =>
      updateOrderStatus(orderId, status, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'queue', outletId] }),
  });
}
