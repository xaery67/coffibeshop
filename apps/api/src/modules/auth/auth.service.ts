import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { Conflict, Unauthorized, BadRequest, NotFound, Forbidden } from '../../lib/http.js';
import { mergeGuestCart, readCart, memberKey } from '../order/cart.service.js';
import { queues } from '../../queue/queues.js';
import {
  issueTokens,
  verifyRefresh,
  revoke,
  revokeAllForUser,
  isUserRevoked,
} from './token.service.js';
import type { RegisterInput, LoginInput, UpdateProfileInput } from '@coffibeshop/shared';

/** Biaya bcrypt — 12 cukup kuat, tetap cepat di hardware modern. */
const BCRYPT_ROUNDS = 12;

/** Jangan pernah mengembalikan password_hash ke klien. */
function sanitize(u: any) {
  if (!u) return u;
  const { password_hash: _ph, ...rest } = u;
  return rest;
}

export class AuthService {
  // ─────────────────────────── REGISTER ───────────────────────────
  async register(input: RegisterInput, guestId?: string) {
    const { email, password, full_name, phone } = input;

    const [emailTaken, phoneTaken] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      phone ? prisma.user.findFirst({ where: { phone } }) : Promise.resolve(null),
    ]);
    if (emailTaken) throw Conflict('Email sudah terdaftar');
    if (phoneTaken) throw Conflict('Nomor HP sudah terdaftar');

    const user = await prisma.user.create({
      data: {
        email,
        phone: phone ?? null,
        full_name,
        password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        role: 'member',
      },
    });

    logger.info({ userId: user.id, role: user.role }, 'user baru terdaftar');

    const merge = await this.mergeCartIfAny(user.id, guestId);
    return {
      ...issueTokens(user),
      user: sanitize(user),
      cart_merged: merge.merged,
      cart_item_count: merge.count,
    };
  }

  // ─────────────────────────── LOGIN ───────────────────────────
  async login(input: LoginInput, guestId?: string) {
    const { email, phone, password } = input;

    const user = await prisma.user.findFirst({
      where: email ? { email } : { phone: phone! },
    });

    // Pesan error disamakan (akun tidak ada vs password salah) supaya tidak
    // membocorkan keberadaan akun — PRD-QA TC-SEC.
    if (!user) throw Unauthorized('Email/HP atau password salah');
    if (!user.is_active) throw Forbidden('Akun dinonaktifkan. Hubungi admin.');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw Unauthorized('Email/HP atau password salah');

    const merge = await this.mergeCartIfAny(user.id, guestId);
    logger.info({ userId: user.id, cartMerged: merge.merged }, 'login berhasil');

    return {
      ...issueTokens(user),
      user: sanitize(user),
      cart_merged: merge.merged,
      cart_item_count: merge.count,
    };
  }

  // ─────────────────────────── REFRESH (rotasi) ───────────────────────────
  async refresh(refreshToken: string) {
    if (!refreshToken) throw BadRequest('refresh_token wajib diisi');

    const payload = await verifyRefresh(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw Unauthorized('Pengguna tidak ditemukan');
    if (!user.is_active) throw Forbidden('Akun dinonaktifkan');
    if (await isUserRevoked(user.id)) throw Unauthorized('Sesi dicabut, silakan login ulang');

    // Rotasi: token lama langsung dicabut (mitigasi replay / token theft).
    await revoke(refreshToken, payload);
    logger.info({ userId: user.id, jti: payload.jti }, 'refresh token dirotasi');

    return { ...issueTokens(user), user: sanitize(user) };
  }

  // ─────────────────────────── LOGOUT ───────────────────────────
  /** Cabut access + refresh token (ADR-005: Redis blocklist). */
  async logout(userId: string, tokens: { accessToken?: string; refreshToken?: string }) {
    const { verifyAccess } = await import('./token.service.js');
    const jobs: Promise<unknown>[] = [];

    if (tokens.accessToken) {
      jobs.push(
        verifyAccess(tokens.accessToken)
          .then((p) => revoke(tokens.accessToken!, p))
          .catch(() => undefined),
      );
    }
    if (tokens.refreshToken) {
      jobs.push(
        verifyRefresh(tokens.refreshToken)
          .then((p) => revoke(tokens.refreshToken!, p))
          .catch(() => undefined),
      );
    }
    await Promise.allSettled(jobs);
    logger.info({ userId }, 'logout — token dicabut');
    return { message: 'Berhasil logout' };
  }

  /** Logout dari semua perangkat. */
  async logoutAll(userId: string) {
    await revokeAllForUser(userId);
    logger.info({ userId }, 'logout semua perangkat');
    return { message: 'Semua sesi dicabut' };
  }

  // ─────────────────────────── ME ───────────────────────────
  async me(userId: string, withAddresses = false) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: withAddresses ? { addresses: { orderBy: { is_default: 'desc' } } } : undefined,
    });
    if (!user) throw NotFound('Pengguna tidak ditemukan');
    return sanitize(user);
  }

  async updateMe(userId: string, input: UpdateProfileInput) {
    if (input.phone) {
      const taken = await prisma.user.findFirst({
        where: { phone: input.phone, NOT: { id: userId } },
      });
      if (taken) throw Conflict('Nomor HP sudah dipakai akun lain');
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.full_name !== undefined ? { full_name: input.full_name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      },
    });
    return sanitize(user);
  }

  // ─────────────────────────── GANTI PASSWORD ───────────────────────────
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw NotFound('Pengguna tidak ditemukan');

    const ok = await bcrypt.compare(oldPassword, user.password_hash);
    if (!ok) throw Unauthorized('Password lama salah');
    if (oldPassword === newPassword) throw BadRequest('Password baru harus berbeda');

    await prisma.user.update({
      where: { id: userId },
      data: { password_hash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
    });

    // Semua token lama tidak valid lagi setelah ganti password.
    await revokeAllForUser(userId);
    logger.info({ userId }, 'password diganti — semua sesi dicabut');
    return { message: 'Password berhasil diganti, silakan login ulang' };
  }

  // ─────────────────────────── FORGOT / RESET ───────────────────────────
  /**
   * Kirim link reset. Selalu balas sukses (tidak membocorkan keberadaan email)
   * — PRD-QA TC-SEC. Token asli dikirim via queue notifikasi (email di Phase 2).
   */
  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = await this.issueResetToken(user.id);
      await queues.notification
        .add('password-reset', { userId: user.id, email, token })
        .catch((err) => logger.warn({ err: err.message }, 'gagal enqueue notifikasi reset'));
      logger.info({ userId: user.id }, 'permintaan reset password');
    }
    return { message: 'Jika email terdaftar, tautan reset telah dikirim' };
  }

  async resetPassword(token: string, newPassword: string) {
    const { redisCache } = await import('../../config/redis.js');
    const userId = await redisCache.get(`pwd:reset:${token}`);
    if (!userId) throw BadRequest('Token reset tidak valid atau kedaluwarsa');

    await prisma.user.update({
      where: { id: userId },
      data: { password_hash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
    });
    await redisCache.del(`pwd:reset:${token}`);
    await revokeAllForUser(userId);
    logger.info({ userId }, 'password direset');
    return { message: 'Password berhasil direset, silakan login' };
  }

  private async issueResetToken(userId: string): Promise<string> {
    const { redisCache } = await import('../../config/redis.js');
    const { randomBytes } = await import('node:crypto');
    const token = randomBytes(32).toString('base64url');
    await redisCache.setex(`pwd:reset:${token}`, 3600, userId); // berlaku 1 jam
    return token;
  }

  // ─────────────────────────── HELPERS ───────────────────────────
  /** Merge guest cart (ADR-011) + hitung jumlah item setelah merge. */
  private async mergeCartIfAny(userId: string, guestId?: string) {
    let merged = false;
    if (guestId) {
      merged = await mergeGuestCart(userId, guestId).catch(() => false);
    }
    const items = await readCart(memberKey(userId)).catch(() => []);
    return { merged, count: items.length };
  }
}
