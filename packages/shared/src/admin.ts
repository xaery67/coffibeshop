import { z } from 'zod';
import { OrderStatus } from './enums.js';

/**
 * Kontrak Admin (Sprint 4) — sumber kebenaran `docs/PRD-BACKEND.md` §2.3 / §2.5 / §2.7.
 *
 * Catatan: backend admin (queue WS, reporting) belum merged saat sprint ini; tipe di
 * sini adalah **kontrak** yang dipakai `apps/web` untuk mem-*mock* data. Saat endpoint
 * asli mendarat, implementasi `lib/admin.ts` cukup diganti tanpa mengubah UI/test.
 */

// ── Order Queue (PRD-BACKEND §2.3) ──

export interface QueueOrderItemDTO {
  id: string;
  product_name: string;
  variant_name?: string | null;
  /** Label opsi terpilih, sudah diformat (mis. ["Extra Shot", "Oat Milk"]). */
  options?: string[];
  qty: number;
  notes?: string | null;
  unit_price: number;
  line_total: number;
}

/** Satu tiket di antrian outlet (GET /orders/queue). */
export interface QueueOrderDTO {
  id: string;
  order_number: string;
  status: OrderStatus;
  outlet_id: string | null;
  fulfillment_type: string;
  customer_name?: string | null;
  total: number;
  created_at: string;
  estimated_ready_time?: string | null;
  items: QueueOrderItemDTO[];
}

/** PUT /orders/{id}/status — payload. */
export const OrderStatusUpdateInput = z.object({
  status: z.nativeEnum(OrderStatus),
  note: z.string().max(200).optional(),
});
export type OrderStatusUpdateInput = z.infer<typeof OrderStatusUpdateInput>;

// ── Reporting (PRD-BACKEND §2.7) ──

export interface TopProductDTO {
  product_id: string;
  name: string;
  qty_sold: number;
  revenue: number;
}

export interface DailySalesRowDTO {
  date: string;
  orders: number;
  gross_revenue: number;
  net_revenue: number;
  tax: number;
  discount: number;
  avg_ticket: number;
}

export interface HourlySalesDTO {
  hour: number;
  orders: number;
  revenue: number;
}

/** GET /reports/daily?outlet_id=&date= */
export interface DailyReportDTO {
  outlet_id: string;
  date: string;
  orders: number;
  gross_revenue: number;
  net_revenue: number;
  tax_total: number;
  discount_total: number;
  avg_ticket: number;
  items_sold: number;
  by_hour: HourlySalesDTO[];
  top_products: TopProductDTO[];
}

/** GET /reports/monthly?outlet_id=&month=&year= */
export interface MonthlyReportDTO {
  outlet_id: string;
  month: number;
  year: number;
  days: DailySalesRowDTO[];
  totals: {
    orders: number;
    gross_revenue: number;
    net_revenue: number;
    avg_ticket: number;
  };
}

/** GET /reports/top-products?outlet_id=&period=7d|30d */
export type ReportPeriod = '7d' | '30d';
export interface TopProductsReportDTO {
  outlet_id: string;
  period: ReportPeriod;
  products: TopProductDTO[];
}

/** GET /inventory/alerts?outlet_id= — kartu low-stock dashboard (PRD-BACKEND §2.5). */
export interface LowStockAlertDTO {
  item_id: string;
  name: string;
  unit: string;
  stock_quantity: number;
  reorder_point: number;
}

/** KPI gabungan untuk DashboardPage (turunan §2.7 + §2.5). */
export interface DashboardKpiDTO {
  outlet_id: string;
  date: string;
  revenue_today: number;
  orders_today: number;
  avg_ticket: number;
  low_stock_count: number;
  revenue_delta_pct?: number;
  orders_delta_pct?: number;
}
