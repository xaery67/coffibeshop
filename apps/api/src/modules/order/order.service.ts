import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { redisCache, redisPubSub } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { BadRequest, NotFound, Forbidden, Conflict } from '../../lib/http.js';
import { cartKeyFor, readCart, writeCart, priceCart, mergeGuestCart, normalizeCartItemInput, readCartMeta, writeCartMeta, clearCartMeta } from './cart.service.js';
import { publishOrderEvent, publishOrderStatus } from './sse.controller.js';
import PDFDocument from 'pdfkit';

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

      // Resolusi outlet (WAJIB agar order muncul di dashboard admin / antrian outlet).
      // Guest memilih outlet saat checkout; staff memakai outlet miliknya bila tak dikirim.
      // Sebelumnya order dibuat dengan outlet_id=null → `GET /orders/queue?outlet_id=` kosong.
      let outletId: string | null = null;
      const requestedOutlet =
        typeof input.outlet_id === 'string' && input.outlet_id.trim() ? input.outlet_id.trim() : null;
      if (requestedOutlet) {
        const outlet = await prisma.outlet.findUnique({
          where: { id: requestedOutlet },
          select: { id: true, is_active: true },
        });
        if (!outlet) throw BadRequest('Outlet tidak ditemukan');
        if (!outlet.is_active) throw BadRequest('Outlet tidak aktif');
        outletId = outlet.id;
      } else if (userId) {
        // Staff/member dengan outlet ter-scope: pakai outlet miliknya.
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { outlet_id: true } });
        if (u?.outlet_id) outletId = u.outlet_id;
      }
      if (!outletId) throw BadRequest('outlet_id wajib diisi untuk membuat pesanan');

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
      if (priced.items.some((i: any) => i.unavailable)) {
        // Pesan actionable: sebutkan item & alasannya, jangan sekadar "ada item tidak tersedia".
        const bad = priced.items.filter((i: any) => i.unavailable);
        const detail = bad
          .map((i: any) => `${i.product_name ?? 'Item'} (${i.unavailable_reason ?? 'tidak tersedia'})`)
          .join('; ');
        throw Conflict(`Ada item yang tidak tersedia: ${detail}. Hapus item tersebut dari keranjang untuk melanjutkan.`);
      }

      // ─── Pre-check stok BOM (2b) ───
      // Hitung total kebutuhan inventory per item untuk seluruh cart
      const inventoryNeeds = new Map<string, { needed: number; unit: string; inventoryItemId: string; name: string }>();
    
      for (const item of normalizedItems) {
        const productId = item.product_id;
        const qty = item.qty;
      
        const bomItems = await prisma.productBOM.findMany({
          where: { product_id: productId },
          include: { inventoryItem: true },
        });
      
        for (const bom of bomItems) {
          const needed = Number(bom.quantity) * qty;
          const key = bom.inventory_item_id;
          const existing = inventoryNeeds.get(key);
          if (existing) {
            existing.needed += needed;
          } else {
            inventoryNeeds.set(key, {
              needed,
              unit: bom.unit,
              inventoryItemId: bom.inventory_item_id,
              name: bom.inventoryItem.name,
            });
          }
        }
      }
    
      // Cek ketersediaan stok
      for (const [inventoryItemId, need] of inventoryNeeds) {
        const inventoryItem = await prisma.inventoryItem.findUnique({
          where: { id: inventoryItemId },
          select: { id: true, quantity: true, name: true, unit: true },
        });
      
        if (!inventoryItem) {
          throw Conflict(`Inventori ${need.name} tidak ditemukan`);
        }
      
        const available = Number(inventoryItem.quantity);
        if (available < need.needed) {
          throw Conflict(`Stok ${need.name} tidak mencukupi (tersedia: ${available} ${need.unit}, butuh: ${need.needed} ${need.unit})`);
        }
      }
      // ─── End pre-check ───

      const order_number = `CS-${Date.now().toString(36).toUpperCase()}`;
      const tracking_token = randomBytes(32).toString('base64url');

      // bug #2: atomic transaction (order + items + status log)
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            order_number,
            user_id: userId ?? null,
            outlet_id: outletId,
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
    // Default = SEMUA status aktif (bukan hanya PAID,CONFIRMED).
    //
    // Papan antrian punya 4 kolom (Baru·Diproses·Siap·Selesai) dan alurnya
    // PAID → CONFIRMED → BEING_PREPARED → READY → COMPLETED. Bila default hanya
    // PAID,CONFIRMED, order HILANG dari papan begitu staff klik "Mulai siapkan"
    // (BEING_PREPARED) → tak ada aksi lanjutan → customer macet di "Sedang
    // disiapkan". CANCELLED tetap dikecualikan (tidak relevan di antrian kerja).
    const ACTIVE_STATUSES = ['PAID', 'CONFIRMED', 'BEING_PREPARED', 'READY', 'COMPLETED'];
    const statuses = query.status ? String(query.status).split(',') : ACTIVE_STATUSES;
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

              publishOrderStatus(order, { status: 'CANCELLED', timestamp: new Date().toISOString() });
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
                    const m = msg.match(/Stok .* tidak mencukupi[^\n"]*/);
                    throw Conflict(m ? m[0] : 'Stok tidak mencukupi');
                  }
                  throw err;
                }

        // Auto-award loyalty points when order reaches COMPLETED (idempotent)
        if (body.status === 'COMPLETED' && order.status !== 'COMPLETED' && order.user_id) {
          await this.awardLoyaltyPoints(orderId, order.user_id, Number(updated.total));
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

    publishOrderStatus(order, { status: body.status, timestamp: new Date().toISOString() });
        return updated;
          }

          /**
           * Award loyalty points for completed order (idempotent).
           * Points = floor(total / POINT_EARN_PER_IDR)
           * Creates LoyaltyPoint record with type='earned' if not already exists for this order.
           */
          private async awardLoyaltyPoints(orderId: string, userId: string, total: number): Promise<void> {
            // Check if already awarded for this order
            const existing = await prisma.loyaltyPoint.findFirst({
              where: { order_id: orderId, type: 'earned' },
            });
            if (existing) return; // Already awarded, idempotent

            const points = Math.floor(total / env.POINT_EARN_PER_IDR);
            if (points <= 0) return; // No points for small orders

            await prisma.loyaltyPoint.create({
              data: {
                user_id: userId,
                points,
                type: 'earned',
                order_id: orderId,
              },
            });
          }

          /**
           * Generate kitchen ticket PDF for order.
       * Returns PDF buffer with Content-Type: application/pdf
       */
      async printTicket(orderId: string, userRole: string, outletId?: string): Promise<Buffer> {
        // Fetch order with items, product names, outlet
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true } },
              },
            },
            outlet: { select: { id: true, name: true } },
          },
        });

        if (!order) throw NotFound('Order tidak ditemukan');

        // RBAC: staff/owner/manager only (checked in route, but double-check)
        const allowedRoles = ['owner', 'manager', 'kasir', 'barista'];
        if (!allowedRoles.includes(userRole)) throw Forbidden();

        // Outlet scoping for staff
        if (outletId && order.outlet_id !== outletId && userRole !== 'owner') {
          throw Forbidden('Tidak bisa akses order outlet lain');
        }

        // Generate PDF using pdfkit
        return new Promise((resolve, reject) => {
          const doc = new PDFDocument({ margin: 40, size: 'A5' });
          const chunks: Buffer[] = [];

          doc.on('data', (chunk: Buffer) => chunks.push(chunk));
          doc.on('end', () => resolve(Buffer.concat(chunks)));
          doc.on('error', reject);

          // Header
          doc.fontSize(18).font('Helvetica-Bold').text('KITCHEN TICKET', { align: 'center' });
          doc.moveDown(0.5);

          // Order info
          doc.fontSize(10).font('Helvetica');
          doc.text(`No. Order: ${order.order_number}`, { align: 'left' });
          doc.text(`Outlet: ${order.outlet?.name ?? 'N/A'}`, { align: 'left' });
          doc.text(`Waktu: ${new Date(order.created_at).toLocaleString('id-ID')}`, { align: 'left' });
          doc.text(`Status: ${order.status}`, { align: 'left' });
          doc.text(`Tipe: ${order.fulfillment_type}`, { align: 'left' });
          if (order.notes) doc.text(`Catatan: ${order.notes}`, { align: 'left' });
          doc.moveDown(0.5);

          // Separator
          doc.moveTo(40, doc.y).lineTo(370, doc.y).stroke();
          doc.moveDown(0.5);

          // Items header
          doc.fontSize(12).font('Helvetica-Bold').text('ITEM', { align: 'left' });
          doc.moveDown(0.3);

          // Items
          doc.fontSize(10).font('Helvetica');
          for (const item of order.items) {
                      const productName = item.product?.name ?? 'Produk';
                      const qty = item.qty;
                      const lineTotal = Number(item.line_total);

            doc.text(`${qty}x ${productName}`, { align: 'left', indent: 20 });
        
            // Options
            if (item.options) {
              const options = item.options as any[];
              for (const opt of options) {
                doc.text(`  - ${opt.name} (+Rp ${Number(opt.price_adjustment).toLocaleString('id-ID')})`, { 
                  align: 'left', 
                  indent: 40 
                });
              }
            }
        
            // Notes
            if (item.notes) {
              doc.text(`  Catatan: ${item.notes}`, { align: 'left', indent: 40 });
            }

            doc.text(`  Subtotal: Rp ${lineTotal.toLocaleString('id-ID')}`, { align: 'right', indent: 20 });
            doc.moveDown(0.3);
          }

          // Separator
          doc.moveTo(40, doc.y).lineTo(370, doc.y).stroke();
          doc.moveDown(0.5);

          // Totals
          doc.fontSize(10).font('Helvetica');
          doc.text(`Subtotal: Rp ${Number(order.subtotal).toLocaleString('id-ID')}`, { align: 'right' });
          if (Number(order.discount) > 0) {
            doc.text(`Diskon: -Rp ${Number(order.discount).toLocaleString('id-ID')}`, { align: 'right' });
          }
          if (Number(order.points_discount) > 0) {
            doc.text(`Poin: -Rp ${Number(order.points_discount).toLocaleString('id-ID')}`, { align: 'right' });
          }
          doc.text(`Pajak: Rp ${Number(order.tax).toLocaleString('id-ID')}`, { align: 'right' });
          if (Number(order.shipping_fee) > 0) {
            doc.text(`Ongkir: Rp ${Number(order.shipping_fee).toLocaleString('id-ID')}`, { align: 'right' });
          }
          doc.moveDown(0.3);
          doc.fontSize(12).font('Helvetica-Bold');
          doc.text(`TOTAL: Rp ${Number(order.total).toLocaleString('id-ID')}`, { align: 'right' });

          doc.end();
        });
      }
    }
