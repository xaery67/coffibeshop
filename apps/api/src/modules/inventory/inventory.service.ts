import { prisma } from '../../config/prisma.js';
import { BadRequest, NotFound } from '../../lib/http.js';

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

  /** GET /api/v1/inventory/low-stock — item dengan stok <= min_stock. */
  async getLowStock(outletId?: string) {
    const items = await prisma.inventoryItem.findMany({
      where: outletId ? { outlet_id: outletId } : {},
      orderBy: { quantity: 'asc' },
    });
    return items.filter((item) => Number(item.quantity) <= Number(item.min_stock));
  }

  /**
   * GET /api/v1/inventory/alerts — low-stock alerts (bentuk `LowStockAlertDTO`,
   * kontrak dashboard admin §2.5). Deduksi stok otomatis dilakukan trigger PG
   * `trg_orders_deduct_inventory` saat order CONFIRMED (AC #9) — tidak ada lagi
   * jalur deduksi manual.
   */
  async getAlerts(outletId?: string) {
    const items = await prisma.inventoryItem.findMany({
      where: outletId ? { outlet_id: outletId } : {},
      orderBy: { quantity: 'asc' },
    });
    return items
      .filter((item) => Number(item.quantity) <= Number(item.min_stock))
      .map((item) => ({
        item_id: item.id,
        name: item.name,
        unit: item.unit,
        stock_quantity: Number(item.quantity),
        reorder_point: Number(item.min_stock),
      }));
  }
}
