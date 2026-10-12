import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';

/**
 * WS order queue — auth & fan-out NYATA (issue #55, §4.9/§4.11).
 *
 * Menjalankan HTTP server sungguhan + `OrderQueueWsServer.attach()`, lalu membuka
 * koneksi WebSocket nyata ke `ws://127.0.0.1:<port>/api/v1/orders/queue/ws`.
 *
 * Yang dibuktikan:
 *   - tanpa token          → ditutup 4001 "Authentication required"
 *   - token invalid        → ditutup 4001 "Invalid token"
 *   - role member/guest    → ditutup 4003 "Insufficient permissions"
 *   - staff tanpa outlet   → ditutup 4003 "Outlet ID required for staff"
 *   - kasir dgn outlet     → menerima event `connected` + fan-out outlet sama
 *   - fan-out HANYA ke outlet yang sama; owner menerima semua
 *
 * `verifyAccess` di-mock (tanpa RS256/Redis); Redis subscriber di-stub sehingga kami
 * memicu `onRedisMessage` lewat publish internal.
 */

const h = vi.hoisted(() => ({ current: null as null | { sub: string; role: string; outlet_id?: string | null } }));

vi.mock('../../modules/auth/token.service.js', () => ({
  verifyAccess: async (t: string) => {
    if (t === 'invalid' || !h.current) throw Object.assign(new Error('invalid'), { status: 401 });
    return { typ: 'access', jti: 'j1', ...h.current };
  },
}));

// Subscriber Redis: simpan handler 'message' agar bisa dipicu manual.
const sub = vi.hoisted(() => ({ handlers: [] as ((ch: string, msg: string) => void)[] }));
vi.mock('../../config/redis.js', () => ({
  redisSubscriber: {
    on: (evt: string, cb: any) => { if (evt === 'message') sub.handlers.push(cb); },
    subscribe: async () => undefined,
    unsubscribe: async () => undefined,
  },
  redisCache: { quit: async () => undefined },
  redisQueue: { quit: async () => undefined },
  redisPubSub: { publish: async () => 1 },
  pingRedis: async () => true,
}));

import { OrderQueueWsServer } from './ws.controller.js';

const WS_PATH = '/api/v1/orders/queue/ws';
let server: Server;
let wsServer: OrderQueueWsServer;
let port: number;

/** Buka WS dan tunggu hasil pertama (pesan atau penutupan). */
function connect(token: string, outletId?: string) {
  const url = `ws://127.0.0.1:${port}${WS_PATH}?token=${encodeURIComponent(token)}${outletId ? `&outlet_id=${outletId}` : ''}`;
  const ws = new WebSocket(url);
  return ws;
}

/** Tunggu pesan pertama (JSON) atau close code. */
function firstOutcome(ws: WebSocket): Promise<{ type: string; data?: any; closeCode?: number; closeReason?: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout menunggu outcome WS')), 5000);
    ws.on('message', (raw) => {
      clearTimeout(timer);
      resolve({ type: 'message', data: JSON.parse(raw.toString()) });
    });
    ws.on('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ type: 'close', closeCode: code, closeReason: reason.toString() });
    });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

