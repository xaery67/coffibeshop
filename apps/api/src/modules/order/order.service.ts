import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { redisCache, redisPubSub } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { BadRequest, NotFound, Forbidden, Conflict } from '../../lib/http.js';
import { cartKeyFor, readCart, writeCart, priceCart, mergeGuestCart, normalizeCartItemInput, readCartMeta, writeCartMeta, clearCartMeta } from './cart.service.js';
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
    let voucherCode: string | undefined;

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
      discount = Number(v.discount_amount);
      voucherCode = v.code;
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

    // Simpan meta ke Redis (voucher, discount, points)
    await writeCartMeta(key, {
      voucher_code: voucherCode,
      discount,
      points_to_redeem: body?.points_to_redeem ? Number(body.points_to_redeem) : undefined,
      points_discount: pointsDiscount,
    });

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
    
    // Baca meta cart (voucher, points)
    const meta = await readCartMeta(key);
    const discount = meta?.discount ?? 0;
    const pointsDiscount = meta?.points_discount ?? 0;
    const pointsToRedeem = meta?.points_to_redeem ?? 0;
    const voucherCode = meta?.voucher_code;

    const priced = await priceCart(normalizedItems, { 
      shipping: input.fulfillment_type === 'delivery' ? env.SHIPPING_FLAT_FEE : 0,
      discount,
      pointsDiscount,
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
          points_discount: priced.points_discount,
          voucher_code: voucherCode ?? null,
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

            // Publish order created event to Redis for WebSocket fan-out
                        await redisPubSub.publish('order:created', JSON.stringify({
                                      type: 'created',
                                      order_id: order.id,
                                      order_number,
                                      outlet_id: order.outlet_id ?? null,
                                      status: 'PENDING',
                                      created_at: new Date().toISOString(),
                                    }));

            // Batch fetch produk+opsi untuk snapshot opsi (N+1 fix bug #4)
      const productIds = [...new Set(normalizedItems.map(i => i.product_id))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        include: { variants: true, options: { include: { values: true } } },
      });
      const productMap = new Map(products.map(p => [p.id, p]));

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
          const product = productMap.get(item.product_id);
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

      // Loyalty points redeemed (bug #7) - buat record redeemed di dalam TX
      if (userId && pointsToRedeem > 0) {
        await tx.loyaltyPoint.create({
          data: {
            user_id: userId,
            points: pointsToRedeem,
            type: 'redeemed',
            order_id: order.id,
          },
        });
      }

      return { order, tracking_token };
    });

    await redisCache.del(key);
    await clearCartMeta(key);
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
    const outletId = typeof query.outlet_id === 'string' ? query.outlet_id : undefined;
    return prisma.order.findMany({
      where: {
        status: { in: statuses as any },
        ...(outletId ? { outlet_id: outletId } : {}),
      },
      orderBy: { created_at: 'asc' },
      take: 50,
      include: {
        items: { include: { product: { select: { id: true, name: true } } } },
      },
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

  /** Reorder 1-klik (ADR-010) — kembalikan CartItemDTO pre-filled dengan harga & stok terkini. */
    async reorder(userId: string, orderId: string) {
      const order = await prisma.order.findUnique({ 
        where: { id: orderId }, 
        include: { 
          items: {
            include: {
              product: {
                include: {
                  variants: true,
                  options: { include: { values: true } },
                },
              },
            },
          },
        },
      });
      if (!order) throw NotFound('Order tidak ditemukan');
      if (order.user_id && order.user_id !== userId) throw Forbidden();

      // Verify each item is still available and get current pricing
      const cartItems = [];
      for (const item of order.items) {
        const product = item.product;
        if (!product || !product.is_available || !product.is_active) {
          continue; // Skip unavailable products
        }

        // Check variant if applicable - fetch from product variants
                let variant = null;
                if (item.variant_id && product.variants.length > 0) {
                  variant = product.variants.find((v: any) => v.id === item.variant_id);
                  if (!variant || !variant.is_active) {
                    continue;
                  }
                }

                // Check options availability
                                const validOptions: any[] = [];
                                const itemOptions = item.options as any[] | undefined;
                if (itemOptions?.length) {
                  const allValues = product.options.flatMap((o: any) => o.values);
                  for (const opt of itemOptions) {
                    const v = allValues.find((x: any) => x.id === opt.option_value_id);
                    if (v && v.is_active) {
                      validOptions.push({
                        option_value_id: v.id,
                        name: v.value,
                        price_adjustment: Number(v.price_adjustment),
                      });
                    }
                  }
                }

                // Calculate current price
        let unitPrice = Number(product.base_price);
        if (variant) unitPrice += Number(variant.price_delta);
        if (validOptions.length) {
          unitPrice += validOptions.reduce((sum: number, o: any) => sum + o.price_adjustment, 0);
        }

        cartItems.push({
          id: item.id,
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          option_ids: validOptions.map((o: any) => o.option_value_id),
          qty: item.qty,
          notes: item.notes ?? null,
          unit_price: unitPrice,
          line_total: unitPrice * item.qty,
          product_name: product.name,
          unavailable: false,
        });
      }

      return { items: cartItems };
    }

  /** Customer cancel (ADR-012) — hanya PENDING/PAID. */
    async cancel(userId: string | undefined, orderId: string, reason?: string) {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) throw NotFound('Order tidak ditemukan');
      if (order.user_id && order.user_id !== userId) throw Forbidden();
    
      // State machine guard: only allow cancellation from PENDING or PAID
      const allowedStatuses = ['PENDING', 'PAID'];
      if (!allowedStatuses.includes(order.status)) {
        throw Conflict(`Order berstatus ${order.status} tidak bisa dibatalkan customer`);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const o = await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED', cancel_reason: reason ?? null },
        });

        // Add to OrderStatusLog
        await tx.orderStatusLog.create({
          data: {
            order_id: orderId,
            to_status: 'CANCELLED',
            note: reason ?? 'Dibatalkan oleh customer',
            changed_by: userId ?? null,
          },
        });

        // If PAID, enqueue refund job (async via BullMQ)
                if (order.status === 'PAID') {
                  const { queues } = await import('../../queue/queues.js');
                  await queues.payment.add('refund', {
                    orderId: order.id,
                    amount: Number(order.total),
                    reason: reason ?? 'Customer cancelled',
                  }).catch((err) => {
                    console.warn('Failed to enqueue refund job:', err);
                  });
                }

        return o;
              });

              // Publish cancellation event to Redis for WebSocket fan-out
                            await redisPubSub.publish('order:cancelled', JSON.stringify({
                                            type: 'cancelled',
                                            order_id: orderId,
                                            order_number: updated.order_number,
                                            outlet_id: order.outlet_id ?? null,
                                            status: 'CANCELLED',
                                            previous_status: order.status,
                                            reason: reason ?? 'Dibatalkan oleh customer',
                                            timestamp: new Date().toISOString(),
                                          }));

              publishOrderEvent(orderId, { status: 'CANCELLED', timestamp: new Date().toISOString() });
              return updated;
            }

  /**
   * PUT /orders/:id/status — state machine kanonik + audit log (F-011, #9).
   *
   * - Transisi ilegal → 409 Conflict.
   * - Saat → CONFIRMED, trigger PG `trg_orders_deduct_inventory` mengurangi stok
   *   secara atomik; bila stok kurang trigger melempar exception → 409 + rollback.
   * - Setiap perubahan dicatat ke `order_status_logs` (from_status → to_status)
   *   dan di-publish ke Redis (`order:status`) untuk fan-out WebSocket staff.
   */
  async updateStatus(orderId: string, body: any) {
    const validTransitions: Record<string, string[]> = {
      PENDING: ['PAID', 'CANCELLED'],
      PAID: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['BEING_PREPARED', 'CANCELLED'],
      BEING_PREPARED: ['READY', 'CANCELLED'],
      READY: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw NotFound('Order tidak ditemukan');

    const allowed = validTransitions[order.status] ?? [];
    if (!allowed.includes(body.status)) {
      throw Conflict(`Transisi ${order.status} → ${body.status} tidak diizinkan`);
    }

    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const o = await tx.order.update({
          where: { id: orderId },
          data: { status: body.status },
        });

        await tx.orderStatusLog.create({
          data: {
            order_id: orderId,
            from_status: order.status,
            to_status: body.status,
            note: body.note ?? null,
            changed_by: body.changed_by ?? null,
          },
        });

        return o;
      });
    } catch (err) {
      // Trigger inventori melempar check_violation saat stok kurang → petakan ke 409.
      const msg = (err as Error).message ?? '';
      if (/Stok .* tidak mencukupi/.test(msg)) {
        throw Conflict(msg.split('\n')[0]);
      }
      throw err;
    }

    await redisPubSub.publish(
      'order:status',
      JSON.stringify({
        type: 'status',
        order_id: orderId,
        order_number: updated.order_number,
        outlet_id: order.outlet_id ?? null,
        status: body.status,
        previous_status: order.status,
        changed_by: body.changed_by ?? null,
        timestamp: new Date().toISOString(),
      }),
    );

    publishOrderEvent(orderId, { status: body.status, timestamp: new Date().toISOString() });
    return updated;
  }
}
