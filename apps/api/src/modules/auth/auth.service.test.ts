import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';

/** State in-memory untuk mock (Prisma, Redis, Queue). */
const h = vi.hoisted(() => ({
  users: [] as any[],
  store: new Map<string, string>(),
  queueAdds: [] as any[],
}));

vi.mock('../../config/redis.js', () => ({
  redisCache: {
    setex: async (k: string, _t: number, v: string) => void h.store.set(k, v),
    get: async (k: string) => h.store.get(k) ?? null,
    del: async (k: string) => void h.store.delete(k),
    quit: async () => undefined,
  },
  redisQueue: { quit: async () => undefined },
  pingRedis: async () => true,
}));

vi.mock('../../queue/queues.js', () => ({
  queues: {
    notification: {
      add: async (name: string, data: any) => {
        h.queueAdds.push({ name, data });
        return { id: 'job-1' };
      },
    },
  },
}));

vi.mock('../../config/prisma.js', () => {
  const match = (u: any, where: any) => {
    if (!where) return true;
    if (where.id) return u.id === where.id;
    if (where.email) return u.email === where.email;
    if (where.phone) return u.phone === where.phone;
    if (where.NOT?.id) return u.id !== where.NOT.id && (!where.phone || u.phone === where.phone);
    return true;
  };
  const prisma = {
    user: {
      findUnique: async ({ where }: any) => h.users.find((u) => match(u, where)) ?? null,
      findFirst: async ({ where }: any) => h.users.find((u) => match(u, where)) ?? null,
      create: async ({ data }: any) => {
        const u = {
          id: `user-${h.users.length + 1}`,
          is_active: true,
          outlet_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...data,
        };
        h.users.push(u);
        return u;
      },
      update: async ({ where, data }: any) => {
        const u = h.users.find((x) => x.id === where.id);
        Object.assign(u, data);
        return u;
      },
    },
  };
  return { prisma };
});

/** Cart dianggap kosong (merge tidak relevan untuk test ini). */
vi.mock('../order/cart.service.js', () => ({
  mergeGuestCart: vi.fn(async () => false),
  readCart: vi.fn(async () => []),
  memberKey: (id: string) => `cart:member:${id}`,
  guestKey: (id: string) => `cart:guest:${id}`,
}));

import { AuthService } from './auth.service.js';
import { verifyAccess } from './token.service.js';

const svc = new AuthService();
const REG = {
  email: 'budi@example.com',
  password: 'Rahasia123',
  full_name: 'Budi Santoso',
  phone: '08123456789',
};

beforeEach(() => {
  h.users.length = 0;
  h.store.clear();
  h.queueAdds.length = 0;
});

