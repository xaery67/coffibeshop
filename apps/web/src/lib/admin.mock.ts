import type {
  DailyReportDTO,
  DashboardKpiDTO,
  LowStockAlertDTO,
  MonthlyReportDTO,
  QueueOrderDTO,
  ReportPeriod,
  TopProductsReportDTO,
} from '@coffibeshop/shared';
import { OrderStatus } from '@coffibeshop/shared';

/**
 * Data mock Admin (Sprint 4) — dipakai selama endpoint backend belum merged.
 *
 * Semua bentuk mengikuti tipe `@coffibeshop/shared/admin.ts` (kontrak PRD-BACKEND
 * §2.3/§2.5/§2.7). Deterministik (tanpa Math.random) agar test stabil.
 *
 * `VITE_ADMIN_MOCK` (default: aktif bila endpoint backend belum ada) dapat
 * dimatikan begitu backend mendarat → `lib/admin.ts` langsung memakai HTTP nyata.
 */

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/**
 * Mock AKTIF secara default (endpoint admin belum merged di backend).
 * Matikan dengan `VITE_ADMIN_MOCK=false` begitu backend mendarat — tanpa
 * mengubah UI maupun test.
 */
export const MOCK: boolean = env.VITE_ADMIN_MOCK !== 'false';

/** Simulasi latensi jaringan (bisa dinolkan di test lewat `VITE_ADMIN_MOCK_LATENCY_MS=0`). */
const LATENCY = Number(env.VITE_ADMIN_MOCK_LATENCY_MS ?? 150);

export function mockDelay<T>(value: T, ms: number = LATENCY): Promise<T> {
  if (ms <= 0) return Promise.resolve(value);
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Hash string → bilangan stabil (untuk variasi deterministik per outlet/hari). */
function seed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Order queue ──

const MOCK_PRODUCTS = [
  { name: 'Latte', price: 32000 },
  { name: 'Cappuccino', price: 30000 },
  { name: 'Americano', price: 25000 },
  { name: 'Matcha Latte', price: 35000 },
  { name: 'Croissant', price: 22000 },
  { name: 'Es Kopi Susu', price: 24000 },
];

const MOCK_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.CONFIRMED,
  OrderStatus.BEING_PREPARED,
  OrderStatus.READY,
];

/** Antrian contoh: 6 tiket tersebar di kolom, deterministik per outlet. */
export function mockQueue(outletId: string): QueueOrderDTO[] {
  const s = seed(outletId);
  return Array.from({ length: 6 }).map((_, i) => {
    const p1 = MOCK_PRODUCTS[(s + i) % MOCK_PRODUCTS.length];
    const p2 = MOCK_PRODUCTS[(s + i + 3) % MOCK_PRODUCTS.length];
    const qty1 = ((s + i) % 3) + 1;
    const qty2 = ((s + i + 1) % 2) + 1;
    const status = MOCK_STATUSES[i % MOCK_STATUSES.length];
    const total = p1.price * qty1 + p2.price * qty2;
    const created = new Date(Date.now() - (i + 1) * 3 * 60_000);
    return {
      id: `q-${outletId.slice(0, 6)}-${i + 1}`,
      order_number: `ORD-${String(1001 + i)}`,
      status,
      outlet_id: outletId,
      fulfillment_type: i % 3 === 0 ? 'delivery' : 'pickup',
      customer_name: ['Andi', 'Budi', 'Citra', 'Dewi', 'Eka', 'Fajar'][i % 6],
      total,
      created_at: created.toISOString(),
      estimated_ready_time: new Date(created.getTime() + 15 * 60_000).toISOString(),
      items: [
        {
          id: `qi-${i}-1`,
          product_name: p1.name,
          variant_name: 'Large',
          options: i % 2 === 0 ? ['Extra Shot'] : [],
          qty: qty1,
          notes: i % 4 === 0 ? 'Tanpa gula' : null,
          unit_price: p1.price,
          line_total: p1.price * qty1,
        },
        {
          id: `qi-${i}-2`,
          product_name: p2.name,
          variant_name: null,
          options: [],
          qty: qty2,
          notes: null,
          unit_price: p2.price,
          line_total: p2.price * qty2,
        },
      ],
    };
  });
}