beforeAll(async () => {
  server = createServer((_req, res) => { res.writeHead(404); res.end(); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  port = typeof addr === 'object' && addr ? addr.port : 0;
  wsServer = new OrderQueueWsServer();
  wsServer.attach(server);
});

afterAll(async () => {
  await wsServer?.stop();
  await new Promise<void>((r) => server.close(() => r()));
});

describe('WS auth guards (nyata, koneksi WebSocket sungguhan)', () => {
  it('tanpa token → close 4001 Authentication required', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`);
    const out = await firstOutcome(ws);
    expect(out.type).toBe('close');
    expect(out.closeCode).toBe(4001);
    expect(out.closeReason).toMatch(/Authentication required/i);
  });

  it('token invalid → close 4001 Invalid token', async () => {
    h.current = null;
    const ws = connect('invalid', 'outlet-1');
    const out = await firstOutcome(ws);
    expect(out.type).toBe('close');
    expect(out.closeCode).toBe(4001);
    expect(out.closeReason).toMatch(/Invalid token/i);
  });

  it('role member → close 4003 Insufficient permissions', async () => {
    h.current = { sub: 'u-member', role: 'member', outlet_id: 'outlet-1' };
    const ws = connect('tok', 'outlet-1');
    const out = await firstOutcome(ws);
    expect(out.type).toBe('close');
    expect(out.closeCode).toBe(4003);
    expect(out.closeReason).toMatch(/Insufficient permissions/i);
  });

  it('role guest → close 4003', async () => {
    h.current = { sub: 'u-guest', role: 'guest', outlet_id: 'outlet-1' };
    const ws = connect('tok', 'outlet-1');
    const out = await firstOutcome(ws);
    expect(out.closeCode).toBe(4003);
  });

  it('staff (kasir) tanpa outlet → close 4003 Outlet ID required for staff', async () => {
    h.current = { sub: 'u-kasir', role: 'kasir', outlet_id: null };
    const ws = connect('tok');
    const out = await firstOutcome(ws);
    expect(out.type).toBe('close');
    expect(out.closeCode).toBe(4003);
    expect(out.closeReason).toMatch(/Outlet ID required for staff/i);
  });

  it('kasir dgn outlet → koneksi diterima, event `connected` + role benar', async () => {
    h.current = { sub: 'u-kasir', role: 'kasir', outlet_id: 'outlet-A' };
    const ws = connect('tok', 'outlet-A');
    const out = await firstOutcome(ws);
    expect(out.type).toBe('message');
    expect(out.data.type).toBe('connected');
    expect(out.data.role).toBe('kasir');
    expect(out.data.outlet_id).toBe('outlet-A');
    ws.close();
  });

  it('owner tanpa outlet tetap diterima (lintas outlet)', async () => {
    h.current = { sub: 'u-owner', role: 'owner', outlet_id: null };
    const ws = connect('tok');
    const out = await firstOutcome(ws);
    expect(out.type).toBe('message');
    expect(out.data.type).toBe('connected');
    expect(out.data.role).toBe('owner');
    ws.close();
  });
});

describe('WS fan-out — hanya outlet yang sama (kecuali owner)', () => {
  it('kasir outlet-A menerima event outlet-A; TIDAK menerima outlet-B', async () => {
    h.current = { sub: 'u-kasirA', role: 'kasir', outlet_id: 'outlet-A' };
    const ws = connect('tok', 'outlet-A');
    await firstOutcome(ws); // 'connected'

    const received: any[] = [];
    ws.on('message', (raw) => received.push(JSON.parse(raw.toString())));

    // Picu pesan Redis untuk outlet-A lalu outlet-B.
    const emit = (payload: any) => sub.handlers.forEach((cb) => cb('order:status', JSON.stringify(payload)));
    emit({ type: 'status', order_id: 'oA', outlet_id: 'outlet-A', status: 'CONFIRMED' });
    emit({ type: 'status', order_id: 'oB', outlet_id: 'outlet-B', status: 'CONFIRMED' });

    await new Promise((r) => setTimeout(r, 300));
    const statuses = received.filter((m) => m.type === 'status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0].order_id).toBe('oA');
    ws.close();
  });

  it('owner menerima event dari SEMUA outlet', async () => {
    h.current = { sub: 'u-owner', role: 'owner', outlet_id: null };
    const ws = connect('tok');
    await firstOutcome(ws);

    const received: any[] = [];
    ws.on('message', (raw) => received.push(JSON.parse(raw.toString())));
    const emit = (payload: any) => sub.handlers.forEach((cb) => cb('order:status', JSON.stringify(payload)));
    emit({ type: 'status', order_id: 'oA', outlet_id: 'outlet-A', status: 'PAID' });
    emit({ type: 'status', order_id: 'oB', outlet_id: 'outlet-B', status: 'PAID' });

    await new Promise((r) => setTimeout(r, 300));
    const statuses = received.filter((m) => m.type === 'status');
    expect(statuses.map((s) => s.order_id).sort()).toEqual(['oA', 'oB']);
    ws.close();
  });
});
