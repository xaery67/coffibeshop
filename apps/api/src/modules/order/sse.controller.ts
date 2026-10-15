import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * SSE untuk pelacakan order (ADR-009).
 * - Member : GET /orders/:id/events
 * - Guest  : GET /orders/track/:token/events
 * Heartbeat `event: ping` tiap 15s. Butuh proxy tanpa buffering (DEVOPS §1.6).
 */

interface SseClient {
  id: string;
  res: Response;
}
const clients = new Map<string, Set<SseClient>>(); // orderKey -> clients

export function publishOrderEvent(orderKey: string, payload: Record<string, unknown>): void {
  const set = clients.get(orderKey);
  if (!set) return;
  const data = `event: status_change\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of set) c.res.write(data);
}

/**
 * Publish ke SEMUA key yang mungkin di-subscribe klien.
 *
 * Klien guest (`PaymentPage`/`TrackPage`) membuka `/orders/track/{tracking_token}/events`
 * → terdaftar dengan key = **tracking_token**. Klien member membuka `/orders/{id}/events`
 * → key = **order_id**. Mengirim hanya ke `order_id` membuat stream guest tak pernah
 * menerima `status_change` (gejala: UI macet "Menunggu pembayaran" walau sudah dibayar),
 * jadi kita siarkan ke keduanya.
 */
export function publishOrderStatus(
  order: { id: string; tracking_token?: string | null },
  payload: Record<string, unknown>,
): void {
  publishOrderEvent(order.id, payload);
  if (order.tracking_token) publishOrderEvent(order.tracking_token, payload);
}

export function streamOrderEvents(req: Request, res: Response): void {
  const orderKey = (req.params.token as string) || (req.params.id as string) || 'unknown';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // matikan buffering di nginx/ingress
  });
  res.write(`retry: ${env.TRACKING_POLL_INTERVAL_MS}\n\n`);
  res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  const client: SseClient = { id: `${Date.now()}-${Math.random()}`, res };
  if (!clients.has(orderKey)) clients.set(orderKey, new Set());
  clients.get(orderKey)!.add(client);
  logger.info({ orderKey, total: clients.get(orderKey)!.size }, 'sse client connected');

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  }, env.SSE_HEARTBEAT_INTERVAL_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.get(orderKey)?.delete(client);
    logger.info({ orderKey }, 'sse client disconnected');
  });
}
