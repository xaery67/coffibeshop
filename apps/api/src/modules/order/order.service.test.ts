import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * order.service — unit test (issue #18; PRD-QA F-005b cancel, F-006 reorder, ADR-008 track).
 * Prisma & Redis di-mock in-memory; SSE di-stub. Fokus: state machine transisi status,
 * customer cancel (PENDING/PAID), reorder, tracking anti-IDOR, dan atomic checkout.
 */

const h = vi.hoisted(() => ({
  orders: [] as any[],
  items: [] as any[],
  statusLogs: [] as any[],
  loyalty: [] as any[],
  products: [] as any[],
  vouchers: [] as any[],
  inventoryItems: [] as any[],
  productBOMs: [] as any[],
  outlets: [] as any[],
  store: new Map<string, string>(),
  events: [] as any[],
  queueAdds: [] as any[],
}));

// Queue mock: tangkap (queue, jobName, payload) agar refund bisa di-assert nyata.
vi.mock('../../queue/queues.js', () => ({
  queues: {
    payment: { add: async (name: string, payload: any) => void h.queueAdds.push({ queue: 'payment', name, payload }) },
    notification: { add: async (name: string, payload: any) => void h.queueAdds.push({ queue: 'notification', name, payload }) },
    loyalty: { add: async (name: string, payload: any) => void h.queueAdds.push({ queue: 'loyalty', name, payload }) },
    reporting: { add: async (name: string, payload: any) => void h.queueAdds.push({ queue: 'reporting', name, payload }) },
  },
}));

vi.mock('../../config/redis.js', () => ({
  redisCache: {
    get: async (k: string) => h.store.get(k) ?? null,
    setex: async (k: string, _ttl: number, v: string) => void h.store.set(k, v),
    del: async (k: string) => void h.store.delete(k),
    quit: async () => undefined,
  },
  redisQueue: { quit: async () => undefined },
  redisPubSub: {
    publish: async (channel: string, message: string) => {
      h.events.push({ channel, message: JSON.parse(message) });
      return 1;
    },
    subscribe: async (_channel: string, _callback: (msg: string) => void) => {
      return 1;
    },
    unsubscribe: async (_channel: string) => {
      return 1;
    },
  },
  pingRedis: async () => true,
}));

vi.mock('./sse.controller.js', () => ({
  publishOrderEvent: (key: string, payload: any) => void h.events.push({ key, payload }),
  streamOrderEvents: () => undefined,
}));

// Prisma mock: cukup model yang dipakai order.service.
vi.mock('../../config/prisma.js', () => {
  const tx = {
    order: {
      create: async ({ data }: any) => {
        const o = { id: `order-${h.orders.length + 1}`, created_at: new Date(), updated_at: new Date(), ...data };
        h.orders.push(o);
        return o;
      },
      update: async ({ where, data }: any) => {
        const idx = h.orders.findIndex((x) => x.id === where.id);
        const updated = { ...h.orders[idx], ...data };
        h.orders[idx] = updated;
        return updated;
      },
    },
    orderStatusLog: {
      create: async ({ data }: any) => {
        h.statusLogs.push(data);
        return data;
      },
    },
    orderItem: {
      create: async ({ data }: any) => {
        h.items.push(data);
        return data;
      },
    },
        loyaltyPoint: {
          aggregate: async ({ where }: any) => {
            const rows = h.loyalty.filter((l) => l.user_id === where.user_id && l.type === where.type);
            return { _sum: { points: rows.reduce((s, r) => s + r.points, 0) } };
          },
          findFirst: async ({ where }: any = {}) => {
            if (!where) return null;
            return h.loyalty.find((lp) => {
              if (where.order_id && lp.order_id !== where.order_id) return false;
              if (where.type && lp.type !== where.type) return false;
              return true;
            }) ?? null;
          },
          create: async ({ data }: any) => {
            h.loyalty.push(data);
            return data;
          },
        },
        product: {
      findMany: async ({ where: _where }: any = {}) => {
        const ids: string[] = _where?.id?.in ?? [];
        return h.products.filter((p) => ids.includes(p.id));
      },
    },
    productBOM: {
      findMany: async ({ where: _where }: any = {}) => {
        return h.productBOMs
          .filter((bom) => bom.product_id === _where?.product_id)
          .map((bom) => {
            const inventoryItem = h.inventoryItems.find((inv) => inv.id === bom.inventory_item_id);
            return {
              ...bom,
              inventoryItem: inventoryItem ?? { id: bom.inventory_item_id, name: 'Unknown', quantity: 1000, unit: 'pcs' },
            };
          });
      },
    },
    inventoryItem: {
      findUnique: async ({ where: _where }: any = {}) => {
        const item = h.inventoryItems.find((inv) => inv.id === _where.id);
        if (item) return item;
        return { id: _where.id, quantity: 1000, name: 'Test Inventory', unit: 'pcs' };
      },
    },
    outlet: {
      findUnique: async ({ where: _where }: any = {}) => {
        return h.outlets.find((o) => o.id === _where.id) ?? null;
      },
    },
  };

  const prisma = {
      product: {
        findMany: async ({ where }: any = {}) => {
          const ids: string[] = where?.id?.in ?? [];
          return h.products.filter((p) => ids.includes(p.id));
        },
        findUnique: async ({ where }: any = {}) => {
          if (!where?.id) return null;
          return h.products.find((p) => p.id === where.id) ?? null;
        },
      },
      loyaltyPoint: {
        findFirst: async ({ where }: any = {}) => {
          if (!where) return null;
          return h.loyalty.find((lp) => {
            if (where.order_id && lp.order_id !== where.order_id) return false;
            if (where.type && lp.type !== where.type) return false;
            return true;
          }) ?? null;
        },
        create: async ({ data }: any) => {
          h.loyalty.push(data);
          return data;
        },
      },
      order: {
      create: tx.order.create,
      update: tx.order.update,
      findUnique: async ({ where, include }: any) => {
        if (where.id) {
          const order = h.orders.find((o) => o.id === where.id) ?? null;
          if (order && include?.items) {
            const items = h.items.filter((i) => i.order_id === order.id);
            const enrichedItems = items.map(item => {
              const product = h.products.find(p => p.id === item.product_id);
              return {
                ...item,
                product: product ? {
                  ...product,
                  variants: product.variants ?? [],
                  options: product.options ?? [],
                } : null,
                variant: item.variant_id ? h.products.flatMap(p => p.variants ?? []).find(v => v.id === item.variant_id) ?? null : null,
              };
            });
            let outlet = null;
            if (include?.outlet && order.outlet_id) {
              outlet = h.outlets.find((o: any) => o.id === order.outlet_id) ?? null;
            }
            return { ...order, items: enrichedItems, outlet };
          }
          if (include?.outlet && order?.outlet_id) {
            return { 
              ...order, 
              outlet: h.outlets.find((o: any) => o.id === order.outlet_id) ?? null 
            };
          }
          return order;
        }
        if (where.tracking_token) return h.orders.find((o) => o.tracking_token === where.tracking_token) ?? null;
        return null;
      },
      findMany: async ({ where }: any = {}) => {
        let rows = [...h.orders];
        if (where?.user_id) rows = rows.filter((o) => o.user_id === where.user_id);
        if (where?.status?.in) rows = rows.filter((o) => where.status.in.includes(o.status));
        return rows;
      },
      count: async ({ where }: any = {}) => h.orders.filter((o) => !where?.user_id || o.user_id === where.user_id).length,
          },
          orderStatusLog: tx.orderStatusLog,
          voucher: {
            findFirst: async ({ where }: any) => h.vouchers.find((v) => v.code === where.code && v.is_active) ?? null,
          },
          productBOM: {
      findMany: async ({ where: _where }: any = {}) => {
        return h.productBOMs
          .filter((bom) => bom.product_id === _where?.product_id)
          .map((bom) => {
            const inventoryItem = h.inventoryItems.find((inv) => inv.id === bom.inventory_item_id);
            return {
              ...bom,
              inventoryItem: inventoryItem ?? { id: bom.inventory_item_id, name: 'Unknown', quantity: 1000, unit: 'pcs' },
            };
          });
      },
    },
    inventoryItem: {
      findUnique: async ({ where: _where }: any = {}) => {
        const item = h.inventoryItems.find((inv) => inv.id === _where.id);
        if (item) return item;
        return { id: _where.id, quantity: 1000, name: 'Test Inventory', unit: 'pcs' };
      },
    },
    outlet: {
              findUnique: async ({ where: _where }: any = {}) => {
                return h.outlets.find((o) => o.id === _where.id) ?? null;
              },
            },
            $transaction: async (fn: any) => fn(tx),
  };
  return { prisma };
});

import { OrderService } from './order.service.js';
import { writeCart, memberKey, writeCartMeta } from './cart.service.js';

const svc = new OrderService();

const LATTE = {
  id: 'p-latte',
  name: 'Latte',
  base_price: '27000',
  is_active: true,
  is_available: true,
  variants: [{ id: 'v-lrg', name: 'Large', price_delta: '5000', stock_quantity: 50 }],
  options: [{ id: 'opt-shot', values: [{ id: 'shot-yes', value: 'Extra Shot', price_adjustment: '5000' }] }],
};

function seedOrder(over: Partial<any> = {}) {
  const o = {
    id: `order-${h.orders.length + 1}`,
    order_number: 'CS-TEST',
    user_id: 'u1',
    status: 'PENDING',
    total: 82140,
    subtotal: 74000,
    tax: 8140,
    shipping_fee: 0,
    discount: 0,
    points_discount: 0,
    tracking_token: 'tok-' + h.orders.length,
    created_at: new Date(),
    updated_at: new Date(),
    items: [],
    ...over,
  };
  h.orders.push(o);
  
  if (over.items?.length) {
    for (const item of over.items) {
      h.items.push({
        id: `item-${h.items.length + 1}`,
        order_id: o.id,
        product_id: item.product_id ?? 'p-latte',
        variant_id: item.variant_id ?? null,
        qty: item.qty ?? 1,
        unit_price: item.unit_price ?? 37000,
        line_total: (item.unit_price ?? 37000) * (item.qty ?? 1),
        options: item.options ?? null,
        notes: item.notes ?? null,
      });
    }
  }
  
  return o;
}

beforeEach(() => {
  h.orders = [];
  h.items = [];
  h.statusLogs = [];
  h.loyalty = [];
  h.products = [LATTE];
  h.vouchers = [];
  h.inventoryItems = [];
  h.productBOMs = [];
  h.outlets = [];
  h.store.clear();
  h.events = [];
  h.queueAdds = [];
});

// ═══════════════ getCart / addItem / updateItem / removeItem ═══════════════

describe('cart via OrderService', () => {
  it('getCart guest mengembalikan item ter-harga', async () => {
    await writeCart(memberKey('u1'), []);
    const r = await svc.getCart('u1');
    expect(r.items).toEqual([]);
  });

  it('addItem menambah & men-harga (golden 37.000)', async () => {
    const r = await svc.addItem('u1', undefined, {
      product_id: 'p-latte',
      variant_id: 'v-lrg',
      selected_options: ['shot-yes'],
      quantity: 1,
    });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].unit_price).toBe(37000);
  });

  it('updateItem qty + removeItem', async () => {
    const added = await svc.addItem('u1', undefined, { product_id: 'p-latte', option_ids: [], qty: 1 });
    const id = added.items[0].id;
    const upd = await svc.updateItem('u1', undefined, id, { qty: 3 });
    expect(upd.items[0].qty).toBe(3);
    const rem = await svc.removeItem('u1', undefined, id);
    expect(rem.items).toHaveLength(0);
  });

  it('updateItem id tidak ada → 404', async () => {
    await expect(svc.updateItem('u1', undefined, 'nope', { qty: 2 })).rejects.toMatchObject({ status: 404 });
  });
});

