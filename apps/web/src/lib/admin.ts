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
import { apiFetch } from './api.js';
import { MOCK, mockDelay, mockDailyReport, mockKpi, mockLowStock, mockMonthlyReport, mockQueue, mockTopProducts } from './admin.mock.js';

/**
 * Klien Admin (Sprint 4). Kontrak: `docs/PRD-BACKEND.md` §2.3 (order queue),
 * §2.5 (inventory alerts), §2.7 (reporting), §2.2 (katalog admin).
 *
 * Endpoint yang SUDAH ada di backend dipanggil apa adanya; endpoint yang belum
 * merged dialihkan ke mock saat `VITE_ADMIN_MOCK` aktif. Saat backend mendarat,
 * cukup set env ke `false` (atau hapus cabang mock) — UI & test tidak berubah.
 */

/** GET /orders/queue?outlet_id=&status= — antrian staff (PRD-BACKEND §2.3). */
export function getOrderQueue(outletId: string, statuses?: string[]): Promise<QueueOrderDTO[]> {
  if (MOCK) return mockDelay(mockQueue(outletId));
  const params = new URLSearchParams({ outlet_id: outletId });
  if (statuses?.length) params.set('status', statuses.join(','));
  return apiFetch<QueueOrderDTO[]>(`/orders/queue?${params.toString()}`);
}

/** PUT /orders/{id}/status — update status (state machine divalidasi backend). */
export function updateOrderStatus(
  orderId: string,
  status: string,
  note?: string,
): Promise<QueueOrderDTO | { id: string; status: string }> {
  if (MOCK) return mockDelay({ id: orderId, status });
  return apiFetch(`/orders/${orderId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, ...(note ? { note } : {}) }),
  });
}

/** POST /orders/{id}/print-ticket — kitchen ticket. */
export function printTicket(orderId: string): Promise<{ ok: boolean }> {
  if (MOCK) return mockDelay({ ok: true });
  return apiFetch<{ ok: boolean }>(`/orders/${orderId}/print-ticket`, { method: 'POST' });
}

/** KPI dashboard (turunan §2.7 + §2.5) — endpoint agregat belum ada → mock. */
export function getDashboardKpi(outletId: string, date?: string): Promise<DashboardKpiDTO> {
  if (MOCK) return mockDelay(mockKpi(outletId, date));
  const params = new URLSearchParams({ outlet_id: outletId });
  if (date) params.set('date', date);
  return apiFetch<DashboardKpiDTO>(`/reports/kpi?${params.toString()}`);
}

/** GET /reports/daily?outlet_id=&date= */
export function getDailyReport(outletId: string, date: string): Promise<DailyReportDTO> {
  if (MOCK) return mockDelay(mockDailyReport(outletId, date));
  const params = new URLSearchParams({ outlet_id: outletId, date });
  return apiFetch<DailyReportDTO>(`/reports/daily?${params.toString()}`);
}

/** GET /reports/monthly?outlet_id=&month=&year= */
export function getMonthlyReport(outletId: string, month: number, year: number): Promise<MonthlyReportDTO> {
  if (MOCK) return mockDelay(mockMonthlyReport(outletId, month, year));
  const params = new URLSearchParams({ outlet_id: outletId, month: String(month), year: String(year) });
  return apiFetch<MonthlyReportDTO>(`/reports/monthly?${params.toString()}`);
}

/** GET /reports/top-products?outlet_id=&period=7d|30d */
export function getTopProducts(outletId: string, period: ReportPeriod = '7d'): Promise<TopProductsReportDTO> {
  if (MOCK) return mockDelay(mockTopProducts(outletId, period));
  const params = new URLSearchParams({ outlet_id: outletId, period });
  return apiFetch<TopProductsReportDTO>(`/reports/top-products?${params.toString()}`);
}

/** GET /inventory/alerts?outlet_id= — low-stock (PRD-BACKEND §2.5). */
export function getLowStockAlerts(outletId: string): Promise<LowStockAlertDTO[]> {
  if (MOCK) return mockDelay(mockLowStock(outletId));
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
