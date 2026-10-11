import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { redisCache } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { BadRequest, NotFound, Forbidden, Conflict } from '../../lib/http.js';
import { cartKeyFor, readCart, writeCart, priceCart, mergeGuestCart, normalizeCartItemInput } from './cart.service.js';
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
    const item = { id: randomUUID(), ...normalizeCartItemInput(input) };
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
    if (body.quantity) items[idx].qty = body.quantity;
    if (body.notes !== undefined) items[idx].notes = body.notes;
    // allow updating options
    if (body.option_ids) items[idx].option_ids = body.option_ids;
    if (body.selected_options) items[idx].option_ids = body.selected_options;
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
    let pointsDiscount = 0;

    if (body?.voucher_code) {
      const v = await prisma.voucher.findFirst({ 
        where: { 
          code: body.voucher_code, 
          is_active: true,
        } 
      });
      if (!v) throw NotFound('Voucher tidak valid');
      
      // validasi min_purchase
      const priced = await priceCart(items);
      if (v.min_purchase && priced.subtotal < Number(v.min_purchase)) {
        throw BadRequest(`Minimal belanja Rp ${v.min_purchase} untuk voucher ini`);
      }
      // validasi expires_at
      if (v.expires_at && new Date(v.expires_at) < new Date()) {
        throw BadRequest('Voucher sudah kadaluarsa');
      }
      // Note: usage_limit, used_count, discount_type, discount_value, max_discount tidak ada di schema
      // Gunakan discount_amount sebagai fixed discount
      discount = Number(v.discount_amount);
    }

    // bug #7: penukaran poin
    if (body?.points_to_redeem && userId) {
      const pointsToRedeem = Number(body.points_to_redeem);
      if (pointsToRedeem > 0) {
        // cek saldo poin member (LoyaltyPoint pakai field `points` dan `type`)
        const earned = await prisma.loyaltyPoint.aggregate({
          where: { user_id: userId, type: 'earned' },
          _sum: { points: true },
        });
        const redeemed = await prisma.loyaltyPoint.aggregate({
          where: { user_id: userId, type: 'redeemed' },
          _sum: { points: true },
        });
        const balance = (earned._sum.points ?? 0) - (redeemed._sum.points ?? 0);
        if (pointsToRedeem > balance) {
          throw BadRequest('Saldo poin tidak cukup');
        }
        pointsDiscount = pointsToRedeem * env.POINT_VALUE;
      }
    }

    return priceCart(items, { discount, pointsDiscount });
  }

  async merge(userId: string, guestId: string) {
    const merged = await mergeGuestCart(userId, guestId);
    return { cart_merged: merged, cart: await this.getCart(userId) };
  }

  async checkout(userId: string | undefined, guestId: string | undefined, input: any) {
    const key = cartKeyFor(userId, guestId);
    const items = await readCart(key);
    if (!items.length) throw BadRequest('Cart kosong');

    // Normalisasi items untuk memastikan field konsisten
    const normalizedItems = items.map(normalizeCartItemInput);
    
    const priced = await priceCart(normalizedItems, { 
      shipping: input.fulfillment_type === 'delivery' ? env.SHIPPING_FLAT_FEE : 0 
    });
    if (priced.items.some((i: any) => i.unavailable)) throw Conflict('Ada item yang tidak tersedia');

    const order_number = `CS-${Date.now().toString(36).toUpperCase()}`;
    const tracking_token = randomBytes(32).toString('base64url');

    // bug #2: atomic transaction (order + items + status log)
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
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

      // OrderStatusLog awal (bug #5) - gunakan to_status sesuai schema
      await tx.orderStatusLog.create({
        data: {
          order_id: order.id,
          to_status: 'PENDING',
          note: 'Order dibuat',
          changed_by: userId ?? null,
        },
      });

      // OrderItems dengan unit_price, line_total, options (bug #3, #4)
      for (const item of normalizedItems) {
        const pricedItem = priced.items.find(p => 
          p.product_id === item.product_id && 
          p.variant_id === item.variant_id && 
          JSON.stringify(p.option_ids?.sort() ?? []) === JSON.stringify(item.option_ids?.sort() ?? [])
        );
        
        // Snapshot opsi terpilih (bug #4)
        const selectedOptions = [];
        if (item.option_ids?.length) {
          const product = await tx.product.findUnique({
            where: { id: item.product_id },
            include: { options: { include: { values: true } } },
          });
          if (product) {
            const allValues = product.options.flatMap(o => o.values);
            for (const oid of item.option_ids) {
              const v = allValues.find(x => x.id === oid);
              if (v) {
                selectedOptions.push({
                  option_value_id: v.id,
                  name: v.value,
                  price_adjustment: Number(v.price_adjustment),
                });
              }
            }
          }
        }

        await tx.orderItem.create({
          data: {
            order_id: order.id,
            product_id: item.product_id,
            variant_id: item.variant_id ?? null,
            qty: item.qty,
            unit_price: pricedItem?.unit_price ?? 0,
            line_total: pricedItem?.line_total ?? 0,
            options: selectedOptions,
          },
        });
      }

      return { order, tracking_token };
    });

    await redisCache.del(key);
    return {
      order_id: result.order.id,
      order_number,
      status: 'PENDING',
      tracking_token: result.tracking_token,
      payment_initiate_url: `/api/v1/payments/initiate?order_id=${result.order.id}`,
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
