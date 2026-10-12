import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * RBAC MATRIX — endpoint baru Sprint 4 (issue #55, §4.11).
 *
 * Cakupan:
 *   - `/reports/*`   → requireMinRole('kasir') / ('manager' untuk export)
 *   - `/inventory/*` → requireMinRole('kasir') / ('manager' untuk POST)
 *   - `PUT /orders/:id/status` → requireRole(staff) — customer/member HARUS ditolak
 *   - WS auth → role non-staff ditolak (lihat juga ws.controller.test.ts)
 *
 * Pendekatan: mount ROUTER SUNGGUHAN di app minimal; mock HANYA
 * `token.service.verifyAccess` (agar bisa "login" sebagai role apa pun) dan
 * Prisma (yang HARUS tidak tersentuh bila RBAC menolak). Status code yang diuji
 * adalah status asli dari rantai middleware produksi.
 */

const h = vi.hoisted(() => ({
  current: null as null | { sub: string; role: string; outlet_id?: string | null; jti?: string },
}));

vi.mock('../modules/auth/token.service.js', () => ({
  verifyAccess: async (_t: string) => {
    if (!h.current) throw Object.assign(new Error('token invalid'), { status: 401 });
    return { typ: 'access', jti: 'j1', ...h.current };
  },
  signAccess: vi.fn(),
  signRefresh: vi.fn(),
  issueTokens: vi.fn(),
  verifyRefresh: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('../config/redis.js', () => ({
  redisCache: { get: async () => null, setex: async () => 'OK', del: async () => 1, incr: async () => 1, pexpire: async () => 1, pttl: async () => 60000, quit: async () => undefined },
  redisQueue: { quit: async () => undefined },
  redisPubSub: { publish: async () => 1 },
  redisSubscriber: { on: () => undefined, subscribe: async () => undefined, unsubscribe: async () => undefined },
  pingRedis: async () => true,
}));

// Prisma: memanggilnya saat request seharusnya ditolak RBAC = kegagalan test.
const prismaCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('../config/prisma.js', () => {
  const failIfCalled = () => {
    prismaCalls.count += 1;
    throw new Error('Prisma TIDAK boleh dipanggil untuk request yang harus ditolak RBAC');
  };
  const model = new Proxy({}, { get: () => failIfCalled });
  return {
    prisma: new Proxy(
      { $transaction: failIfCalled, $queryRaw: failIfCalled, $executeRawUnsafe: failIfCalled },
      { get: (t, p) => (p in t ? (t as any)[p] : model) },
    ),
  };
});

import { reportingRouter } from '../modules/reporting/reporting.routes.js';
import { inventoryRouter } from '../modules/inventory/inventory.routes.js';
import { orderRouter } from '../modules/order/order.routes.js';
import { startServer, mountApp, expectError, type TestServer } from '../../test/harness.js';

let srv: TestServer;

beforeAll(async () => {
  const app = await mountApp([
    { path: '/api/v1/reports', router: reportingRouter },
    { path: '/api/v1/inventory', router: inventoryRouter },
    { path: '/api/v1/orders', router: orderRouter },
  ]);
  srv = await startServer(app);
});

afterAll(async () => {
  await srv?.close();
});

beforeEach(() => {
  h.current = null;
  prismaCalls.count = 0;
});

function loginAs(role: string, outlet_id: string | null = 'outlet-1') {
  h.current = { sub: `user-${role}`, role, outlet_id };
}

const AUTH = { Authorization: 'Bearer test-token' };

/** Daftar endpoint Sprint 4 + role minimal yang diwajibkan. */
const ENDPOINTS: { method: string; path: string; allowed: string[]; denied: string[] }[] = [
  // ── Reporting: minimal kasir (kecuali export → manager) ──
  { method: 'GET', path: '/api/v1/reports/daily', allowed: ['owner', 'manager', 'finance', 'kasir'], denied: ['barista', 'member', 'guest'] },
  { method: 'GET', path: '/api/v1/reports/kpi', allowed: ['owner', 'manager', 'finance', 'kasir'], denied: ['barista', 'member', 'guest'] },
  { method: 'GET', path: '/api/v1/reports/top-products', allowed: ['owner', 'manager', 'finance', 'kasir'], denied: ['barista', 'member', 'guest'] },
  { method: 'GET', path: '/api/v1/reports/monthly', allowed: ['owner', 'manager', 'finance', 'kasir'], denied: ['barista', 'member', 'guest'] },
  { method: 'GET', path: '/api/v1/reports/export/accounting', allowed: ['owner', 'manager'], denied: ['finance', 'kasir', 'barista', 'member', 'guest'] },

  // ── Inventory: baca minimal kasir; tulis minimal manager ──
  { method: 'GET', path: '/api/v1/inventory', allowed: ['owner', 'manager', 'finance', 'kasir'], denied: ['barista', 'member', 'guest'] },
  { method: 'GET', path: '/api/v1/inventory/logs', allowed: ['owner', 'manager', 'finance', 'kasir'], denied: ['barista', 'member', 'guest'] },
  { method: 'GET', path: '/api/v1/inventory/low-stock', allowed: ['owner', 'manager', 'finance', 'kasir'], denied: ['barista', 'member', 'guest'] },
  { method: 'GET', path: '/api/v1/inventory/alerts', allowed: ['owner', 'manager', 'finance', 'kasir'], denied: ['barista', 'member', 'guest'] },
  { method: 'POST', path: '/api/v1/inventory', allowed: ['owner', 'manager'], denied: ['finance', 'kasir', 'barista', 'member', 'guest'] },

  // ── Order status: staff-only (bukan customer) ──
  { method: 'PUT', path: '/api/v1/orders/11111111-1111-4111-8111-111111111111/status', allowed: ['owner', 'manager', 'kasir', 'barista'], denied: ['finance', 'member', 'guest'] },
  { method: 'GET', path: '/api/v1/orders/queue', allowed: ['owner', 'manager', 'kasir', 'barista'], denied: ['finance', 'member', 'guest'] },
];

describe('RBAC matrix Sprint 4 — endpoint ditolak untuk role di bawah ambang (403)', () => {
  for (const ep of ENDPOINTS) {
    for (const role of ep.denied) {
      it(`${role} → 403 pada ${ep.method} ${ep.path}`, async () => {
        loginAs(role);
        const res = await srv.request(ep.method, ep.path, {
          headers: AUTH,
          body: ep.method === 'PUT' || ep.method === 'POST' ? { status: 'CONFIRMED' } : undefined,
        });
        expect(res.status).toBe(403);
        expect(expectError(res.json).code).toBe('FORBIDDEN');
        // RBAC ditolak SEBELUM handler menyentuh DB.
        expect(prismaCalls.count).toBe(0);
      });
    }
  }
});

describe('RBAC matrix Sprint 4 — role berwenang lolos middleware (bukan 401/403)', () => {
  for (const ep of ENDPOINTS) {
    for (const role of ep.allowed) {
      it(`${role} lolos RBAC pada ${ep.method} ${ep.path}`, async () => {
        loginAs(role);
        const res = await srv.request(ep.method, ep.path, {
          headers: AUTH,
          body: ep.method === 'PUT' || ep.method === 'POST' ? { status: 'CONFIRMED', name: 'x', unit: 'g', outlet_id: 'outlet-1' } : undefined,
        });
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    }
  }
});

describe('Tanpa token → 401 pada semua endpoint staff Sprint 4', () => {
  for (const ep of ENDPOINTS) {
    it(`tanpa token → 401 pada ${ep.method} ${ep.path}`, async () => {
      h.current = null;
      const res = await srv.request(ep.method, ep.path);
      expect(res.status).toBe(401);
    });
  }
});

describe('Owner selalu lolos (akses penuh)', () => {
  it('owner tidak pernah 403 di endpoint Sprint 4', async () => {
    for (const ep of ENDPOINTS) {
      loginAs('owner');
      const res = await srv.request(ep.method, ep.path, {
        headers: AUTH,
        body: ep.method === 'PUT' || ep.method === 'POST' ? { status: 'CONFIRMED', name: 'x', unit: 'g', outlet_id: 'outlet-1' } : undefined,
      });
      expect(res.status, `${ep.method} ${ep.path}`).not.toBe(403);
    }
  });
});
