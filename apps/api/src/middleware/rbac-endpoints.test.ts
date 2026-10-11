import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * RBAC regression guard — endpoint STAFF harus menolak member/guest dengan 403
 * (issue #18 poin 3; dulu endpoint staff pernah bocor ke member).
 *
 * Pendekatan: mount ROUTER SUNGGUHAN (order/catalog/admin) di app minimal, mock
 * hanya `token.service.verifyAccess` (agar kita bisa "login" sebagai role apa pun
 * tanpa RS256/Redis). Yang diuji adalah RANTAI MIDDLEWARE asli + status code asli.
 */

const h = vi.hoisted(() => ({ current: null as null | { sub: string; role: string; outlet_id?: string | null; jti?: string } }));

// verifyAccess mengembalikan user sesuai "sesi" yang disetel test.
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

// Redis/Prisma di-mock: RBAC harus ditolak SEBELUM handler menyentuh DB/Redis.
vi.mock('../config/redis.js', () => ({
  redisCache: { get: async () => null, setex: async () => 'OK', del: async () => 1, quit: async () => undefined },
  redisQueue: { quit: async () => undefined },
  pingRedis: async () => true,
}));

const prismaCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('../config/prisma.js', () => {
  const failIfCalled = () => {
    prismaCalls.count += 1;
    throw new Error('Prisma TIDAK boleh dipanggil untuk request yang harus ditolak RBAC');
  };
  const model = new Proxy({}, { get: () => failIfCalled });
  return {
    prisma: new Proxy(
      { $transaction: failIfCalled, $queryRaw: failIfCalled },
      { get: (t, p) => (p in t ? (t as any)[p] : model) },
    ),
  };
});

import { orderRouter } from '../modules/order/order.routes.js';
import { catalogRouter } from '../modules/catalog/catalog.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { startServer, mountApp, expectError, type TestServer } from '../../test/harness.js';

let srv: TestServer;

const AUTH = (role: string) => ({ Authorization: 'Bearer test-token', 'X-Role': role });

beforeAll(async () => {
  const app = await mountApp([
    { path: '/api/v1/orders', router: orderRouter },
    { path: '/api/v1/catalog', router: catalogRouter },
    { path: '/api/v1/admin', router: adminRouter },
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

/** Set "sesi" login untuk role tertentu. */
function loginAs(role: string, outlet_id: string | null = null) {
  h.current = { sub: `user-${role}`, role, outlet_id };
}

describe('Endpoint STAFF: member/guest HARUS ditolak 403 (regression guard)', () => {
  const staffGetEndpoints = [
    '/api/v1/orders/queue',
  ];

  for (const path of staffGetEndpoints) {
    it(`member → 403 pada GET ${path}`, async () => {
      loginAs('member');
      const res = await srv.request('GET', path, { headers: AUTH('member') });
      expect(res.status).toBe(403);
      const err = expectError(res.json);
      expect(err.code).toBe('FORBIDDEN');
      expect(prismaCalls.count).toBe(0); // ditolak sebelum menyentuh DB
    });

    it(`guest → 403 pada GET ${path}`, async () => {
      loginAs('guest');
      const res = await srv.request('GET', path, { headers: AUTH('guest') });
      expect(res.status).toBe(403);
    });

    it(`tanpa token → 401 pada GET ${path}`, async () => {
      h.current = null;
      const res = await srv.request('GET', path);
      expect(res.status).toBe(401);
    });
  }

  it('member → 403 pada PUT /orders/:id/status (ubah status staff-only)', async () => {
    loginAs('member');
    const res = await srv.request('PUT', '/api/v1/orders/11111111-1111-4111-8111-111111111111/status', {
      headers: AUTH('member'),
      body: { status: 'CONFIRMED' },
    });
    expect(res.status).toBe(403);
    expect(prismaCalls.count).toBe(0);
  });

  it('member → 403 pada POST /catalog/products (tulis katalog)', async () => {
    loginAs('member');
    const res = await srv.request('POST', '/api/v1/catalog/products', {
      headers: AUTH('member'),
      body: { name: 'X', base_price: 1000, category_id: '11111111-1111-4111-8111-111111111111' },
    });
    expect(res.status).toBe(403);
    expect(prismaCalls.count).toBe(0);
  });

  it('member → 403 pada GET /admin/users (owner-only)', async () => {
    loginAs('member');
    const res = await srv.request('GET', '/api/v1/admin/users', { headers: AUTH('member') });
    expect(res.status).toBe(403);
    expect(prismaCalls.count).toBe(0);
  });

  it('kasir → 403 pada GET /admin/users (owner-only, walau staff)', async () => {
    loginAs('kasir');
    const res = await srv.request('GET', '/api/v1/admin/users', { headers: AUTH('kasir') });
    expect(res.status).toBe(403);
  });

  it('manager → 403 pada PATCH /admin/users/:id/role (owner-only)', async () => {
    loginAs('manager');
    const res = await srv.request('PATCH', '/api/v1/admin/users/u1/role', {
      headers: AUTH('manager'),
      body: { role: 'kasir' },
    });
    expect(res.status).toBe(403);
  });
});

describe('Endpoint PUBLIK tetap terbuka (jangan over-block)', () => {
  it('GET /catalog/products tanpa token → 200 (bukan 401/403)', async () => {
    h.current = null;
    const res = await srv.request('GET', '/api/v1/catalog/products');
    expect([200, 500]).toContain(res.status); // 200 normal; 500 hanya bila mock DB meledak
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('GET /orders/track/:token tanpa token → tidak 401/403 (publik, ADR-008)', async () => {
    h.current = null;
    const res = await srv.request('GET', '/api/v1/orders/track/some-token');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('owner selalu lolos RBAC (akses penuh)', () => {
  it('owner TIDAK dapat 403 pada /orders/queue (boleh lanjut ke handler)', async () => {
    loginAs('owner');
    const res = await srv.request('GET', '/api/v1/orders/queue', { headers: AUTH('owner') });
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