// ═══════════════ checkout (atomic) ═══════════════

describe('checkout', () => {
  it('cart kosong → 400', async () => {
    await expect(svc.checkout('u1', undefined, { fulfillment_type: 'pickup' })).rejects.toMatchObject({ status: 400 });
  });

  it('membuat order PENDING + tracking_token + log status awal', async () => {
    await writeCart(memberKey('u1'), [{ id: 'i1', product_id: 'p-latte', variant_id: 'v-lrg', option_ids: ['shot-yes'], qty: 2 }]);
    const r = await svc.checkout('u1', undefined, { fulfillment_type: 'pickup', payment_method: 'qris' });
    expect(r.status).toBe('PENDING');
    expect(r.order_id).toBeTruthy();
    expect(r.tracking_token).toBeTruthy();
    expect(h.statusLogs.some((l) => l.to_status === 'PENDING')).toBe(true);
    expect(h.items).toHaveLength(1);
    expect(h.items[0].unit_price).toBe(37000);
    expect(h.items[0].line_total).toBe(74000);
  });

  it('GOLDEN total 82.140 (2× Large+ExtraShot) tersimpan di order', async () => {
    await writeCart(memberKey('u1'), [{ id: 'i1', product_id: 'p-latte', variant_id: 'v-lrg', option_ids: ['shot-yes'], qty: 2 }]);
    await svc.checkout('u1', undefined, { fulfillment_type: 'pickup' });
    expect(h.orders[0].subtotal).toBe(74000);
    expect(h.orders[0].tax).toBe(8140);
    expect(h.orders[0].total).toBe(82140);
  });

  it('delivery menambah ongkir flat 10.000', async () => {
    await writeCart(memberKey('u1'), [{ id: 'i1', product_id: 'p-latte', option_ids: [], qty: 1 }]);
    await svc.checkout('u1', undefined, { fulfillment_type: 'delivery' });
    expect(h.orders[0].shipping_fee).toBe(10000);
  });

  it('pre-check stok BOM: gagal 409 bila stok inventory tidak mencukupi', async () => {
    const testProduct = {
      id: 'p-test-bom',
      name: 'Test BOM Product',
      base_price: '25000',
      is_active: true,
      is_available: true,
      variants: [],
      options: [],
    };
    h.products = [testProduct];
    
    h.inventoryItems = [{ id: 'inv-coffee', name: 'Biji Kopi', quantity: 50, unit: 'gram' }];
    
    h.productBOMs = [{
      product_id: 'p-test-bom',
      inventory_item_id: 'inv-coffee',
      quantity: 30,
      unit: 'gram',
    }];
    
    await writeCart(memberKey('u1'), [{ id: 'i1', product_id: 'p-test-bom', option_ids: [], qty: 2 }]);
    
    await expect(svc.checkout('u1', undefined, { fulfillment_type: 'pickup' })).rejects.toMatchObject({ 
      status: 409,
      message: expect.stringContaining('Stok Biji Kopi tidak mencukupi')
    });
  });

  it('pre-check stok BOM: berhasil bila stok inventory mencukupi', async () => {
    const testProduct = {
      id: 'p-test-bom-2',
      name: 'Test BOM Product 2',
      base_price: '25000',
      is_active: true,
      is_available: true,
      variants: [],
      options: [],
    };
    h.products = [testProduct];
    
    h.inventoryItems = [{ id: 'inv-milk', name: 'Susu', quantity: 1000, unit: 'ml' }];
    
    h.productBOMs = [{
      product_id: 'p-test-bom-2',
      inventory_item_id: 'inv-milk',
      quantity: 50,
      unit: 'ml',
    }];
    
    await writeCart(memberKey('u1'), [{ id: 'i1', product_id: 'p-test-bom-2', option_ids: [], qty: 5 }]);
    
    const r = await svc.checkout('u1', undefined, { fulfillment_type: 'pickup' });
    expect(r.status).toBe('PENDING');
    expect(r.order_id).toBeTruthy();
  });

  it('item tidak tersedia → 409 Conflict', async () => {
    h.products = [{ ...LATTE, is_available: false }];
    await writeCart(memberKey('u1'), [{ id: 'i1', product_id: 'p-latte', option_ids: [], qty: 1 }]);
    await expect(svc.checkout('u1', undefined, { fulfillment_type: 'pickup' })).rejects.toMatchObject({ status: 409 });
  });

  it('menerapkan meta diskon voucher dari Redis', async () => {
    await writeCart(memberKey('u1'), [{ id: 'i1', product_id: 'p-latte', variant_id: 'v-lrg', option_ids: ['shot-yes'], qty: 2 }]);
    await writeCartMeta(memberKey('u1'), { voucher_code: 'WELCOME10', discount: 10000, points_to_redeem: 0, points_discount: 0 });
    await svc.checkout('u1', undefined, { fulfillment_type: 'pickup' });
    expect(h.orders[0].discount).toBe(10000);
    expect(h.orders[0].tax).toBe(7040);
    expect(h.orders[0].voucher_code).toBe('WELCOME10');
  });

  it('menukar poin: mencatat loyalty redeemed di dalam transaksi', async () => {
    await writeCart(memberKey('u1'), [{ id: 'i1', product_id: 'p-latte', option_ids: [], qty: 1 }]);
    await writeCartMeta(memberKey('u1'), { points_to_redeem: 50, points_discount: 50 });
    await svc.checkout('u1', undefined, { fulfillment_type: 'pickup' });
    expect(h.loyalty).toHaveLength(1);
    expect(h.loyalty[0].type).toBe('redeemed');
    expect(h.loyalty[0].points).toBe(50);
  });

  it('mengosongkan cart Redis setelah checkout', async () => {
    await writeCart(memberKey('u1'), [{ id: 'i1', product_id: 'p-latte', option_ids: [], qty: 1 }]);
    await svc.checkout('u1', undefined, { fulfillment_type: 'pickup' });
    expect(await (await import('./cart.service.js')).readCart(memberKey('u1'))).toEqual([]);
  });
});

