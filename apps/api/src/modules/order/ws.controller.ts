import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { redisSubscriber } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { verifyAccess } from '../auth/token.service.js';

/**
 * WebSocket order queue (F-011, PRD-BACKEND §2.3, ADR-009).
 *
 * Endpoint: `wss://<host>/api/v1/orders/queue/ws?outlet_id=<id>&token=<jwt>`
 * — upgrade di server HTTP yang SAMA dengan API (tanpa port terpisah), path
 * persis seperti kontrak PRD & yang dipakai `apps/web` (`buildQueueWsUrl`).
 *
 * Auth : JWT staff via query `token` atau header `Authorization: Bearer`.
 * Fan-out: Redis pub/sub (`order:created|status|cancelled`) → semua staff outlet
 *          yang sama; owner menerima seluruh outlet.
 * Heartbeat: ping tiap `SSE_HEARTBEAT_INTERVAL_MS` (15s).
 */

const WS_PATH = '/api/v1/orders/queue/ws';
const STAFF_ROLES = ['owner', 'manager', 'kasir', 'barista'];

interface WsClient {
  ws: WebSocket;
  userId: string;
  role: string;
  outletId: string | null;
}

interface OrderEventPayload {
  type?: string;
  outlet_id?: string | null;
  [k: string]: unknown;
}

export class OrderQueueWsServer {
  private wss = new WebSocketServer({ noServer: true });
  private clients = new Map<string, WsClient>();
  private attached = false;

  /** Pasang handler upgrade pada HTTP server API + subscribe channel Redis. */
  attach(server: Server): void {
    if (this.attached) return;
    this.attached = true;

    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (url.pathname !== WS_PATH) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws, req) => {
      void this.handleConnection(ws, req as Parameters<typeof this.handleConnection>[1]);
    });
    this.wss.on('error', (err) => logger.error({ err: err.message }, 'WebSocket server error'));

    // ioredis: pesan datang lewat event 'message' — BUKAN callback subscribe().
    redisSubscriber.on('message', (channel: string, message: string) => {
      this.onRedisMessage(channel, message);
    });
    void redisSubscriber
      .subscribe('order:created', 'order:status', 'order:cancelled')
      .then(() => logger.info({ path: WS_PATH }, 'WS order queue siap + subscribed Redis'))
      .catch((err) => logger.error({ err: (err as Error).message }, 'WS gagal subscribe Redis'));
  }

  private onRedisMessage(channel: string, raw: string): void {
    let payload: OrderEventPayload;
    try {
      payload = JSON.parse(raw) as OrderEventPayload;
    } catch {
      logger.warn({ channel }, 'WS: pesan Redis bukan JSON, dilewati');
      return;
    }

    const outletId = (payload.outlet_id as string | null | undefined) ?? null;
    const data = raw;

    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      // Owner menerima semua outlet; staff hanya outlet-nya sendiri.
      const allowed = client.role === 'owner' || (!!outletId && client.outletId === outletId);
      if (!allowed) continue;
      try {
        client.ws.send(data);
      } catch (err) {
        logger.warn({ clientId, err: (err as Error).message }, 'WS: gagal kirim ke klien');
      }
    }
  }

  private async handleConnection(ws: WebSocket, req: { url?: string; headers: Record<string, unknown> }): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const header = req.headers.authorization;
    const token =
      url.searchParams.get('token') ??
      (typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null);
    const outletIdParam = url.searchParams.get('outlet_id');

    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }

    let payload: { sub: string; role: string; outlet_id?: string | null };
    try {
      payload = (await verifyAccess(token)) as unknown as typeof payload;
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    if (!STAFF_ROLES.includes(String(payload.role))) {
      ws.close(4003, 'Insufficient permissions');
      return;
    }

    const outletId = payload.outlet_id ?? outletIdParam ?? null;
    if (payload.role !== 'owner' && !outletId) {
      ws.close(4003, 'Outlet ID required for staff');
      return;
    }

    const clientId = `${payload.sub}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client: WsClient = { ws, userId: payload.sub, role: String(payload.role), outletId };
    this.clients.set(clientId, client);
    logger.info({ clientId, role: client.role, outletId }, 'WS klien terhubung');

    ws.send(
      JSON.stringify({
        type: 'connected',
        clientId,
        outlet_id: outletId,
        role: client.role,
        heartbeat_ms: env.SSE_HEARTBEAT_INTERVAL_MS,
      }),
    );

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      } else {
        clearInterval(heartbeat);
      }
    }, env.SSE_HEARTBEAT_INTERVAL_MS);

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as { type?: string };
        // 'pong' dari klien cukup diabaikan (koneksi hidup).
        if (msg.type && msg.type !== 'pong') {
          logger.debug({ clientId, type: msg.type }, 'WS pesan klien');
        }
      } catch {
        /* abaikan pesan non-JSON */
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(clientId);
      logger.info({ clientId }, 'WS klien terputus');
    });

    ws.on('error', (err) => logger.warn({ clientId, err: err.message }, 'WS error klien'));
  }

  async stop(): Promise<void> {
    for (const [, client] of this.clients) client.ws.close(1001, 'Server shutting down');
    this.clients.clear();
    try {
      await redisSubscriber.unsubscribe('order:created', 'order:status', 'order:cancelled');
    } catch {
      /* abaikan saat shutdown */
    }
    this.wss.close();
  }

  getConnectedClients(): number {
    return this.clients.size;
  }
}

// ── Singleton per-proses ──
let wsServerInstance: OrderQueueWsServer | null = null;

/** Pasang WS ke HTTP server API (dipanggil dari `server.ts` setelah `app.listen`). */
export function attachOrderQueueWs(server: Server): OrderQueueWsServer {
  if (!wsServerInstance) wsServerInstance = new OrderQueueWsServer();
  wsServerInstance.attach(server);
  return wsServerInstance;
}

export function getOrderQueueWs(): OrderQueueWsServer | null {
  return wsServerInstance;
}
