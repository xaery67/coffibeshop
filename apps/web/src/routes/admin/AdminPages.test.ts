import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminDashboardPage } from './AdminDashboardPage.js';
import { ReportsPage } from './ReportsPage.js';
import { OutletCtx } from '../../components/admin/AdminShell.js';
import { render, h, waitFor } from '../../test/render.js';

/**
 * Dashboard & Reports — data dari **API nyata** (issue #68).
 *
 * Regresi #68: dulu KPI/grafik berasal dari `admin.mock` (angka palsu, mis. 122
 * pesanan). Kini setiap endpoint mengembalikan payload nyata; test memakai
 * payload per-URL yang realistis dan meng-assert nilai dari API tampil.
 */

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return h(
    QueryClientProvider,
    { client: qc },
    h(OutletCtx.Provider, { value: { outletId: 'o1', outletName: 'Pusat' } }, ui),
  );
}

const KPI = {
  outlet_id: 'o1',
  date: '2026-10-13',
  revenue_today: 4_250_000,
  orders_today: 88,
  avg_ticket: 48_295,
  low_stock_count: 2,
  revenue_delta_pct: 5.5,
  orders_delta_pct: -1.2,
};

const MONTHLY = {
  outlet_id: 'o1',
  month: 10,
  year: 2026,
  days: [
    { date: '2026-10-12', orders: 40, gross_revenue: 2_000_000, net_revenue: 1_780_000, tax: 220_000, discount: 60_000, avg_ticket: 50_000 },
    { date: '2026-10-13', orders: 88, gross_revenue: 4_250_000, net_revenue: 3_782_500, tax: 467_500, discount: 127_500, avg_ticket: 48_295 },
  ],
  totals: { orders: 128, gross_revenue: 6_250_000, net_revenue: 5_562_500, avg_ticket: 48_828 },
};

const TOP = {
  outlet_id: 'o1',
  period: '7d',
  products: [
    { product_id: 'p1', name: 'Latte', qty_sold: 120, revenue: 3_840_000 },
    { product_id: 'p2', name: 'Americano', qty_sold: 90, revenue: 2_250_000 },
  ],
};

const DAILY = {
  outlet_id: 'o1',
  date: '2026-10-13',
  orders: 88,
  gross_revenue: 4_250_000,
  net_revenue: 3_782_500,
  tax_total: 467_500,
  discount_total: 127_500,
  avg_ticket: 48_295,
  items_sold: 190,
  by_hour: [
    { hour: 8, orders: 4, revenue: 190_000 },
    { hour: 9, orders: 9, revenue: 430_000 },
  ],
  top_products: TOP.products,
};

const LOW = [
  { item_id: 'inv-1', name: 'Biji Kopi Arabika', unit: 'gram', stock_quantity: 30, reorder_point: 120 },
];

/** Payload per-endpoint berdasarkan path. */
function payloadFor(url: string): unknown {
  if (url.includes('/reports/kpi')) return KPI;
  if (url.includes('/reports/monthly')) return MONTHLY;
  if (url.includes('/reports/daily')) return DAILY;
  if (url.includes('/reports/top-products')) return { ...TOP, period: url.includes('30d') ? '30d' : '7d' };
  if (url.includes('/inventory/alerts')) return LOW;
  return {};
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const data = payloadFor(String(input));
      return { ok: true, status: 200, json: async () => ({ success: true, data, error: null }) } as unknown as Response;
    }),
  );
});

describe('AdminDashboardPage', () => {
  it('menampilkan 4 kartu KPI dari API nyata', async () => {
    const r = render(wrap(h(AdminDashboardPage, null)));
    await waitFor(() => expect(r.$$('[data-testid="kpi-card"]').length).toBe(4));
    expect(r.text()).toContain('Pendapatan hari ini');
    expect(r.text()).toContain('Pesanan hari ini');
    expect(r.text()).toContain('Stok menipis');
    // Nilai berasal dari payload API (bukan mock 122 pesanan).
    expect(r.text()).toContain('88');
    r.unmount();
  });

  it('merender grafik penjualan (SVG) & tabel top produk', async () => {
    const r = render(wrap(h(AdminDashboardPage, null)));
    await waitFor(() => expect(r.$('[data-testid="sales-chart"]')).not.toBeNull());
    expect(r.$('[data-testid="top-products-table"]')).not.toBeNull();
    expect(r.text()).toContain('Latte');
    r.unmount();
  });
});

describe('ReportsPage', () => {
  it('mode harian → ringkasan + tabel + tombol export CSV', async () => {
    const r = render(wrap(h(ReportsPage, null)));
    await waitFor(() => expect(r.$('[data-testid="daily-report-table"]')).not.toBeNull());
    expect(r.text()).toContain('Export CSV');
    expect(r.text()).toContain('Penjualan per jam');
    r.unmount();
  });

  it('beralih ke mode bulanan menampilkan tabel bulanan', async () => {
    const r = render(wrap(h(ReportsPage, null)));
    const monthlyRadio = r.$$('input[name="report-mode"]')[1] as HTMLInputElement;
    r.clickNode(monthlyRadio);
    await waitFor(() => expect(r.$('[data-testid="monthly-report-table"]')).not.toBeNull());
    r.unmount();
  });

  it('menyediakan tabel produk terlaris', async () => {
    const r = render(wrap(h(ReportsPage, null)));
    await waitFor(() => expect(r.$('[data-testid="reports-top-table"]')).not.toBeNull());
    r.unmount();
  });
});