// ═══════════════ status machine ═══════════════

describe('updateStatus — state machine kanonik', () => {
  const valid: [string, string][] = [
    ['PENDING', 'PAID'],
    ['PAID', 'CONFIRMED'],
    ['CONFIRMED', 'BEING_PREPARED'],
    ['BEING_PREPARED', 'READY'],
    ['READY', 'COMPLETED'],
  ];

  for (const [from, to] of valid) {
    it(`transisi sah ${from} → ${to}`, async () => {
      const o = seedOrder({ status: from });
      const r = await svc.updateStatus(o.id, { status: to });
      expect(r.status).toBe(to);
      expect(h.statusLogs.at(-1).to_status).toBe(to);
      expect(h.events.at(-1).payload.status).toBe(to);
    });
  }

  const invalid: [string, string][] = [
    ['PENDING', 'COMPLETED'],
    ['PENDING', 'READY'],
    ['COMPLETED', 'PAID'],
    ['CANCELLED', 'PAID'],
    ['READY', 'PENDING'],
  ];

  for (const [from, to] of invalid) {
    it(`transisi terlarang ${from} → ${to} → 409`, async () => {
      const o = seedOrder({ status: from });
      await expect(svc.updateStatus(o.id, { status: to })).rejects.toMatchObject({ status: 409 });
    });
  }

  it('order tidak ditemukan → 404', async () => {
    await expect(svc.updateStatus('tidak-ada', { status: 'PAID' })).rejects.toMatchObject({ status: 404 });
  });

  it('publish event SSE status_change setiap perubahan', async () => {
    const o = seedOrder({ status: 'PENDING' });
    await svc.updateStatus(o.id, { status: 'PAID' });
    expect(h.events.length).toBeGreaterThanOrEqual(1);
    expect(h.events.some(e => e.payload?.status === 'PAID')).toBe(true);
  });
});

