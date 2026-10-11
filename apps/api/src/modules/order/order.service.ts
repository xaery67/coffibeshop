import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { redisCache } from '../../config/redis.js';
import { BadRequest, NotFound, Forbidden, Conflict } from '../../lib/http.js';
import { cartKeyFor, readCart, writeCart, priceCart, mergeGuestCart } from './cart.service.js';
import { publishOrderEvent } from './sse.controller.js';

export class OrderService {
  async getCart(userId?: string, guestId?: string) {
    const key = cartKeyFor(userId, guestId);
    const items = await readCart(key);
    return priceCart(items);
  }

  async addItem(userId: string | undefined, guestId: string | undefined, input: any) {
    const key = cartKeyFor(userId, guestId);
    const items = await readCart(key);
    const item = { id: randomUUID(), ...input, option_ids: input.option_ids ?? [] };
    items.push(item);
    await writeCart(key, items);
    return priceCart(items);
  }

  async updateItem(userId: string | undefined, guestId: string | undefined, id: string, body: any) {
    const key = cartKeyFor(userId, guestId);
    const items = await readCart(key);
    const idx = items.findIndex((i: any) => i.id === id);
    if (idx === -1) throw NotFound('Item tidak ada di cart');
    if (body.qty) items[idx].qty = body.qty;
    if (body.notes !== undefined) items[idx].notes = body.notes;
    await writeCart(key, items);
    return priceCart(items);
  }

  async removeItem(userId: string | undefined, guestId: string | undefined, id: string) {
    const key = cartKeyFor(userId, guestId);
    const items = (await readCart(key)).filter((i: any) => i.id !== id);
    await writeCart(key, items);
    return priceCart(items);
  }

  async applyVoucher(userId: string | undefined, guestId: string | undefined, body: any) {
    const key = cartKeyFor(userId, guestId);
    const items = await readCart(key);
    let discount = 0;
    if (body?.voucher_code) {
      const v = await prisma.voucher.findFirst({ where: { code: body.voucher_code, is_active: true } });
      if (!v) throw NotFound('Voucher tidak valid');
      discount = Number(v.discount_amount ?? 0);
    }
    return priceCart(items, { discount });
  }

  async merge(userId: string, guestId: string) {
    const merged = await mergeGuestCart(userId, guestId);
    return { cart_merged: merged, cart: await this.getCart(userId) };
  }

  async checkout(userId: string | undefined, guestId: string | undefined, input: any) {
    const key = cartKeyFor(userId, guestId);
    const items = await readCart(key);
    if (!items.length) throw BadRequest('Cart kosong');

    const priced = await priceCart(items);
    if (priced.items.some((i: any) => i.unavailable)) throw Conflict('Ada item yang tidak tersedia');

    const order_number = `CS-${Date.now().toString(36).toUpperCase()}`;
    const tracking_token = randomBytes(32).toString('base64url');

    const order = await prisma.order.create({
      data: {
        order_number,
        user_id: userId ?? null,
        status: 'PENDING',
        total: priced.total,
        subtotal: priced.subtotal,
        tax: priced.tax,
        shipping_fee: priced.shipping_fee,
        discount: priced.discount,
        fulfillment_type: input.fulfillment_type ?? 'pickup',
        payment_method: input.payment_method ?? 'qris',
        tracking_token,
        notes: input.notes ?? null,
      },
    });

    await prisma.orderItem.createMany({
      data: items.map((i: any) => ({
        order_id: order.id,
        product_id: i.product_id,
        variant_id: i.variant_id ?? null,
        qty: i.qty,
        unit_price: 0,
        line_total: 0,
      })),
    });

    await redisCache.del(key);
    return {
      order_id: order.id,
      order_number,
      status: 'PENDING',
      tracking_token,
      payment_initiate_url: `/api/v1/payments/initiate?order_id=${order.id}`,
    };
  }

  async history(userId: string, query: any) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: true },
      }),
      prisma.order.count({ where: { user_id: userId } }),
    ]);
    return { data, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  async detail(userId: string, id: string) {
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw NotFound('Order tidak ditemukan');
    if (order.user_id && order.user_id !== userId) throw Forbidden();
    return order;
  }

  async queue(query: any) {
    const statuses = query.status ? String(query.status).split(',') : ['PAID', 'CONFIRMED'];
    return prisma.order.findMany({
      where: { status: { in: statuses as any } },
      orderBy: { created_at: 'asc' },
      take: 50,
      include: { items: true },
    });
  }

  /** Lacak via token publik (ADR-008) — anti-IDOR: token A ≠ order B. */
  async trackByToken(token: string) {
    const order = await prisma.order.findUnique({ where: { tracking_token: token } });
    if (!order) throw NotFound('Token tidak valid atau order tidak ditemukan');
    return {
      order_number: order.order_number,
      status: order.status,
      estimated_ready_time: order.estimated_ready_time,
      updated_at: order.updated_at,
    };
  }

  /** Reorder 1-klik (ADR-010) — kembalikan CartItemDTO pre-filled. */
  async reorder(userId: string, orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw NotFound('Order tidak ditemukan');
    if (order.user_id && order.user_id !== userId) throw Forbidden();
    return { items: order.items };
  }

  /** Customer cancel (ADR-012) — hanya PENDING/PAID. */
  async cancel(userId: string | undefined, orderId: string, reason?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw NotFound('Order tidak ditemukan');
    if (order.user_id && order.user_id !== userId) throw Forbidden();
    if (!['PENDING', 'PAID'].includes(order.status)) {
      throw Conflict(`Order berstatus ${order.status} tidak bisa dibatalkan customer`);
    }
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancel_reason: reason ?? null },
    });
    if (order.status === 'PAID') {
      // Phase 2: enqueue refund async
    }
    publishOrderEvent(orderId, { status: 'CANCELLED', timestamp: new Date().toISOString() });
    return updated;
  }

  async updateStatus(orderId: string, body: any) {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: body.status },
    });
    publishOrderEvent(orderId, { status: order.status, timestamp: new Date().toISOString() });
    return order;
  }
}
