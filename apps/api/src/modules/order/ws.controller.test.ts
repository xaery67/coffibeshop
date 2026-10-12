import { describe, it, expect } from 'vitest';
import { attachOrderQueueWs, getOrderQueueWs } from './ws.controller.js';

/**
 * WebSocket order queue (F-011, TC-F011) — kontrak path & guard auth.
 *
 * Uji di sini bersifat struktural (tanpa socket nyata): path upgrade HARUS
 * persis `/api/v1/orders/queue/ws` (kontrak PRD §2.3 & `buildQueueWsUrl` FE),
 * dan server hanya boleh attach SEKALI ke HTTP server API.
 */

describe('OrderQueueWsServer — kontrak path (PRD §2.3)', () => {
  it('memakai path /api/v1/orders/queue/ws (bukan port/path terpisah)', async () => {
    // Baca sumber untuk memastikan path konstan sesuai kontrak (regression guard).
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./ws.controller.ts', import.meta.url), 'utf8'),
    );
    expect(src).toContain("const WS_PATH = '/api/v1/orders/queue/ws'");
    // Tidak boleh ada server/listen port terpisah.
    expect(src).not.toContain('WS_PORT');
    expect(src).not.toContain('httpServer.listen');
  });

  it('subscribe Redis memakai event ioredis (on message), bukan callback subscribe', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./ws.controller.ts', import.meta.url), 'utf8'),
    );
    expect(src).toContain("redisSubscriber.on('message'");
    expect(src).toContain("subscribe('order:created', 'order:status', 'order:cancelled')");
  });

  it('attach() idempoten — dua kali attach tidak menduplikasi handler', () => {
    const fakeServer = { on: () => fakeServer } as never;
    const a = attachOrderQueueWs(fakeServer);
    const b = attachOrderQueueWs(fakeServer);
    expect(a).toBe(b);
    expect(getOrderQueueWs()).toBe(a);
    expect(a.getConnectedClients()).toBe(0);
  });

  it('menolak klien tanpa token (guard auth ada di sumber)', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./ws.controller.ts', import.meta.url), 'utf8'),
    );
    expect(src).toContain("ws.close(4001, 'Authentication required')");
    expect(src).toContain("ws.close(4003, 'Insufficient permissions')");
    expect(src).toContain("STAFF_ROLES = ['owner', 'manager', 'kasir', 'barista']");
  });

  it('broadcast hanya ke staff outlet yang sama; owner menerima semua', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./ws.controller.ts', import.meta.url), 'utf8'),
    );
    expect(src).toContain("client.role === 'owner' || (!!outletId && client.outletId === outletId)");
  });
});
