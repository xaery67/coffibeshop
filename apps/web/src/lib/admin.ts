import type {
  DailyReportDTO,
  DashboardKpiDTO,
  LowStockAlertDTO,
  MonthlyReportDTO,
  ProductDTO,
  QueueOrderDTO,
  ReportPeriod,
  TopProductsReportDTO,
} from '@coffibeshop/shared';
import { apiFetch, apiFetchBlob } from './api.js';
import { toNumber } from './reporting.js';

/**
 * Klien Admin (Sprint 4) — **API nyata** (issue #68).
 *
 * Kontrak: `docs/PRD-BACKEND.md` §2.3 (order queue), §2.5 (inventory alerts),
 * §2.7 (reporting), §2.2 (katalog admin). Seluruh endpoint sudah tersedia di
 * backend (diverifikasi live); tidak ada lagi cabang mock di sini.
 *
 * Catatan #68: sebelumnya modul ini bercabang ke `admin.mock.ts` saat
 * `VITE_ADMIN_MOCK` aktif (default), sehingga tombol hanya memunculkan toast
 * tanpa request nyata dan dashboard menampilkan angka palsu. Cabang mock
 * dihapus total — satu-satunya jalur data kini HTTP nyata.
 */

/** GET /orders/queue?outlet_id=&status= — antrian staff (PRD-BACKEND §2.3). */
export function getOrderQueue(outletId: string, statuses?: string[]): Promise<QueueOrderDTO[]> {
  const params = new URLSearchParams({ outlet_id: outletId });
  if (statuses?.length) params.set('status', statuses.join(','));
  return apiFetch<unknown>(`/orders/queue?${params.toString()}`).then((rows) =>
    Array.isArray(rows) ? rows.map((r) => normalizeQueueOrder(r as RawQueueOrder)) : [],
  );
}

/**
 * Bentuk mentah dari backend (Prisma): harga = Decimal → **string** ("59940"),
 * nama produk bersarang di `product.name`, tanpa `product_name`/`variant_name`.
 */
interface RawQueueOrder {
  id: string;
  order_number: string;
  status: string;
  outlet_id: string | null;
  fulfillment_type: string;
  customer_name?: string | null;
  total?: number | string;
  created_at: string;
  estimated_ready_time?: string | null;
  items?: {
    id: string;
    product_id?: string;
    qty: number;
    unit_price?: number | string;
    line_total?: number | string;
    notes?: string | null;
    options?: (string | { name?: string })[];
    product?: { name?: string } | null;
    product_name?: string;
    variant_name?: string | null;
  }[];
}

/** Normalisasi payload queue backend → `QueueOrderDTO` (angka, nama produk). */
export function normalizeQueueOrder(o: RawQueueOrder): QueueOrderDTO {
  return {
    id: o.id,
    order_number: o.order_number,
    status: o.status as QueueOrderDTO['status'],
    outlet_id: o.outlet_id ?? null,
    fulfillment_type: o.fulfillment_type,
    customer_name: o.customer_name ?? null,
    total: toNumber(o.total),
    created_at: o.created_at,
    estimated_ready_time: o.estimated_ready_time ?? null,
    items: (o.items ?? []).map((it) => ({
      id: it.id,
      product_name: it.product_name ?? it.product?.name ?? 'Produk',
      variant_name: it.variant_name ?? null,
      options: (it.options ?? []).map((x) => (typeof x === 'string' ? x : (x?.name ?? ''))).filter(Boolean),
      qty: it.qty,
      notes: it.notes ?? null,
      unit_price: toNumber(it.unit_price),
      line_total: toNumber(it.line_total),
    })),
  };
}

