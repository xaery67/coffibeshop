import type { OrderStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

/**
 * Reporting service (F-014, PRD-BACKEND §2.7).
 * Kontrak bentuk respons = `packages/shared/src/admin.ts` (dipakai `apps/web`):
 *   GET /reports/daily        → DailyReportDTO
 *   GET /reports/monthly      → MonthlyReportDTO
 *   GET /reports/top-products → TopProductsReportDTO
 *   GET /reports/kpi          → DashboardKpiDTO
 *   GET /reports/export/accounting → CSV
 */

/** Status order yang dihitung sebagai penjualan (bukan PENDING/CANCELLED). */
const REVENUE_STATUSES: OrderStatus[] = ['PAID', 'CONFIRMED', 'BEING_PREPARED', 'READY', 'COMPLETED'];

const n = (v: unknown): number => Number(v ?? 0);

/**
 * Format tanggal LOKAL server (YYYY-MM-DD).
 * PENTING: jangan pakai `toISOString().slice(0,10)` untuk tanggal kalender —
 * itu mengonversi ke UTC dan menggeser tanggal (mis. WIB 2026-10-13 00:00 →
 * UTC 2026-10-12 17:00 → tanggal "2026-10-12"). Bug ini pernah lolos dan
 * tertangkap oleh test TC-F014.
 */
const fmtLocalDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export class ReportingService {
  /** Agregasi satu hari untuk satu outlet (atau semua outlet bila null). */
  async getDailyReport(outletId?: string | null, date?: string) {
    const target = date ? new Date(`${date}T00:00:00`) : new Date();
    target.setHours(0, 0, 0, 0);
    const next = new Date(target);
    next.setDate(next.getDate() + 1);

    const where = {
      created_at: { gte: target, lt: next },
      status: { in: REVENUE_STATUSES },
      ...(outletId ? { outlet_id: outletId } : {}),
    } as never;

    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        total: true,
        tax: true,
        discount: true,
        points_discount: true,
        created_at: true,
        items: { select: { product_id: true, qty: true, line_total: true, product: { select: { name: true } } } },
      },
    });

    const gross = orders.reduce((s, o) => s + n(o.total), 0);
    const tax = orders.reduce((s, o) => s + n(o.tax), 0);
    const discount = orders.reduce((s, o) => s + n(o.discount) + n(o.points_discount), 0);
    const itemsSold = orders.reduce((s, o) => s + o.items.reduce((x, i) => x + i.qty, 0), 0);
    const count = orders.length;

    // Distribusi per jam
    const byHourMap = new Map<number, { orders: number; revenue: number }>();
    for (let h = 0; h < 24; h += 1) byHourMap.set(h, { orders: 0, revenue: 0 });
    for (const o of orders) {
      const h = new Date(o.created_at).getHours();
      const cur = byHourMap.get(h)!;
      cur.orders += 1;
      cur.revenue += n(o.total);
    }
    const byHour = [...byHourMap.entries()]
      .map(([hour, v]) => ({ hour, orders: v.orders, revenue: Math.round(v.revenue) }))
      .filter((r) => r.orders > 0 || r.hour % 2 === 0);

    // Top produk hari itu
    const productAgg = new Map<string, { name: string; qty_sold: number; revenue: number }>();
    for (const o of orders) {
      for (const i of o.items) {
        const cur = productAgg.get(i.product_id) ?? { name: i.product?.name ?? 'Produk', qty_sold: 0, revenue: 0 };
        cur.qty_sold += i.qty;
        cur.revenue += n(i.line_total);
        productAgg.set(i.product_id, cur);
      }
    }
    const topProducts = [...productAgg.entries()]
      .map(([product_id, v]) => ({ product_id, ...v, revenue: Math.round(v.revenue) }))
      .sort((a, b) => b.qty_sold - a.qty_sold)
      .slice(0, 10);

    return {
      outlet_id: outletId ?? '',
      date: fmtLocalDate(target),
      orders: count,
      gross_revenue: Math.round(gross),
      net_revenue: Math.round(gross - tax),
      tax_total: Math.round(tax),
      discount_total: Math.round(discount),
      avg_ticket: count ? Math.round(gross / count) : 0,
      items_sold: itemsSold,
      by_hour: byHour,
      top_products: topProducts,
    };
  }

  /** Agregasi bulanan (per hari) untuk satu outlet. */
  async getMonthlyReport(outletId?: string | null, year?: number, month?: number) {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;

    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);

    const orders = await prisma.order.findMany({
      where: {
        created_at: { gte: start, lt: end },
        status: { in: REVENUE_STATUSES },
        ...(outletId ? { outlet_id: outletId } : {}),
      } as never,
      select: { total: true, tax: true, discount: true, points_discount: true, created_at: true },
    });

    const daysInMonth = new Date(y, m, 0).getDate();
    const perDay = new Map<string, { orders: number; gross: number; tax: number; discount: number }>();
    for (let d = 1; d <= daysInMonth; d += 1) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      perDay.set(key, { orders: 0, gross: 0, tax: 0, discount: 0 });
    }
    for (const o of orders) {
      const key = fmtLocalDate(new Date(o.created_at));
      const cur = perDay.get(key);
      if (!cur) continue;
      cur.orders += 1;
      cur.gross += n(o.total);
      cur.tax += n(o.tax);
      cur.discount += n(o.discount) + n(o.points_discount);
    }

    const days = [...perDay.entries()].map(([date, v]) => ({
      date,
      orders: v.orders,
      gross_revenue: Math.round(v.gross),
      net_revenue: Math.round(v.gross - v.tax),
      tax: Math.round(v.tax),
      discount: Math.round(v.discount),
      avg_ticket: v.orders ? Math.round(v.gross / v.orders) : 0,
    }));

    const totalOrders = days.reduce((s, d) => s + d.orders, 0);
    const totalGross = days.reduce((s, d) => s + d.gross_revenue, 0);
    const totalNet = days.reduce((s, d) => s + d.net_revenue, 0);

    return {
      outlet_id: outletId ?? '',
      month: m,
      year: y,
      days,
      totals: {
        orders: totalOrders,
        gross_revenue: totalGross,
        net_revenue: totalNet,
        avg_ticket: totalOrders ? Math.round(totalGross / totalOrders) : 0,
      },
    };
  }

  /** Produk terlaris dalam periode `7d`/`30d`. */
  async getTopProducts(outletId?: string | null, period: '7d' | '30d' = '7d') {
    const days = period === '30d' ? 30 : 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          created_at: { gte: since },
          status: { in: REVENUE_STATUSES },
          ...(outletId ? { outlet_id: outletId } : {}),
        },
      },
      select: { product_id: true, qty: true, line_total: true, product: { select: { name: true } } },
    });

    const agg = new Map<string, { name: string; qty_sold: number; revenue: number }>();
    for (const i of items) {
      const cur = agg.get(i.product_id) ?? { name: i.product?.name ?? 'Produk', qty_sold: 0, revenue: 0 };
      cur.qty_sold += i.qty;
      cur.revenue += n(i.line_total);
      agg.set(i.product_id, cur);
    }

    return {
      outlet_id: outletId ?? '',
      period,
      products: [...agg.entries()]
        .map(([product_id, v]) => ({ product_id, ...v, revenue: Math.round(v.revenue) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 20),
    };
  }

  /** KPI dashboard: hari ini vs kemarin + jumlah item low-stock. */
  async getKpi(outletId?: string | null, date?: string) {
    const target = date ? new Date(`${date}T00:00:00`) : new Date();
    target.setHours(0, 0, 0, 0);
    const prev = new Date(target);
    prev.setDate(prev.getDate() - 1);
    const next = new Date(target);
    next.setDate(next.getDate() + 1);

    const baseWhere = (from: Date, to: Date) => ({
      created_at: { gte: from, lt: to },
      status: { in: REVENUE_STATUSES },
      ...(outletId ? { outlet_id: outletId } : {}),
    });

    const [todayOrders, prevOrders] = await Promise.all([
      prisma.order.findMany({ where: baseWhere(target, next) as never, select: { total: true } }),
      prisma.order.findMany({ where: baseWhere(prev, target) as never, select: { total: true } }),
    ]);

    const revenueToday = todayOrders.reduce((s, o) => s + n(o.total), 0);
    const revenuePrev = prevOrders.reduce((s, o) => s + n(o.total), 0);

    // Low-stock = quantity <= min_stock (banding 2 kolom — filter di JS).
    const stockRows = await prisma.inventoryItem.findMany({
      where: outletId ? { outlet_id: outletId } : {},
      select: { quantity: true, min_stock: true },
    });
    const lowStockCount = stockRows.filter((s) => Number(s.quantity) <= Number(s.min_stock)).length;

    const pct = (cur: number, before: number): number | null =>
      before > 0 ? Math.round(((cur - before) / before) * 1000) / 10 : null;

    return {
      outlet_id: outletId ?? '',
      date: fmtLocalDate(target),
      revenue_today: Math.round(revenueToday),
      orders_today: todayOrders.length,
      avg_ticket: todayOrders.length ? Math.round(revenueToday / todayOrders.length) : 0,
      low_stock_count: lowStockCount,
      revenue_delta_pct: pct(revenueToday, revenuePrev),
      orders_delta_pct: pct(todayOrders.length, prevOrders.length),
    };
  }

  /** Export CSV buku besar sederhana (PRD §2.7 `/reports/export/accounting`). */
  async exportAccountingCsv(outletId?: string | null, year?: number, month?: number): Promise<{ filename: string; content: string }> {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);

    const orders = await prisma.order.findMany({
      where: {
        created_at: { gte: start, lt: end },
        status: { in: REVENUE_STATUSES },
        ...(outletId ? { outlet_id: outletId } : {}),
      } as never,
      select: {
        order_number: true,
        created_at: true,
        total: true,
        subtotal: true,
        tax: true,
        discount: true,
        points_discount: true,
        fulfillment_type: true,
        payment_method: true,
        outlet_id: true,
      },
      orderBy: { created_at: 'asc' },
    });

    const header = 'order_number,date,outlet_id,fulfillment,payment_method,subtotal,discount,points_discount,tax,total';
    const rows = orders.map((o) =>
      [
        o.order_number,
        new Date(o.created_at).toISOString(),
        o.outlet_id ?? '',
        o.fulfillment_type,
        o.payment_method ?? '',
        n(o.subtotal).toFixed(2),
        n(o.discount).toFixed(2),
        n(o.points_discount).toFixed(2),
        n(o.tax).toFixed(2),
        n(o.total).toFixed(2),
      ].join(','),
    );

    return {
      filename: `accounting-${y}-${String(m).padStart(2, '0')}.csv`,
      content: [header, ...rows].join('\n'),
    };
  }
}