// ═══════════════ customer cancel (ADR-012) ═══════════════

describe('cancel — customer (PENDING/PAID saja)', () => {
  it('PENDING → CANCELLED (dengan alasan) + audit log + event SSE', async () => {
    const o = seedOrder({ status: 'PENDING', user_id: 'u1' });
    const r = await svc.cancel('u1', o.id, 'Salah pesan');
    expect(r.status).toBe('CANCELLED');
    expect(r.cancel_reason).toBe('Salah pesan');
    expect(h.events.at(-1).payload.status).toBe('CANCELLED');
  });

  it('PAID → CANCELLED diperbolehkan', async () => {
    const o = seedOrder({ status: 'PAID', user_id: 'u1' });
    const r = await svc.cancel('u1', o.id);
    expect(r.status).toBe('CANCELLED');
  });

  for (const status of ['CONFIRMED', 'BEING_PREPARED', 'READY', 'COMPLETED', 'CANCELLED']) {
    it(`${status} → TIDAK bisa dibatalkan customer (409)`, async () => {
      const o = seedOrder({ status, user_id: 'u1' });
      await expect(svc.cancel('u1', o.id)).rejects.toMatchObject({ status: 409 });
    });
  }

  it('IDOR: user lain tidak bisa membatalkan order (403)', async () => {
    const o = seedOrder({ status: 'PENDING', user_id: 'u1' });
    await expect(svc.cancel('u-other', o.id)).rejects.toMatchObject({ status: 403 });
  });

  it('order tidak ditemukan → 404', async () => {
    await expect(svc.cancel('u1', 'tidak-ada')).rejects.toMatchObject({ status: 404 });
  });
});