/** PUT /orders/{id}/status — update status (state machine divalidasi backend). */
export function updateOrderStatus(
  orderId: string,
  status: string,
  note?: string,
): Promise<QueueOrderDTO | { id: string; status: string }> {
  return apiFetch(`/orders/${orderId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, ...(note ? { note } : {}) }),
  });
}

/**
 * POST /orders/{id}/print-ticket — kitchen ticket **PDF** (PRD-BACKEND §2.3, UC18).
 *
 * Respons biner (`application/pdf`) → diunduh/dibuka di tab baru. Endpoint ini
 * diimplementasikan oleh PR-B (`feat/print-ticket`); FE sudah menyiapkan jalur
 * unduhan sesuai kontrak (blob → object URL), sehingga tidak perlu perubahan FE lagi.
 */
export async function printTicket(orderId: string): Promise<void> {
  const blob = await apiFetchBlob(`/orders/${orderId}/print-ticket`, { method: 'POST' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.download = `ticket-${orderId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** GET /reports/kpi?outlet_id=&date= — KPI dashboard (PRD-BACKEND §2.7). */
export function getDashboardKpi(outletId: string, date?: string): Promise<DashboardKpiDTO> {
  const params = new URLSearchParams({ outlet_id: outletId });
  if (date) params.set('date', date);
  return apiFetch<DashboardKpiDTO>(`/reports/kpi?${params.toString()}`);
}

/** GET /reports/daily?outlet_id=&date= */
export function getDailyReport(outletId: string, date: string): Promise<DailyReportDTO> {
  const params = new URLSearchParams({ outlet_id: outletId, date });
  return apiFetch<DailyReportDTO>(`/reports/daily?${params.toString()}`);
}

/** GET /reports/monthly?outlet_id=&month=&year= */
export function getMonthlyReport(outletId: string, month: number, year: number): Promise<MonthlyReportDTO> {
  const params = new URLSearchParams({ outlet_id: outletId, month: String(month), year: String(year) });
  return apiFetch<MonthlyReportDTO>(`/reports/monthly?${params.toString()}`);
}

/** GET /reports/top-products?outlet_id=&period=7d|30d */
export function getTopProducts(outletId: string, period: ReportPeriod = '7d'): Promise<TopProductsReportDTO> {
  const params = new URLSearchParams({ outlet_id: outletId, period });
  return apiFetch<TopProductsReportDTO>(`/reports/top-products?${params.toString()}`);
}

/** GET /inventory/alerts?outlet_id= — low-stock (PRD-BACKEND §2.5). */
export function getLowStockAlerts(outletId: string): Promise<LowStockAlertDTO[]> {
  return apiFetch<LowStockAlertDTO[]>(`/inventory/alerts?outlet_id=${encodeURIComponent(outletId)}`);
}

// ── Manajemen menu (katalog admin, PRD-BACKEND §2.2 — SUDAH ada) ──

/** GET /catalog/products?outlet_id=&q=&category_id=&available=&page=&limit= */
export function listMenuProducts(params: {
  outlet_id: string;
  q?: string;
  category_id?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: ProductDTO[]; meta: { page: number; limit: number; total: number; total_pages: number } }> {
  const search = new URLSearchParams({ outlet_id: params.outlet_id });
  if (params.q) search.set('q', params.q);
  if (params.category_id) search.set('category_id', params.category_id);
  search.set('page', String(params.page ?? 1));
  search.set('limit', String(params.limit ?? 50));
  return apiFetch(`/catalog/products?${search.toString()}`);
}

export interface MenuProductInput {
  name: string;
  category_id: string;
  base_price: number;
  outlet_id?: string;
  description?: string;
  image_url?: string;
  is_available?: boolean;
}

/** POST /catalog/products — buat produk (owner/manager). */
export function createMenuProduct(input: MenuProductInput): Promise<ProductDTO> {
  return apiFetch<ProductDTO>('/catalog/products', { method: 'POST', body: JSON.stringify(input) });
}

/** PUT /catalog/products/{id} — update produk (owner/manager). */
export function updateMenuProduct(id: string, input: Partial<MenuProductInput>): Promise<ProductDTO> {
  return apiFetch<ProductDTO>(`/catalog/products/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

/** DELETE /catalog/products/{id} — soft delete (owner/manager). */
export function deleteMenuProduct(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/catalog/products/${id}`, { method: 'DELETE' });
}

/** GET /catalog/categories?outlet_id= — untuk filter & form menu. */
export function listMenuCategories(outletId: string): Promise<{ id: string; name: string }[]> {
  return apiFetch<{ id: string; name: string }[]>(`/catalog/categories?outlet_id=${encodeURIComponent(outletId)}`);
}
