import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { redisPubSub } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { verifyAccess } from '../../modules/auth/token.service.js';
import { env } from '../../config/env.js';

interface WsClient {
  ws: WebSocket;
  userId: string;
  role: string;
  outletId: string | null;
  subscriptions: Set<string>;
}

/**
 * WebSocket server untuk order queue real-time (ADR-009).
 * - Endpoint: wss://.../queue/ws?outlet_id=XXX
 * - Auth: JWT di query param `token` atau header `Authorization: Bearer`
 * - Redis pub/sub fan-out ke semua staff outlet yang sama
 * - Heartbeat ping/pong tiap 15s
 */
export class OrderQueueWsServer {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, WsClient>(); // clientId -> client
  private httpServer: ReturnType<typeof createServer> | null = null;

  async start(): Promise<void> {
    // Create HTTP server for WebSocket upgrade
    this.httpServer = createServer();
    
    this.wss = new WebSocketServer({ 
      server: this.httpServer,
      path: '/queue/ws',
    });

    // Subscribe to Redis channels for order updates
    await this.subscribeToRedis();

    this.wss.on('connection', async (ws: WebSocket, req) => {
      await this.handleConnection(ws, req);
    });

    this.wss.on('error', (err) => {
      logger.error({ err: err.message }, 'WebSocket server error');
    });

    const port = env.WS_PORT ?? 4001;
    this.httpServer.listen(port, '0.0.0.0', () => {
      logger.info({ port }, 'Order queue WebSocket server started');
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
  }

  private async subscribeToRedis(): Promise<void> {
    // Subscribe to order status changes
    await redisPubSub.subscribe('order:status', (message) => {
      this.broadcastToRelevantClients(message);
    });
    
    await redisPubSub.subscribe('order:created', (message) => {
      this.broadcastToRelevantClients(message);
    });

    await redisPubSub.subscribe('order:cancelled', (message) => {
      this.broadcastToRelevantClients(message);
    });

    logger.info('Subscribed to Redis order channels');
  }

  private async handleConnection(ws: WebSocket, req: any): Promise<void> {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');
    const outletIdParam = url.searchParams.get('outlet_id');

    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }

    try {
      const payload = await verifyAccess(token);
      const userId = payload.sub;
      const role = payload.role;
      const outletId = payload.outlet_id ?? outletIdParam;

      // Validate staff role
      const staffRoles = ['owner', 'manager', 'kasir', 'barista'];
      if (!staffRoles.includes(role)) {
        ws.close(4003, 'Insufficient permissions');
        return;
      }

      // For non-owner, outlet_id is required
      if (role !== 'owner' && !outletId) {
        ws.close(4003, 'Outlet ID required for staff');
        return;
      }

      const clientId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      const client: WsClient = {
        ws,
        userId,
        role,
        outletId,
        subscriptions: new Set(),
      };

      // Auto-subscribe to relevant channels based on role/outlet
      if (role === 'owner') {
        client.subscriptions.add('order:*');
      } else if (outletId) {
        client.subscriptions.add(`order:outlet:${outletId}`);
      }

      this.clients.set(clientId, client);
      logger.info({ clientId, userId, role, outletId, subscriptions: Array.from(client.subscriptions) }, 'WebSocket client connected');

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        subscriptions: Array.from(client.subscriptions),
      }));

      // Heartbeat
      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        } else {
          clearInterval(heartbeat);
        }
      }, env.SSE_HEARTBEAT_INTERVAL_MS);

      // Handle incoming messages
      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleClientMessage(clientId, msg);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'Invalid WebSocket message');
        }
      });

      ws.on('close', () => {
        clearInterval(heartbeat);
        this.clients.delete(clientId);
        logger.info({ clientId }, 'WebSocket client disconnected');
      });

      ws.on('error', (err: Error) => {
        logger.warn({ clientId, err: err.message }, 'WebSocket error');
      });

    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'WebSocket auth failed');
      ws.close(4001, 'Invalid token');
    }
  }

  private handleClientMessage(clientId: string, msg: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (msg.type) {
      case 'subscribe':
        if (msg.channels) {
          for (const ch of msg.channels) {
            // Validate subscription based on role/outlet
            if (this.canSubscribe(client, ch)) {
              client.subscriptions.add(ch);
            }
          }
          client.ws.send(JSON.stringify({
            type: 'subscribed',
            channels: Array.from(client.subscriptions),
          }));
        }
        break;

      case 'unsubscribe':
        if (msg.channels) {
          for (const ch of msg.channels) {
            client.subscriptions.delete(ch);
          }
        }
        break;

      case 'pong':
        // Client responded to ping
        break;

      default:
        logger.warn({ clientId, type: msg.type }, 'Unknown WebSocket message type');
    }
  }

  private canSubscribe(client: WsClient, channel: string): boolean {
    // Owner can subscribe to anything
    if (client.role === 'owner') return true;
    
    // Staff can only subscribe to their outlet's channels
    if (client.outletId && channel.startsWith(`order:outlet:${client.outletId}`)) {
      return true;
    }
    
    // Staff can subscribe to global order updates
    if (channel === 'order:*') {
      return false; // Only owner
    }
    
    return false;
  }

  private broadcastToRelevantClients(message: any): void {
    const data = JSON.stringify(message);
    
    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;

      // Check if client subscribes to this message type
      const relevant = Array.from(client.subscriptions).some(sub => {
        if (sub === 'order:*') return true;
        if (message.outlet_id && sub === `order:outlet:${message.outlet_id}`) return true;
        if (sub === 'order:created' && message.type === 'created') return true;
        if (sub === 'order:status' && message.type === 'status') return true;
        if (sub === 'order:cancelled' && message.type === 'cancelled') return true;
        return false;
      });

      if (relevant) {
        try {
          client.ws.send(data);
        } catch (err) {
          logger.warn({ clientId, err: (err as Error).message }, 'Failed to send WebSocket message');
        }
      }
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping WebSocket server...');
    
    // Close all client connections
    for (const [clientId, client] of this.clients) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    // Unsubscribe from Redis
    await redisPubSub.unsubscribe('order:status');
    await redisPubSub.unsubscribe('order:created');
    await redisPubSub.unsubscribe('order:cancelled');

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }

    logger.info('WebSocket server stopped');
  }

  getConnectedClients(): number {
    return this.clients.size;
  }
}

// Singleton instance
let wsServerInstance: OrderQueueWsServer | null = null;

export async function startOrderQueueWs(): Promise<OrderQueueWsServer> {
  if (!wsServerInstance) {
    wsServerInstance = new OrderQueueWsServer();
    await wsServerInstance.start();
  }
  return wsServerInstance;
}

export function getOrderQueueWs(): OrderQueueWsServer | null {
  return wsServerInstance;
}