// ═══════════════ cancel refund queue (payment.refund) ═══════════════

describe('cancel — enqueue payment.refund job when PAID', () => {
  it('menambahkan job payment.refund ke queue bila order PAID', async () => {
    const o = seedOrder({ status: 'PAID', user_id: 'u1', total: 50000 });
    await svc.cancel('u1', o.id, 'Refund dong');

    const refundJobs = h.queueAdds.filter((j) => j.queue === 'payment' && j.name === 'refund');
    expect(refundJobs.length).toBe(1);
    expect(refundJobs[0].payload).toMatchObject({ orderId: o.id, amount: 50000 });
    expect(h.queueAdds.filter((j) => j.queue === 'notification')).toHaveLength(0);
  });

  it('TIDAK menambahkan refund job bila order PENDING', async () => {
    const o = seedOrder({ status: 'PENDING', user_id: 'u1', total: 50000 });
    await svc.cancel('u1', o.id);
    expect(h.queueAdds.filter((j) => j.name === 'refund')).toHaveLength(0);
  });
});

// ═══════════════ reorder (ADR-010) ═══════════════

describe('reorder — 1 klik', () => {
  it('mengembalikan items order sebagai CartItemDTO', async () => {
    const o = seedOrder({ user_id: 'u1', items: [{ product_id: 'p-latte', qty: 2, unit_price: 37000 }] });
    const r = await svc.reorder('u1', o.id);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].product_id).toBe('p-latte');
  });

  it('IDOR: user lain tidak bisa reorder order orang lain (403)', async () => {
    const o = seedOrder({ user_id: 'u1' });
    await expect(svc.reorder('u-other', o.id)).rejects.toMatchObject({ status: 403 });
  });

  it('order tidak ditemukan → 404', async () => {
    await expect(svc.reorder('u1', 'tidak-ada')).rejects.toMatchObject({ status: 404 });
  });
});

