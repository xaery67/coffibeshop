import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminDashboardPage } from './AdminDashboardPage.js';
import { ReportsPage } from './ReportsPage.js';
import { OutletCtx } from '../../components/admin/AdminShell.js';
import { render, h, waitFor } from '../../test/render.js';

/** Dashboard & Reports — render KPI, grafik, tabel, dan tombol export CSV. */

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return h(
    QueryClientProvider,
    { client: qc },
    h(OutletCtx.Provider, { value: { outletId: 'o1', outletName: 'Pusat' } }, ui),
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {}, error: null }),
    } as unknown as Response),
  );
});

describe('AdminDashboardPage', () => {
  it('menampilkan 4 kartu KPI', async () => {
    const r = render(wrap(h(AdminDashboardPage, null)));
    await waitFor(() => expect(r.$$('[data-testid="kpi-card"]').length).toBe(4));
    expect(r.text()).toContain('Pendapatan hari ini');
    expect(r.text()).toContain('Pesanan hari ini');
    expect(r.text()).toContain('Stok menipis');
    r.unmount();
  });

  it('merender grafik penjualan (SVG) & tabel top produk', async () => {
    const r = render(wrap(h(AdminDashboardPage, null)));
    await waitFor(() => expect(r.$('[data-testid="sales-chart"]')).not.toBeNull());
    expect(r.$('[data-testid="top-products-table"]')).not.toBeNull();
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