describe('AuthService.register', () => {
  it('mendaftar member, meng-hash password, & mengembalikan token RS256', async () => {
    const r = await svc.register(REG as any);
    expect(r.user.email).toBe(REG.email);
    expect(r.user.role).toBe('member');
    expect(r.access_token).toBeTruthy();
    expect(r.refresh_token).toBeTruthy();
    expect(r.cart_merged).toBe(false);
    expect(r.cart_item_count).toBe(0);
  });

  it('TIDAK pernah mengembalikan password_hash', async () => {
    const r = await svc.register(REG as any);
    expect((r.user as any).password_hash).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('$2');
  });

  it('password disimpan sebagai hash bcrypt (bukan plaintext)', async () => {
    await svc.register(REG as any);
    const stored = h.users[0].password_hash;
    expect(stored).not.toBe(REG.password);
    expect(stored.startsWith('$2')).toBe(true);
    expect(await bcrypt.compare(REG.password, stored)).toBe(true);
  });

  it('menolak email duplikat (409)', async () => {
    await svc.register(REG as any);
    await expect(svc.register(REG as any)).rejects.toMatchObject({ status: 409 });
  });

  it('menolak nomor HP duplikat (409)', async () => {
    await svc.register(REG as any);
    await expect(
      svc.register({ ...REG, email: 'lain@example.com' } as any),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('access token hasil register dapat diverifikasi', async () => {
    const r = await svc.register(REG as any);
    const p = await verifyAccess(r.access_token);
    expect(p.role).toBe('member');
    expect(p.sub).toBe(r.user.id);
  });
});

describe('AuthService.login', () => {
  beforeEach(async () => {
    await svc.register(REG as any);
  });

  it('login dengan email → token baru', async () => {
    const r = await svc.login({ email: REG.email, password: REG.password } as any);
    expect(r.user.email).toBe(REG.email);
    expect(r.access_token).toBeTruthy();
    expect(r.cart_item_count).toBe(0);
  });

  it('login dengan nomor HP juga berhasil', async () => {
    const r = await svc.login({ phone: REG.phone, password: REG.password } as any);
    expect(r.user.email).toBe(REG.email);
  });

  it('password salah → 401 dengan pesan generik', async () => {
    await expect(
      svc.login({ email: REG.email, password: 'SalahBanget1' } as any),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('akun tidak ada → 401 (pesan sama, tidak membocorkan akun)', async () => {
    const err = await svc
      .login({ email: 'tidak@ada.com', password: 'apapun123' } as any)
      .catch((e) => e);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/Email\/HP atau password salah/);
  });

  it('akun nonaktif → 403', async () => {
    h.users[0].is_active = false;
    await expect(
      svc.login({ email: REG.email, password: REG.password } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('AuthService.refresh (rotasi)', () => {
  it('menerbitkan pasangan token baru & mencabut refresh lama', async () => {
    const reg = await svc.register(REG as any);
    const r1 = await svc.refresh(reg.refresh_token);
    expect(r1.access_token).toBeTruthy();
    expect(r1.refresh_token).not.toBe(reg.refresh_token);

    // refresh lama sudah dicabut → tidak bisa dipakai lagi
    await expect(svc.refresh(reg.refresh_token)).rejects.toMatchObject({ status: 401 });
    // refresh baru tetap valid
    await expect(svc.refresh(r1.refresh_token)).resolves.toBeTruthy();
  });

  it('menolak refresh token palsu', async () => {
    await expect(svc.refresh('token.palsu.sekali')).rejects.toMatchObject({ status: 401 });
  });

  it('menolak bila refresh_token kosong', async () => {
    await expect(svc.refresh('')).rejects.toMatchObject({ status: 400 });
  });
});

describe('AuthService.logout', () => {
  it('mencabut access token sehingga tidak bisa dipakai lagi', async () => {
    const reg = await svc.register(REG as any);
    await expect(verifyAccess(reg.access_token)).resolves.toBeTruthy();

    await svc.logout(reg.user.id, { accessToken: reg.access_token, refreshToken: reg.refresh_token });

    await expect(verifyAccess(reg.access_token)).rejects.toThrow(/dicabut/);
  });

  it('logout-all mencabut seluruh sesi pengguna', async () => {
    const reg = await svc.register(REG as any);
    await svc.logoutAll(reg.user.id);
    await expect(svc.refresh(reg.refresh_token)).rejects.toMatchObject({ status: 401 });
  });
});

describe('AuthService.changePassword', () => {
  it('mengganti password & mencabut semua sesi lama', async () => {
    const reg = await svc.register(REG as any);
    await svc.changePassword(reg.user.id, REG.password, 'BaruSekali99');
    await expect(svc.refresh(reg.refresh_token)).rejects.toMatchObject({ status: 401 });
    await expect(
      svc.login({ email: REG.email, password: 'BaruSekali99' } as any),
    ).resolves.toBeTruthy();
  });

  it('menolak password lama yang salah', async () => {
    const reg = await svc.register(REG as any);
    await expect(
      svc.changePassword(reg.user.id, 'SalahLama1', 'BaruSekali99'),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('menolak password baru yang sama', async () => {
    const reg = await svc.register(REG as any);
    await expect(
      svc.changePassword(reg.user.id, REG.password, REG.password),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('AuthService.forgotPassword (tidak membocorkan email)', () => {
  it('email terdaftar → enqueue job notifikasi', async () => {
    await svc.register(REG as any);
    const r = await svc.forgotPassword(REG.email);
    expect(r.message).toMatch(/tautan reset/i);
    expect(h.queueAdds.length).toBe(1);
    expect(h.queueAdds[0].name).toBe('password-reset');
  });

  it('email TIDAK terdaftar → tetap balas sukses & tanpa job', async () => {
    const r = await svc.forgotPassword('hantu@example.com');
    expect(r.message).toMatch(/tautan reset/i);
    expect(h.queueAdds.length).toBe(0);
  });

  it('token reset dapat dipakai untuk ganti password', async () => {
    await svc.register(REG as any);
    await svc.forgotPassword(REG.email);
    const token = h.queueAdds[0].data.token as string;
    await expect(svc.resetPassword(token, 'ResetBaru123')).resolves.toBeTruthy();
    // token sekali pakai
    await expect(svc.resetPassword(token, 'LainLagi123')).rejects.toMatchObject({ status: 400 });
  });
});

describe('AuthService.me & updateMe', () => {
  it('me() mengembalikan profil tanpa password_hash', async () => {
    const reg = await svc.register(REG as any);
    const me = await svc.me(reg.user.id);
    expect(me.email).toBe(REG.email);
    expect((me as any).password_hash).toBeUndefined();
  });

  it('updateMe() mengubah nama', async () => {
    const reg = await svc.register(REG as any);
    const u = await svc.updateMe(reg.user.id, { full_name: 'Budi Baru' });
    expect(u.full_name).toBe('Budi Baru');
  });

  it('updateMe() menolak nomor HP yang sudah dipakai akun lain', async () => {
    const a = await svc.register(REG as any);
    await svc.register({ ...REG, email: 'kedua@example.com', phone: '08987654321' } as any);
    await expect(
      svc.updateMe(a.user.id, { phone: '08987654321' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
