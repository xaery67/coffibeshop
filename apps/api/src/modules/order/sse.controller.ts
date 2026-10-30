import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { NotFound } from '../../lib/http.js';

/**
 * SSE untuk pelacakan order (ADR-009).
 * - Member : GET /orders/:id/events
 * - Guest  : GET /orders/track/:token/events
 * Heartbeat `event: ping` tiap 15s. Butuh proxy tanpa buffering (DEVOPS §1.6).
 *
 * Order WAJIB diverifikasi sebelum stream dibuka: tanpa ini token sembarang
 * mendapat 200 + ping selamanya, sehingga UI menampilkan "Live" untuk order
 * yang tidak ada.
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

export async function streamOrderEvents(req: Request, res: Response): Promise<void> {
  const token = req.params.token as string | undefined;
  const orderId = req.params.id as string | undefined;
  const orderKey = token || orderId || 'unknown';

  // Guest: token harus cocok. Member: order harus ada & milik pemanggil.
  if (token) {
    const found = await prisma.order.findUnique({
      where: { tracking_token: token },
      select: { id: true },
    });
    if (!found) return next404(res);
  } else if (orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { user_id: true },
    });
    if (!order) return next404(res);
    const userId = (req as any).user?.id;
    if (order.user_id && order.user_id !== userId) return next404(res);
  } else {
    return next404(res);
  }

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

/** 404 dalam bentuk envelope API standar (bukan stream). */
function next404(res: Response): void {
  const err = NotFound('Token tidak valid atau order tidak ditemukan');
  res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } });
}
