import { describe, it, expect, beforeEach, vi } from 'vitest';

/** State in-memory untuk mock (Prisma, Redis). */
const h = vi.hoisted(() => ({
  addresses: [] as any[],
  users: [] as any[],
  store: new Map<string, string>(),
  queueAdds: [] as any[],
}));

vi.mock('../../config/prisma.js', () => {
  const prisma = {
    address: {
      findMany: async ({ where, orderBy }: any = {}) => {
        let rows = h.addresses.filter((a) => a.user_id === where.user_id);
        // Prisma menerima orderBy sebagai objek ATAU array objek — dukung keduanya.
        const specs: any[] = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
        if (specs.length) {
          rows = [...rows].sort((a, b) => {
            for (const spec of specs) {
              for (const [field, dir] of Object.entries(spec)) {
                const mul = dir === 'desc' ? -1 : 1;
                const av = (a as any)[field];
                const bv = (b as any)[field];
                let cmp = 0;
                if (typeof av === 'boolean' || typeof bv === 'boolean') {
                  cmp = (av ? 1 : 0) - (bv ? 1 : 0);
                } else if (field === 'created_at' || field === 'updated_at') {
                  cmp = new Date(av).getTime() - new Date(bv).getTime();
                } else if (typeof av === 'string' && typeof bv === 'string') {
                  cmp = av.localeCompare(bv);
                } else {
                  cmp = (av ?? 0) < (bv ?? 0) ? -1 : (av ?? 0) > (bv ?? 0) ? 1 : 0;
                }
                if (cmp !== 0) return cmp * mul;
              }
            }
            return 0;
          });
        }
        return rows;
      },
      findFirst: async ({ where }: any) => h.addresses.find((a) => a.id === where.id && a.user_id === where.user_id) ?? null,
      create: async ({ data }: any) => {
        const a = { id: `addr-${h.addresses.length + 1}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...data };
        h.addresses.push(a);
        return a;
      },
      update: async ({ where, data }: any) => {
        const a = h.addresses.find((x) => x.id === where.id);
        Object.assign(a, data);
        return a;
      },
      delete: async ({ where }: any) => {
        h.addresses = h.addresses.filter((a) => a.id !== where.id);
        return { id: where.id };
      },
      updateMany: async ({ where, data: _data }: any) => {
        const count = h.addresses.filter((a) => a.user_id === where.user_id && a.is_default).length;
        h.addresses.forEach((a) => { if (a.user_id === where.user_id && a.is_default) a.is_default = false; });
        return { count };
      },
    },
    user: {
      findUnique: async ({ where }: any) => h.users.find((u) => u.id === where.id) ?? null,
      findFirst: async ({ where }: any) => {
        if (where.email) return h.users.find((u) => u.email === where.email) ?? null;
        if (where.phone) return h.users.find((u) => u.phone === where.phone) ?? null;
        return null;
      },
      create: async ({ data }: any) => {
        const u = { id: `user-${h.users.length + 1}`, is_active: true, outlet_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...data };
        h.users.push(u);
        return u;
      },
    },
  };
  return { prisma };
});

vi.mock('../../config/redis.js', () => ({
  redisCache: {
    get: async (k: string) => h.store.get(k) ?? null,
    setex: async (k: string, _t: number, v: string) => void h.store.set(k, v),
    del: async (k: string) => void h.store.delete(k),
    quit: async () => undefined,
  },
  redisQueue: { quit: async () => undefined },
  pingRedis: async () => true,
}));

vi.mock('../../queue/queues.js', () => ({
  queues: {
    notification: {
      add: async (name: string, data: any) => { h.queueAdds.push({ name, data }); return { id: 'job-1' }; },
    },
  },
}));

vi.mock('../order/cart.service.js', () => ({
  mergeGuestCart: vi.fn(async () => false),
  readCart: vi.fn(async () => []),
  memberKey: (id: string) => `cart:member:${id}`,
  guestKey: (id: string) => `cart:guest:${id}`,
}));

import { AuthService } from './auth.service.js';

const svc = new AuthService();

const REG = {
  email: 'budi@example.com',
  password: 'Rahasia123',
  full_name: 'Budi Santoso',
  phone: '08123456789',
};

const ADDR1 = {
  label: 'Rumah',
  recipient_name: 'Budi Santoso',
  phone: '08123456789',
  address_line: 'Jl. Sudirman No. 123',
  city: 'Jakarta',
  postal_code: '10220',
  latitude: -6.2088,
  longitude: 106.8456,
  is_default: true,
};

const ADDR2 = {
  label: 'Kantor',
  recipient_name: 'Budi Santoso',
  phone: '08123456789',
  address_line: 'Jl. Thamrin No. 456',
  city: 'Jakarta',
  postal_code: '10310',
  is_default: false,
};

beforeEach(() => {
  h.addresses.length = 0;
  h.users.length = 0;
  h.store.clear();
  h.queueAdds.length = 0;
});

describe('Address CRUD (ADR-013)', () => {
  let userId: string;

  beforeEach(async () => {
    const reg = await svc.register(REG as any);
    userId = reg.user.id;
  });

  it('POST /addresses → create address, is_default exclusive', async () => {
    const a1 = await svc.createAddress(userId, { ...ADDR1, is_default: true });
    expect(a1.is_default).toBe(true);
    expect(a1.user_id).toBe(userId);

    const a2 = await svc.createAddress(userId, { ...ADDR2, is_default: true });
    // a2 becomes default, a1 should be unset
    expect(a2.is_default).toBe(true);
    const a1Check = h.addresses.find((a) => a.id === a1.id);
    expect(a1Check?.is_default).toBe(false);
  });

  it('GET /addresses → list, default di atas', async () => {
    await svc.createAddress(userId, { ...ADDR2, is_default: false });
    await svc.createAddress(userId, { ...ADDR1, is_default: true });
    const list = await svc.getAddresses(userId);
    expect(list.length).toBe(2);
    expect(list[0].is_default).toBe(true);
  });

  it('PUT /addresses/:id → update own address', async () => {
    const a = await svc.createAddress(userId, { ...ADDR1 });
    const updated = await svc.updateAddress(userId, a.id, { label: 'Rumah Baru', is_default: true });
    expect(updated.label).toBe('Rumah Baru');
    expect(updated.is_default).toBe(true);
  });

  it('PUT /addresses/:id 404 bila bukan milik user', async () => {
    const a = await svc.createAddress(userId, { ...ADDR1 });
    await expect(svc.updateAddress('u-other', a.id, { label: 'X' })).rejects.toMatchObject({ status: 404 });
  });

  it('DELETE /addresses/:id → hapus own address', async () => {
    const a = await svc.createAddress(userId, { ...ADDR1 });
    await svc.deleteAddress(userId, a.id);
    expect(h.addresses.find((x) => x.id === a.id)).toBeUndefined();
  });

  it('DELETE /addresses/:id 404 bila bukan milik user', async () => {
    const a = await svc.createAddress(userId, { ...ADDR1 });
    await expect(svc.deleteAddress('u-other', a.id)).rejects.toMatchObject({ status: 404 });
  });

  it('is_default exclusive via update (unset other defaults)', async () => {
    const a1 = await svc.createAddress(userId, { ...ADDR1, is_default: true });
    const a2 = await svc.createAddress(userId, { ...ADDR2, is_default: false });
    // Update a2 to be default → a1 should be unset
    await svc.updateAddress(userId, a2.id, { is_default: true });
    const a1Check = h.addresses.find((a) => a.id === a1.id);
    expect(a1Check?.is_default).toBe(false);
  });
});