// ── Reporting ──

export function mockKpi(outletId: string, date?: string): DashboardKpiDTO {
  const s = seed(outletId + (date ?? ''));
  const revenue = 3_200_000 + (s % 2_500_000);
  const orders = 40 + (s % 90);
  return {
    outlet_id: outletId,
    date: date ?? isoDate(new Date()),
    revenue_today: revenue,
    orders_today: orders,
    avg_ticket: Math.round(revenue / orders),
    low_stock_count: 1 + (s % 4),
    revenue_delta_pct: ((s % 21) - 8) + 0.5,
    orders_delta_pct: ((s % 17) - 6) + 0.25,
  };
}

export function mockDailyReport(outletId: string, date: string): DailyReportDTO {
  const s = seed(outletId + date);
  const orders = 45 + (s % 80);
  const gross = 2_800_000 + (s % 2_000_000);
  const tax = Math.round(gross * 0.11);
  const net = gross - tax;
  const byHour = Array.from({ length: 14 }).map((_, i) => {
    const hour = 8 + i;
    const hOrders = Math.max(0, Math.round((Math.sin(i / 2) + 1) * 5) + (s % 3));
    return { hour, orders: hOrders, revenue: hOrders * 28_000 };
  });
  return {
    outlet_id: outletId,
    date,
    orders,
    gross_revenue: gross,
    net_revenue: net,
    tax_total: tax,
    discount_total: Math.round(gross * 0.03),
    avg_ticket: Math.round(gross / orders),
    items_sold: orders * 2 + (s % 20),
    by_hour: byHour,
    top_products: mockTopProducts(outletId, '7d').products.slice(0, 5),
  };
}

export function mockMonthlyReport(outletId: string, month: number, year: number): MonthlyReportDTO {
  const daysInMonth = new Date(year, month, 0).getDate();
  const s = seed(`${outletId}-${year}-${month}`);
  const days = Array.from({ length: daysInMonth }).map((_, i) => {
    const day = i + 1;
    const orders = 35 + ((s + day * 7) % 90);
    const gross = orders * (26_000 + ((s + day) % 6_000));
    const tax = Math.round(gross * 0.11);
    return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      orders,
      gross_revenue: gross,
      net_revenue: gross - tax,
      tax,
      discount: Math.round(gross * 0.03),
      avg_ticket: Math.round(gross / orders),
    };
  });
  const totals = days.reduce(
    (acc, d) => ({
      orders: acc.orders + d.orders,
      gross_revenue: acc.gross_revenue + d.gross_revenue,
      net_revenue: acc.net_revenue + d.net_revenue,
      avg_ticket: 0,
    }),
    { orders: 0, gross_revenue: 0, net_revenue: 0, avg_ticket: 0 },
  );
  totals.avg_ticket = Math.round(totals.gross_revenue / Math.max(1, totals.orders));
  return { outlet_id: outletId, month, year, days, totals };
}

export function mockTopProducts(outletId: string, period: ReportPeriod): TopProductsReportDTO {
  const s = seed(outletId + period);
  const products = MOCK_PRODUCTS.map((p, i) => {
    const qty = 40 + ((s + i * 13) % 160);
    return {
      product_id: `p-${i + 1}`,
      name: p.name,
      qty_sold: qty,
      revenue: qty * p.price,
    };
  }).sort((a, b) => b.revenue - a.revenue);
  return { outlet_id: outletId, period, products };
}

export function mockLowStock(outletId: string): LowStockAlertDTO[] {
  const s = seed(outletId + 'stock');
  const items = [
    { name: 'Biji Kopi Arabika', unit: 'gram' },
    { name: 'Susu Segar', unit: 'ml' },
    { name: 'Gula Aren', unit: 'gram' },
    { name: 'Matcha Powder', unit: 'gram' },
  ];
  return items.map((it, i) => ({
    item_id: `inv-${i + 1}`,
    name: it.name,
    unit: it.unit,
    stock_quantity: 20 + ((s + i * 5) % 60),
    reorder_point: 100 + ((s + i * 11) % 50),
  }));
}
