import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';

/** Mock token.service (middleware auth hanya butuh verifyAccess). */
const h = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('../modules/auth/token.service.js', () => ({
  verifyAccess: (t: string) => h.verify(t),
}));

import {
  requireAuth,
  requireRole,
  requireMinRole,
  requireOutletScope,
  optionalAuth,
  hasRole,
} from './auth.js';

/** Jalankan middleware & tangkap error yang diteruskan ke next(). */
function run(mw: any, req: Partial<Request> = {}) {
  return new Promise<{ err?: any }>((resolve) => {
    mw(req as Request, {} as Response, (err?: any) => resolve({ err }));
  });
}

describe('requireAuth (RS256 + blocklist)', () => {
  it('menolak tanpa header Authorization', async () => {
    const { err } = await run(requireAuth, { headers: {} } as any);
    expect(err.status).toBe(401);
  });

  it('menolak skema selain Bearer', async () => {
    const { err } = await run(requireAuth, { headers: { authorization: 'Basic xyz' } } as any);
    expect(err.status).toBe(401);
  });

  it('menerima token valid & melampirkan req.user', async () => {
    h.verify.mockResolvedValueOnce({ sub: 'u1', role: 'kasir', outlet_id: 'o1', jti: 'j1' });
    const req: any = { headers: { authorization: 'Bearer token-valid' } };
    const { err } = await run(requireAuth, req);
    expect(err).toBeUndefined();
    expect(req.user).toEqual({ id: 'u1', role: 'kasir', outlet_id: 'o1', jti: 'j1' });
  });

  it('meneruskan error dari verifyAccess (token dicabut)', async () => {
    h.verify.mockRejectedValueOnce(Object.assign(new Error('Token sudah dicabut'), { status: 401 }));
    const { err } = await run(requireAuth, {
      headers: { authorization: 'Bearer revoked' },
    } as any);
    expect(err.status).toBe(401);
  });
});

describe('requireRole (RBAC 7 role)', () => {
  it('mengizinkan role yang sesuai', async () => {
    const mw = requireRole('kasir', 'manager');
    const { err } = await run(mw, { user: { id: 'u', role: 'kasir' } } as any);
    expect(err).toBeUndefined();
  });

  it('owner selalu lolos ke endpoint mana pun', async () => {
    const { err } = await run(requireRole('kasir'), { user: { id: 'u', role: 'owner' } } as any);
    expect(err).toBeUndefined();
  });

  it('menolak role yang tidak berhak (403)', async () => {
    const { err } = await run(requireRole('owner'), { user: { id: 'u', role: 'member' } } as any);
    expect(err.status).toBe(403);
  });

  it('menolak bila belum terautentikasi (401)', async () => {
    const { err } = await run(requireRole('kasir'), {} as any);
    expect(err.status).toBe(401);
  });
});

describe('requireMinRole (hierarki)', () => {
  it('kasir memenuhi minimal kasir', async () => {
    const { err } = await run(requireMinRole('kasir'), { user: { role: 'kasir' } } as any);
    expect(err).toBeUndefined();
  });
  it('manager memenuhi minimal kasir (level lebih tinggi)', async () => {
    const { err } = await run(requireMinRole('kasir'), { user: { role: 'manager' } } as any);
    expect(err).toBeUndefined();
  });
  it('member tidak memenuhi minimal kasir', async () => {
    const { err } = await run(requireMinRole('kasir'), { user: { role: 'member' } } as any);
    expect(err.status).toBe(403);
  });
});

describe('requireOutletScope', () => {
  it('manager tidak bisa akses outlet lain (403)', async () => {
    const { err } = await run(requireOutletScope, {
      user: { role: 'manager', outlet_id: 'o1' },
      params: { outletId: 'o2' },
      query: {},
      body: {},
    } as any);
    expect(err.status).toBe(403);
  });

  it('manager bisa akses outlet-nya sendiri', async () => {
    const req: any = {
      user: { role: 'manager', outlet_id: 'o1' },
      params: { outletId: 'o1' },
      query: {},
      body: {},
    };
    const { err } = await run(requireOutletScope, req);
    expect(err).toBeUndefined();
  });

  it('outlet_id klien ditimpa dengan milik user (anti-manipulasi)', async () => {
    const req: any = {
      user: { role: 'kasir', outlet_id: 'o1' },
      params: {},
      query: {},
      body: { outlet_id: 'o1' },
    };
    await run(requireOutletScope, req);
    expect(req.body.outlet_id).toBe('o1');
  });

  it('owner & finance lintas outlet (tidak dibatasi)', async () => {
    for (const role of ['owner', 'finance']) {
      const { err } = await run(requireOutletScope, {
        user: { role, outlet_id: null },
        params: { outletId: 'outlet-lain' },
        query: {},
        body: {},
      } as any);
      expect(err).toBeUndefined();
    }
  });

  it('manager tanpa outlet_id → 403', async () => {
    const { err } = await run(requireOutletScope, {
      user: { role: 'manager', outlet_id: null },
      params: {},
      query: {},
      body: {},
    } as any);
    expect(err.status).toBe(403);
  });
});

describe('optionalAuth', () => {
  it('lanjut sebagai guest bila tanpa token', async () => {
    const req: any = { headers: {} };
    const { err } = await run(optionalAuth, req);
    expect(err).toBeUndefined();
    expect(req.user).toBeUndefined();
  });

  it('melampirkan user bila token valid', async () => {
    h.verify.mockResolvedValueOnce({ sub: 'u9', role: 'member', outlet_id: null, jti: 'j' });
    const req: any = { headers: { authorization: 'Bearer ok' } };
    await run(optionalAuth, req);
    expect(req.user.id).toBe('u9');
  });

  it('tetap lanjut sebagai guest bila token invalid (tidak error)', async () => {
    h.verify.mockRejectedValueOnce(new Error('invalid'));
    const req: any = { headers: { authorization: 'Bearer bad' } };
    const { err } = await run(optionalAuth, req);
    expect(err).toBeUndefined();
    expect(req.user).toBeUndefined();
  });
});

describe('hasRole', () => {
  it('owner selalu true', () => expect(hasRole({ id: 'u', role: 'owner' }, 'kasir')).toBe(true));
  it('role cocok → true', () => expect(hasRole({ id: 'u', role: 'kasir' }, 'kasir')).toBe(true));
  it('role tidak cocok → false', () =>
    expect(hasRole({ id: 'u', role: 'member' }, 'kasir')).toBe(false));
  it('undefined → false', () => expect(hasRole(undefined, 'kasir')).toBe(false));
});
