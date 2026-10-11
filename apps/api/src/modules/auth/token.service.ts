import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { redisCache } from '../../config/redis.js';
import { jwtKeys } from '../../lib/keys.js';
import { Unauthorized } from '../../lib/http.js';
import type { Role } from '@coffibeshop/shared';

/**
 * Manajemen token — ADR-005: JWT **stateless RS256** + Redis blocklist.
 *
 *  - Access token : RS256, TTL 15m, payload `{ sub, role, outlet_id?, jti, typ:'access' }`
 *  - Refresh token: RS256, TTL 7d,  payload `{ sub, jti, typ:'refresh' }`
 *  - Logout/revoke: `jti` dimasukkan ke Redis blocklist sampai token kedaluwarsa.
 *  - Rotasi refresh: setiap `POST /auth/refresh` menerbitkan pasangan baru dan
 *    memblokir `jti` refresh lama (mitigasi token theft / replay).
 */

const BLOCKLIST_PREFIX = 'jwt:blocklist:';

export interface AccessPayload {
  sub: string;
  role: Role | string;
  outlet_id?: string | null;
  jti: string;
  typ: 'access';
  iat?: number;
  exp?: number;
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
  iat?: number;
  exp?: number;
}

/** Sisa umur token (detik) — untuk TTL blocklist. Minimal 1 detik. */
function ttlOf(payload: { exp?: number }): number {
  if (!payload.exp) return 0;
  return Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
}

/** Fingerprint token → dipakai sebagai kunci blocklist (tanpa menyimpan token mentah). */
export function fingerprint(token: string): string {
  return createHash('sha256').update(token).digest('base64url').slice(0, 32);
}

export function signAccess(user: { id: string; role: Role | string; outlet_id?: string | null }) {
  const jti = randomUUID();
  const token = jwt.sign(
    { sub: user.id, role: user.role, outlet_id: user.outlet_id ?? null, jti, typ: 'access' },
    jwtKeys.privateKey,
    { algorithm: 'RS256', expiresIn: env.JWT_ACCESS_TTL as any, keyid: jwtKeys.kid },
  );
  return { token, jti };
}

export function signRefresh(userId: string) {
  const jti = randomUUID();
  const token = jwt.sign(
    { sub: userId, jti, typ: 'refresh' },
    jwtKeys.privateKey,
    { algorithm: 'RS256', expiresIn: env.JWT_REFRESH_TTL as any, keyid: jwtKeys.kid },
  );
  return { token, jti };
}

/** Terbitkan pasangan token baru (dipakai login, register, dan rotasi refresh). */
export function issueTokens(user: { id: string; role: Role | string; outlet_id?: string | null }) {
  const access = signAccess(user);
  const refresh = signRefresh(user.id);
  return {
    access_token: access.token,
    refresh_token: refresh.token,
    token_type: 'Bearer' as const,
    expires_in: ttlOf(jwt.decode(access.token) as { exp?: number }),
  };
}

/** Verifikasi access token (RS256) + cek blocklist. */
export async function verifyAccess(token: string): Promise<AccessPayload> {
  let payload: AccessPayload;
  try {
    payload = jwt.verify(token, jwtKeys.publicKey, {
      algorithms: ['RS256'],
    }) as AccessPayload;
  } catch {
    throw Unauthorized('Access token tidak valid atau kedaluwarsa');
  }
  if (payload.typ !== 'access') throw Unauthorized('Tipe token salah');
  if (await isBlocked(payload.jti)) throw Unauthorized('Token sudah dicabut (logout)');
  if (await isUserRevoked(payload.sub, payload.iat))
    throw Unauthorized('Sesi telah dicabut, silakan login ulang');
  return payload;
}

/** Verifikasi refresh token (RS256) + cek blocklist. */
export async function verifyRefresh(token: string): Promise<RefreshPayload> {
  let payload: RefreshPayload;
  try {
    payload = jwt.verify(token, jwtKeys.publicKey, {
      algorithms: ['RS256'],
    }) as RefreshPayload;
  } catch {
    throw Unauthorized('Refresh token tidak valid atau kedaluwarsa');
  }
  if (payload.typ !== 'refresh') throw Unauthorized('Tipe token salah');
  if (await isBlocked(payload.jti)) throw Unauthorized('Refresh token sudah dipakai/dicabut');
  if (await isUserRevoked(payload.sub, payload.iat))
    throw Unauthorized('Sesi telah dicabut, silakan login ulang');
  return payload;
}

/** Masukkan token ke blocklist sampai token kedaluwarsa (ADR-005). */
export async function revoke(
  token: string,
  payload: { exp?: number; jti?: string },
): Promise<void> {
  const ttl = ttlOf(payload);
  if (ttl <= 0) return; // sudah kedaluwarsa — tidak perlu diblokir
  const key = payload.jti
    ? `${BLOCKLIST_PREFIX}${payload.jti}`
    : `${BLOCKLIST_PREFIX}fpr:${fingerprint(token)}`;
  await redisCache.setex(key, ttl, '1');
}

export async function isBlocked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false;
  const hit = await redisCache.get(`${BLOCKLIST_PREFIX}${jti}`);
  return hit !== null;
}

/**
 * Cabut SEMUA token milik user yang terbit SEBELUM saat ini
 * (ganti password / admin revoke). Disimpan sebagai timestamp, sehingga token
 * yang diterbitkan setelahnya (login ulang) otomatis tetap valid — tanpa perlu
 * menghapus penanda apa pun.
 */
export async function revokeAllForUser(userId: string, ttlSeconds = 7 * 24 * 3600): Promise<void> {
  const revokedAt = Math.floor(Date.now() / 1000);
  await redisCache.setex(`jwt:revoke-all:${userId}`, ttlSeconds, String(revokedAt));
}

/** True bila token (berdasarkan `iat`) terbit sebelum pencabutan massal terakhir. */
export async function isUserRevoked(userId: string, iat?: number): Promise<boolean> {
  const raw = await redisCache.get(`jwt:revoke-all:${userId}`);
  if (raw === null) return false;
  const revokedAt = Number(raw);
  if (!Number.isFinite(revokedAt)) return true; // data rusak → tolak (fail-safe)
  if (typeof iat !== 'number') return true;     // tanpa iat → tolak (fail-safe)
  return iat < revokedAt;
}

export { BLOCKLIST_PREFIX };
