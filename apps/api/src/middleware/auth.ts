import type { RequestHandler } from 'express';
import { Unauthorized, Forbidden } from '../lib/http.js';
import { verifyAccess } from '../modules/auth/token.service.js';
import { OUTLET_SCOPED_ROLES, ROLE_HIERARCHY } from '@coffibeshop/shared';
import type { Role } from '@coffibeshop/shared';

/** Konteks pengguna yang sudah terautentikasi (dilampirkan ke req.user). */
export interface AuthUser {
  id: string;
  role: Role | string;
  outlet_id?: string | null;
  jti?: string;
}

/**
 * Verifikasi JWT **RS256** (ADR-005) + cek Redis blocklist (logout/revoke).
 * Async karena harus menanyakan blocklist ke Redis.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(Unauthorized('Token akses tidak ditemukan'));

  try {
    const payload = await verifyAccess(header.slice(7));
    (req as any).user = {
      id: payload.sub,
      role: payload.role,
      outlet_id: payload.outlet_id ?? null,
      jti: payload.jti,
    } satisfies AuthUser;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Batasi akses ke role tertentu (RBAC, PRD-BACKEND §5).
 * Owner selalu lolos (akses penuh multi-outlet).
 */
export const requireRole =
  (...roles: string[]): RequestHandler =>
  (req, _res, next) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return next(Unauthorized('Belum terautentikasi'));
    const role = String(user.role);
    if (role === 'owner' || roles.includes(role)) return next();
    return next(Forbidden(`Role "${role}" tidak berhak mengakses endpoint ini`));
  };

/** Role dengan minimal level tertentu dalam hierarki (mis. minimal kasir). */
export const requireMinRole =
  (minRole: string): RequestHandler =>
  (req, _res, next) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return next(Unauthorized('Belum terautentikasi'));
    const have = ROLE_HIERARCHY[String(user.role)] ?? -1;
    const need = ROLE_HIERARCHY[minRole] ?? 999;
    if (have >= need) return next();
    return next(Forbidden(`Butuh role minimal "${minRole}"`));
  };

/**
 * Pastikan pengguna hanya mengakses data outlet-nya sendiri
 * (Manager/Kasir/Barista ter-scope outlet). Owner/Finance = lintas outlet.
 *
 * Sumber outlet_id target: req.params.outletId -> req.query.outlet_id -> req.body.outlet_id.
 */
export const requireOutletScope: RequestHandler = (req, _res, next) => {
  const user = (req as any).user as AuthUser | undefined;
  if (!user) return next(Unauthorized('Belum terautentikasi'));

  const role = String(user.role);
  if (!(OUTLET_SCOPED_ROLES as readonly string[]).includes(role)) return next(); // lintas outlet

  const target =
    req.params?.outletId ?? (req.query?.outlet_id as string) ?? req.body?.outlet_id ?? null;

  if (!user.outlet_id) {
    return next(Forbidden('Akun Anda belum terhubung ke outlet mana pun'));
  }
  if (target && String(target) !== String(user.outlet_id)) {
    return next(Forbidden('Anda tidak berhak mengakses outlet lain'));
  }
  // Suntikkan outlet_id milik user agar handler tidak bisa dimanipulasi klien.
  if (req.body && typeof req.body === 'object') (req.body as any).outlet_id = user.outlet_id;
  next();
};

/**
 * Opsional: autentikasi bila token ada, lanjut sebagai guest bila tidak.
 * Dipakai endpoint yang melayani guest & member (cart, checkout).
 */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = await verifyAccess(header.slice(7));
      (req as any).user = {
        id: payload.sub,
        role: payload.role,
        outlet_id: payload.outlet_id ?? null,
        jti: payload.jti,
      } satisfies AuthUser;
    } catch {
      /* token invalid -> lanjut sebagai guest */
    }
  }
  next();
};

/** Ambil guest id dari header X-Guest-Id (ADR-006). */
export function getGuestId(req: any): string | undefined {
  return req.headers['x-guest-id'] as string | undefined;
}

/** Helper: apakah pengguna saat ini punya salah satu role ini (owner selalu true). */
export function hasRole(user: AuthUser | undefined, ...roles: string[]): boolean {
  if (!user) return false;
  const r = String(user.role);
  return r === 'owner' || roles.includes(r);
}
