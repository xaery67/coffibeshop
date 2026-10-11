import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { Conflict, Unauthorized, BadRequest } from '../../lib/http.js';
import { mergeGuestCart } from '../order/cart.service.js';

export class AuthService {
  async register(input: any, guestId?: string) {
    const { email, password, full_name, phone } = input ?? {};
    if (!email || !password) throw BadRequest('email & password wajib diisi');

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw Conflict('Email sudah terdaftar');

    const user = await prisma.user.create({
      data: {
        email,
        phone: phone ?? null,
        full_name: full_name ?? email.split('@')[0],
        password_hash: await bcrypt.hash(password, 12),
        role: 'member',
      },
    });

    const cart_merged = guestId ? await mergeGuestCart(user.id, guestId) : false;
    return { ...this.tokens(user), user: this.sanitize(user), cart_merged };
  }

  async login(input: any, guestId?: string) {
    const { email, password } = input ?? {};
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw Unauthorized('Email atau password salah');
    }
    const cart_merged = guestId ? await mergeGuestCart(user.id, guestId) : false;
    return { ...this.tokens(user), user: this.sanitize(user), cart_merged };
  }

  async refresh(token: string) {
    try {
      const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string };
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw Unauthorized();
      return this.tokens(user);
    } catch {
      throw Unauthorized('Refresh token tidak valid');
    }
  }

  async logout(_userId: string) {
    // Phase 2: masukkan token ke Redis blocklist (ADR-005)
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Unauthorized();
    return this.sanitize(user);
  }

  private tokens(user: { id: string; role: string; outlet_id?: string | null }) {
    const access_token = jwt.sign(
      { id: user.id, role: user.role, outlet_id: user.outlet_id },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_TTL as any },
    );
    const refresh_token = jwt.sign({ sub: user.id }, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_TTL as any,
    });
    return { access_token, refresh_token, token_type: 'Bearer' };
  }

  private sanitize(u: any) {
    const { password_hash, ...rest } = u;
    return rest;
  }
}
