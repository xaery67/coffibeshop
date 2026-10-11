import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

/** Redis in-memory (menghindari koneksi nyata di CI). */
const h = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock('../../config/redis.js', () => ({
  redisCache: {
    setex: async (k: string, _ttl: number, v: string) => void h.store.set(k, v),
    get: async (k: string) => h.store.get(k) ?? null,
    del: async (k: string) => void h.store.delete(k),
  },
  redisQueue: {},
  pingRedis: async () => true,
}));

import {
  issueTokens,
  verifyAccess,
  verifyRefresh,
  revoke,
  isBlocked,
  revokeAllForUser,
  isUserRevoked,
  fingerprint,
} from './token.service.js';
import { jwtKeys } from '../../lib/keys.js';

const USER = { id: '11111111-1111-1111-1111-111111111111', role: 'member', outlet_id: null };

beforeEach(() => h.store.clear());

describe('JWT RS256 (ADR-005)', () => {
  it('menerbitkan access + refresh token yang berbeda', () => {
    const t = issueTokens(USER);
    expect(t.access_token).toBeTruthy();
    expect(t.refresh_token).toBeTruthy();
    expect(t.access_token).not.toBe(t.refresh_token);
    expect(t.token_type).toBe('Bearer');
    expect(t.expires_in).toBeGreaterThan(0);
  });

  it('access token memakai algoritma RS256 + header kid', () => {
    const { access_token } = issueTokens(USER);
    const decoded = jwt.decode(access_token, { complete: true }) as any;
    expect(decoded.header.alg).toBe('RS256');
    expect(decoded.header.kid).toBe(jwtKeys.kid);
  });

  it('access token dapat diverifikasi dengan PUBLIC key saja (stateless)', () => {
    const { access_token } = issueTokens(USER);
    const payload = jwt.verify(access_token, jwtKeys.publicKey, { algorithms: ['RS256'] }) as any;
    expect(payload.sub).toBe(USER.id);
    expect(payload.role).toBe('member');
    expect(payload.typ).toBe('access');
  });

  it('verifyAccess mengembalikan payload yang benar', async () => {
    const { access_token } = issueTokens(USER);
    const p = await verifyAccess(access_token);
    expect(p.sub).toBe(USER.id);
    expect(p.role).toBe('member');
    expect(p.typ).toBe('access');
  });

  it('menolak token yang ditandatangani kunci lain (tidak bisa dipalsukan)', async () => {
    const forged = jwt.sign({ sub: USER.id, role: 'owner', typ: 'access', jti: 'x' }, 'rahasia-palsu');
    await expect(verifyAccess(forged)).rejects.toThrow();
  });

  it('menolak refresh token yang dipakai sebagai access token', async () => {
    const { refresh_token } = issueTokens(USER);
    await expect(verifyAccess(refresh_token)).rejects.toThrow(/Tipe token/);
  });

  it('menolak access token yang dipakai sebagai refresh token', async () => {
    const { access_token } = issueTokens(USER);
    await expect(verifyRefresh(access_token)).rejects.toThrow(/Tipe token/);
  });

  it('menolak token kedaluwarsa', async () => {
    const expired = jwt.sign(
      { sub: USER.id, role: 'member', typ: 'access', jti: 'e' },
      jwtKeys.privateKey,
      { algorithm: 'RS256', expiresIn: '-1s', keyid: jwtKeys.kid },
    );
    await expect(verifyAccess(expired)).rejects.toThrow(/tidak valid atau kedaluwarsa/);
  });
});

describe('revoke / blocklist (logout)', () => {
  it('token yang dicabut tidak bisa diverifikasi lagi', async () => {
    const { access_token } = issueTokens(USER);
    await expect(verifyAccess(access_token)).resolves.toBeTruthy();

    const payload = await verifyAccess(access_token);
    await revoke(access_token, payload);
    await expect(verifyAccess(access_token)).rejects.toThrow(/dicabut/);
  });

  it('rotasi refresh: token lama tidak valid setelah revoke', async () => {
    const { refresh_token } = issueTokens(USER);
    const p = await verifyRefresh(refresh_token);
    await revoke(refresh_token, p);
    await expect(verifyRefresh(refresh_token)).rejects.toThrow(/dipakai\/dicabut/);
  });

  it('isBlocked & fingerprint bekerja deterministik', async () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
    expect(await isBlocked('tidak-ada')).toBe(false);
  });

  it('token tanpa exp tidak diblokir (sudah kedaluwarsa)', async () => {
    await revoke('token-tanpa-exp', {});
    expect(h.store.size).toBe(0);
  });
});

describe('revokeAllForUser', () => {
  it('menandai semua sesi pengguna dicabut', async () => {
    expect(await isUserRevoked(USER.id)).toBe(false);
    await revokeAllForUser(USER.id);
    expect(await isUserRevoked(USER.id)).toBe(true);
  });
});