// ═══════════════ tracking (ADR-008, anti-IDOR) ═══════════════

describe('trackByToken — publik via tracking_token', () => {
  it('token valid → status order (tanpa data sensitif user)', async () => {
    const o = seedOrder({ tracking_token: 'tok-rahasia', user_id: 'u1', status: 'READY' });
    const r = await svc.trackByToken('tok-rahasia');
    expect(r.status).toBe('READY');
    expect(r.order_number).toBe(o.order_number);
    expect(r).not.toHaveProperty('user_id');
    expect(r).not.toHaveProperty('total');
  });

  it('token tidak valid → 404 (anti-IDOR)', async () => {
    seedOrder({ tracking_token: 'tok-valid' });
    await expect(svc.trackByToken('tok-palsu')).rejects.toMatchObject({ status: 404 });
  });
});

// ═══════════════ history & queue ═══════════════

describe('history & queue', () => {
  it('history hanya order milik user + meta paginasi', async () => {
    seedOrder({ user_id: 'u1' });
    seedOrder({ user_id: 'u1' });
    seedOrder({ user_id: 'u2' });
    const r = await svc.history('u1', {});
    expect(r.data).toHaveLength(2);
    expect(r.meta.total).toBe(2);
  });

  it('queue default status PAID,CONFIRMED', async () => {
    seedOrder({ status: 'PAID' });
    seedOrder({ status: 'CONFIRMED' });
    seedOrder({ status: 'PENDING' });
    const r = await svc.queue({});
    expect(r).toHaveLength(2);
  });

  it('queue menerima filter status eksplisit', async () => {
    seedOrder({ status: 'PENDING' });
    const r = await svc.queue({ status: 'PENDING' });
    expect(r).toHaveLength(1);
  });
});

// ═══════════════ detail (IDOR) ═══════════════

describe('detail — anti-IDOR', () => {
  it('user lain tidak bisa lihat detail order (403)', async () => {
    const o = seedOrder({ user_id: 'u1' });
    await expect(svc.detail('u-other', o.id)).rejects.toMatchObject({ status: 403 });
  });

  it('pemilik bisa lihat detail', async () => {
    const o = seedOrder({ user_id: 'u1' });
    const r = await svc.detail('u1', o.id);
    expect(r.id).toBe(o.id);
  });
});

// ═══════════════ printTicket — kitchen ticket PDF ═══════════════

