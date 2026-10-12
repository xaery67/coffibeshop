import { prisma } from '../../config/prisma.js';
import { BadRequest, NotFound, Conflict } from '../../lib/http.js';

export class InventoryService {
  /** GET /api/v1/inventory — daftar stok outlet. */
  async getInventory(outletId?: string) {
    return prisma.inventoryItem.findMany({
      where: outletId ? { outlet_id: outletId } : {},
      orderBy: { name: 'asc' },
      include: {
        bom: {
          include: { product: { select: { id: true, name: true } } },
        },
      },
    });
  }

  /** GET /api/v1/inventory/logs — riwayat mutasi stok. */
  async getLogs(outletId?: string, itemId?: string, limit = 50) {
    return prisma.inventoryLog.findMany({
      where: {
        ...(outletId ? { outlet_id: outletId } : {}),
        ...(itemId ? { inventory_item_id: itemId } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      include: {
        inventoryItem: { select: { id: true, name: true, unit: true } },
        order: { select: { id: true, order_number: true } },
      },
    });
  }

  /** POST /api/v1/inventory — tambah item stok baru. */
  async createItem(input: any) {
    return prisma.inventoryItem.create({
      data: {
        outlet_id: input.outlet_id,
        name: input.name,
        unit: input.unit,
        quantity: input.quantity ?? 0,
        min_stock: input.min_stock ?? 0,
      },
    });
  }

  /** PUT /api/v1/inventory/:id — update stok (restock/adjustment). */
  async updateStock(itemId: string, input: any) {
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw NotFound('Item inventori tidak ditemukan');

    const delta = input.delta ?? 0;
    const newQty = Number(item.quantity) + delta;
    if (newQty < 0) throw BadRequest('Stok tidak boleh negatif');

    return prisma.$transaction(async (tx) => {
      const updated = await tx.inventoryItem.update({
        where: { id: itemId },
        data: { quantity: newQty },
      });

      await tx.inventoryLog.create({
        data: {
          outlet_id: item.outlet_id ?? null,
          inventory_item_id: itemId,
          type: delta > 0 ? 'restock' : 'adjustment',
          quantity: Math.abs(delta),
          unit: item.unit,
          note: input.note ?? `Manual ${delta > 0 ? 'restock' : 'adjustment'}`,
        },
      });

      return updated;
    });
  }

  /**
   * Deduct inventory berdasarkan BOM produk saat order CONFIRMED.
   * Dipanggil saat order status berubah ke CONFIRMED (via trigger/service).
   */
  async deductForOrder(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              include: {
                bom: {
                  include: { inventoryItem: true },
                },
              },
            },
          },
        },
      },
    })

    if (!order) throw NotFound('Order tidak ditemukan');
    if (order.status !== 'CONFIRMED') throw BadRequest('Order harus berstatus CONFIRMED untuk deduksi stok');

    // Check if already deducted
    const existingLogs = await prisma.inventoryLog.findFirst({
      where: { order_id: orderId, type: 'deduction' },
    });
    if (existingLogs) throw Conflict('Stok sudah pernah dideduksi untuk order ini');

    await prisma.$transaction(async (tx) => {
      for (const orderItem of order.items) {
        const product = orderItem.product;
        if (!product.bom?.length) continue;

        for (const bom of product.bom) {
          const inventoryItem = bom.inventoryItem;
          const needed = Number(bom.quantity) * orderItem.qty;
          const current = Number(inventoryItem.quantity);

          if (current < needed) {
            throw Conflict(`Stok ${inventoryItem.name} tidak mencukupi (tersedia: ${current}, butuh: ${needed})`);
          }

          const newQty = current - needed;

          await tx.inventoryItem.update({
            where: { id: inventoryItem.id },
            data: { quantity: newQty },
          });

          await tx.inventoryLog.create({
            data: {
              outlet_id: order.outlet_id ?? inventoryItem.outlet_id,
              inventory_item_id: inventoryItem.id,
              order_id: order.id,
              type: 'deduction',
              quantity: needed,
              unit: inventoryItem.unit,
              note: `Deduksi untuk order ${order.order_number} (${orderItem.qty}x ${product.name})`,
            },
          });
        }
      }
    });

    return { message: 'Stok berhasil dideduksi', order_id: orderId };
  }

  /** GET /api/v1/inventory/low-stock — item dengan stok <= min_stock. */
  async getLowStock(outletId?: string) {
    const items = await prisma.inventoryItem.findMany({
      where: outletId ? { outlet_id: outletId } : {},
      orderBy: { quantity: 'asc' },
    });
    return items.filter(item => Number(item.quantity) <= Number(item.min_stock));
  }
}