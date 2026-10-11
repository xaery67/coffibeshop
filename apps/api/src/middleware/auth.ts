import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Unauthorized, Forbidden } from '../lib/http.js';
import type { Role } from '@coffibeshop/shared';

export interface AuthUser {
  id: string;
  role: Role | string;
  outlet_id?: string;
}

/** Verifikasi JWT Bearer; lampirkan req.user. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(Unauthorized('Missing bearer token'));
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AuthUser;
    (req as any).user = payload;
    next();
  } catch {
    next(Unauthorized('Invalid or expired token'));
  }
};

/** Batasi akses ke role tertentu (RBAC). */
export const requireRole =
  (...roles: string[]): RequestHandler =>
  (req, _res, next) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return next(Unauthorized());
    if (!roles.includes(String(user.role))) return next(Forbidden());
    next();
  };

/** Opsional: auth bila ada token, lanjut bila tidak (untuk endpoint guest+member). */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      (req as any).user = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AuthUser;
    } catch {
      /* ignore — lanjut sebagai guest */
    }
  }
  next();
};

/** Ambil guest id dari header X-Guest-Id (ADR-006). */
export function getGuestId(req: any): string | undefined {
  return req.headers['x-guest-id'] as string | undefined;
}