describe('printTicket — kitchen ticket PDF', () => {
  it('return PDF buffer untuk order valid (staff role)', async () => {
    const o = seedOrder({ 
      status: 'PAID', 
      user_id: 'u1',
      outlet_id: 'outlet-1',
      items: [{ product_id: 'p-latte', qty: 2, unit_price: 37000, line_total: 74000, options: null }]
    });
    
    h.outlets = [{ id: 'outlet-1', name: 'Outlet Pusat' }];
    
    const pdfBuffer = await svc.printTicket(o.id, 'kasir', 'outlet-1');
    
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfBuffer.toString('ascii', 0, 4)).toBe('%PDF');
  });

  it('404 bila order tidak ditemukan', async () => {
    await expect(svc.printTicket('tidak-ada', 'kasir')).rejects.toMatchObject({ status: 404 });
  });

  it('403 bila role tidak diizinkan (guest)', async () => {
    const o = seedOrder({ status: 'PAID' });
    await expect(svc.printTicket(o.id, 'guest')).rejects.toMatchObject({ status: 403 });
  });

  it('403 bila staff mencoba akses order outlet lain', async () => {
    const o = seedOrder({ status: 'PAID', outlet_id: 'outlet-2' });
    await expect(svc.printTicket(o.id, 'kasir', 'outlet-1')).rejects.toMatchObject({ status: 403 });
  });

  it('owner bisa akses order outlet mana saja', async () => {
    const o = seedOrder({ status: 'PAID', outlet_id: 'outlet-2' });
    
    h.outlets = [{ id: 'outlet-1', name: 'Outlet 1' }, { id: 'outlet-2', name: 'Outlet 2' }];
    
    const pdfBuffer = await svc.printTicket(o.id, 'owner', 'outlet-1');
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
        expect(pdfBuffer.toString('ascii', 0, 4)).toBe('%PDF');
      });
    });

    // ═══════════════ loyalty earn on COMPLETED (issue #75) ═══════════════

    describe('loyalty earn on COMPLETED (issue #75)', () => {
      const POINT_EARN_PER_IDR = 1000; // default from env

      beforeEach(() => {
        h.loyalty = [];
      });

      it('COMPLETED → earned + floor(total/POINT_EARN_PER_IDR)', async () => {
        const o = seedOrder({ status: 'READY', user_id: 'u1', total: 71040, items: [] });
        await svc.updateStatus(o.id, { status: 'COMPLETED', changed_by: 'staff' });
        const lp = h.loyalty.find((l) => l.order_id === o.id && l.type === 'earned');
        expect(lp).toBeDefined();
        expect(lp!.user_id).toBe('u1');
        expect(lp!.points).toBe(Math.floor(71040 / POINT_EARN_PER_IDR)); // 71
      });

      it('COMPLETED 2× → tetap 1 baris (idempotent)', async () => {
          const o = seedOrder({ status: 'READY', user_id: 'u1', total: 50000, items: [] });
          await svc.updateStatus(o.id, { status: 'COMPLETED', changed_by: 'staff' });
          // Second call should throw (invalid transition) but points already awarded
          await expect(svc.updateStatus(o.id, { status: 'COMPLETED', changed_by: 'staff' })).rejects.toMatchObject({ status: 409 });
          const earned = h.loyalty.filter((l) => l.order_id === o.id && l.type === 'earned');
          expect(earned).toHaveLength(1);
          expect(earned[0].points).toBe(Math.floor(50000 / POINT_EARN_PER_IDR)); // 50
        });

      it('guest tanpa user_id → tidak error & tanpa poin', async () => {
        const o = seedOrder({ status: 'READY', user_id: null, total: 50000, items: [] });
        await svc.updateStatus(o.id, { status: 'COMPLETED', changed_by: 'staff' });
        const earned = h.loyalty.filter((l) => l.order_id === o.id && l.type === 'earned');
        expect(earned).toHaveLength(0);
      });

      it('status lain (CONFIRMED, BEING_PREPARED) → tanpa poin', async () => {
        const o = seedOrder({ status: 'PAID', user_id: 'u1', total: 50000, items: [] });
        await svc.updateStatus(o.id, { status: 'CONFIRMED', changed_by: 'staff' });
        await svc.updateStatus(o.id, { status: 'BEING_PREPARED', changed_by: 'staff' });
        const earned = h.loyalty.filter((l) => l.order_id === o.id && l.type === 'earned');
        expect(earned).toHaveLength(0);
      });
    });