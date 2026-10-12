import { prisma } from '../../config/prisma.js';
import { BadRequest } from '../../lib/http.js';

export class ReportingService {
  /** GET /api/v1/admin/reports/daily — laporan harian. */
  async getDailyReport(outletId?: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const where: any = {
      created_at: { gte: targetDate, lt: nextDate },
      status: { in: ['PAID', 'CONFIRMED', 'BEING_PREPARED', 'READY', 'COMPLETED'] },
    };
    if (outletId) where.outlet_id = outletId;

    const [orders, orderItems, payments] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { items: true, payments: true },
        orderBy: { created_at: 'asc' },
      }),
      prisma.orderItem.findMany({
        where: { order: where },
        include: { product: { select: { id: true, name: true, category_id: true } } },
      }),
      prisma.payment.findMany({
        where: { order: where, status: 'paid' },
      }),
    ]);

    // Aggregations
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalItems = orderItems.reduce((sum, i) => sum + i.qty, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // By fulfillment type
    const byFulfillment = orders.reduce((acc, o) => {
      acc[o.fulfillment_type] = (acc[o.fulfillment_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // By payment method
    const byPayment = payments.reduce((acc, p) => {
      acc[p.method] = (acc[p.method] || 0) + Number(p.amount);
      return acc;
    }, {} as Record<string, number>);

    // Top products
    const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const item of orderItems) {
      const key = item.product_id;
      if (!productSales[key]) {
        productSales[key] = { name: item.product?.name || 'Unknown', qty: 0, revenue: 0 };
      }
      productSales[key].qty += item.qty;
      productSales[key].revenue += Number(item.line_total);
    }
    const topProducts = Object.entries(productSales)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 10)
      .map(([id, v]) => ({ product_id: id, ...v }));

    // Hourly distribution
    const hourly: Record<number, number> = {};
    for (const order of orders) {
      const hour = new Date(order.created_at).getHours();
      hourly[hour] = (hourly[hour] || 0) + 1;
    }

    return {
      date: targetDate.toISOString().split('T')[0],
      summary: {
        total_orders: totalOrders,
        total_revenue: totalRevenue,
        total_items: totalItems,
        avg_order_value: Math.round(avgOrderValue),
      },
      by_fulfillment: byFulfillment,
      by_payment_method: byPayment,
      top_products: topProducts,
      hourly_distribution: hourly,
      outlet_id: outletId ?? null,
    };
  }

  /** GET /api/v1/admin/reports/monthly — laporan bulanan. */
  async getMonthlyReport(outletId?: string, year?: number, month?: number) {
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month ?? (now.getMonth() + 1);

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 1);

    const where: any = {
      created_at: { gte: startDate, lt: endDate },
      status: { in: ['PAID', 'CONFIRMED', 'BEING_PREPARED', 'READY', 'COMPLETED'] },
    };
    if (outletId) where.outlet_id = outletId;

    const [orders, orderItems, payments] = await Promise.all([
      prisma.order.findMany({ where, include: { items: true, payments: true } }),
      prisma.orderItem.findMany({ where: { order: where }, include: { product: { select: { id: true, name: true, category_id: true } } } }),
      prisma.payment.findMany({ where: { order: where, status: 'paid' } }),
    ]);

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalItems = orderItems.reduce((sum, i) => sum + i.qty, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Daily breakdown
    const dailyRevenue: Record<string, number> = {};
    for (const order of orders) {
      const day = new Date(order.created_at).toISOString().split('T')[0];
      dailyRevenue[day] = (dailyRevenue[day] || 0) + Number(order.total);
    }

    // By payment method
    const byPayment = payments.reduce((acc, p) => {
      acc[p.method] = (acc[p.method] || 0) + Number(p.amount);
      return acc;
    }, {} as Record<string, number>);

    // Top products
    const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const item of orderItems) {
      const key = item.product_id;
      if (!productSales[key]) {
        productSales[key] = { name: item.product?.name || 'Unknown', qty: 0, revenue: 0 };
      }
      productSales[key].qty += item.qty;
      productSales[key].revenue += Number(item.line_total);
    }
    const topProducts = Object.entries(productSales)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 20)
      .map(([id, v]) => ({ product_id: id, ...v }));

    return {
      year: targetYear,
      month: targetMonth,
      summary: {
        total_orders: totalOrders,
        total_revenue: totalRevenue,
        total_items: totalItems,
        avg_order_value: Math.round(avgOrderValue),
      },
      daily_revenue: dailyRevenue,
      by_payment_method: byPayment,
      top_products: topProducts,
      outlet_id: outletId ?? null,
    };
  }

  /** GET /api/v1/admin/reports/export?format=csv — export CSV untuk akuntansi. */
  async exportReport(
    format: 'csv' | 'json',
    type: 'daily' | 'monthly',
    outletId?: string,
    date?: string,
    year?: number,
    month?: number
  ): Promise<{ content: string; filename: string; mimeType: string }> {
    let data: any;
    let filename: string;

    if (type === 'daily') {
      data = await this.getDailyReport(outletId, date);
      filename = `daily-report-${data.date}.${format}`;
    } else {
      const targetYear = year ?? new Date().getFullYear();
      const targetMonth = month ?? new Date().getMonth() + 1;
      data = await this.getMonthlyReport(outletId, targetYear, targetMonth);
      filename = `monthly-report-${targetYear}-${String(targetMonth).padStart(2, '0')}.${format}`;
    }

    if (format === 'csv') {
      return {
        content: this.toCsv(data),
        filename,
        mimeType: 'text/csv',
      };
    }

    return {
      content: JSON.stringify(data, null, 2),
      filename: filename.replace('.csv', '.json'),
      mimeType: 'application/json',
    };
  }

  private toCsv(data: any): string {
    const lines: string[] = [];

    // Summary section
    lines.push('LAPORAN PENJUALAN');
    lines.push(`Tanggal,${data.date || `${data.year}-${String(data.month).padStart(2, '0')}`}`);
    lines.push(`Outlet,${data.outlet_id || 'SEMUA'}`);
    lines.push('');
    lines.push('RINGKASAN');
    lines.push(`Total Order,${data.summary.total_orders}`);
    lines.push(`Total Revenue,${data.summary.total_revenue}`);
    lines.push(`Total Items,${data.summary.total_items}`);
    lines.push(`Avg Order Value,${data.summary.avg_order_value}`);
    lines.push('');

    // By fulfillment
    if (data.by_fulfillment) {
      lines.push('BY FULFILLMENT TYPE');
      lines.push('Type,Count');
      for (const [k, v] of Object.entries(data.by_fulfillment)) {
        lines.push(`${k},${v}`);
      }
      lines.push('');
    }

    // By payment
    if (data.by_payment_method) {
      lines.push('BY PAYMENT METHOD');
      lines.push('Method,Amount');
      for (const [k, v] of Object.entries(data.by_payment_method)) {
        lines.push(`${k},${v}`);
      }
      lines.push('');
    }

    // Top products
    if (data.top_products) {
      lines.push('TOP PRODUCTS');
      lines.push('Product ID,Name,Quantity,Revenue');
      for (const p of data.top_products) {
        lines.push(`${p.product_id},${p.name},${p.qty},${p.revenue}`);
      }
      lines.push('');
    }

    // Hourly (daily) or Daily (monthly)
    if (data.hourly_distribution) {
      lines.push('HOURLY DISTRIBUTION');
      lines.push('Hour,Orders');
      for (let h = 0; h < 24; h++) {
        lines.push(`${h}:00,${data.hourly_distribution[h] || 0}`);
      }
      lines.push('');
    }

    if (data.daily_revenue) {
      lines.push('DAILY REVENUE');
      lines.push('Date,Revenue');
      for (const [d, v] of Object.entries(data.daily_revenue)) {
        lines.push(`${d},${v}`);
      }
    }

    return lines.join('\n');
  }
}