import { useDashboardKpi, useLowStock, useMonthlyReport, useTopProducts } from '../../hooks/useAdminReports.js';
import { useAdminOutlet } from '../../components/admin/AdminShell.js';
import { KpiCard } from '../../components/admin/KpiCard.js';
import { SalesChart } from '../../components/admin/SalesChart.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { formatIDR, formatNumber } from '../../lib/reporting.js';
import type { LowStockAlertDTO, TopProductDTO } from '@coffibeshop/shared';

const topColumns: Column<TopProductDTO>[] = [
  { key: 'name', header: 'Produk', sortValue: (r) => r.name, render: (r) => r.name },
  { key: 'qty', header: 'Terjual', align: 'right', sortValue: (r) => r.qty_sold, render: (r) => formatNumber(r.qty_sold) },
  {
    key: 'revenue',
    header: 'Pendapatan',
    align: 'right',
    sortValue: (r) => r.revenue,
    render: (r) => <span className="tabular-nums">{formatIDR(r.revenue)}</span>,
  },
];

/**
 * AdminDashboardPage — KPI + grafik penjualan + top produk + low-stock (PRD-FRONTEND §2.4).
 *
 * Data 100% dari API nyata (`/reports/kpi`, `/reports/monthly`, `/reports/top-products`,
 * `/inventory/alerts`) — issue #68 menghapus mock. Setiap blok menangani **loading**
 * (skeleton), **error** (pesan, tanpa angka palsu), dan **kosong**.
 */
export function AdminDashboardPage() {
  const { outletId } = useAdminOutlet();
  const now = new Date();
  const kpi = useDashboardKpi(outletId);
  const monthly = useMonthlyReport(outletId, now.getMonth() + 1, now.getFullYear());
  const top = useTopProducts(outletId, '7d');
  const low = useLowStock(outletId);

  const series = (monthly.data?.days ?? [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((d) => ({ label: d.date.slice(5), value: d.net_revenue }));

  return (
    <div className="space-y-6">
      <section aria-label="Indikator utama" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpi.isLoading ? (
          <Skeleton variant="kpi" count={4} />
        ) : kpi.error ? (
          <p role="alert" className="col-span-full rounded-card border border-error/30 bg-white px-4 py-3 text-sm text-error">
            Gagal memuat KPI: {kpi.error.message}
          </p>
        ) : kpi.data ? (
          <>
            <KpiCard label="Pendapatan hari ini" value={formatIDR(kpi.data.revenue_today)} deltaPct={kpi.data.revenue_delta_pct} icon="💰" />
            <KpiCard label="Pesanan hari ini" value={formatNumber(kpi.data.orders_today)} deltaPct={kpi.data.orders_delta_pct} icon="🧾" />
            <KpiCard label="Rata-rata / pesanan" value={formatIDR(kpi.data.avg_ticket)} icon="🎯" />
            <KpiCard label="Stok menipis" value={formatNumber(kpi.data.low_stock_count)} hint="item perlu restock" icon="⚠️" />
          </>
        ) : (
          <p className="col-span-full text-sm text-text-muted">Belum ada data KPI untuk outlet ini.</p>
        )}
      </section>

      <section className="rounded-card border border-brand-100 bg-white p-4" aria-label="Tren penjualan 14 hari">
        <h2 className="mb-3 text-h3 text-text">Tren penjualan (14 hari)</h2>
        {monthly.isLoading ? (
          <Skeleton variant="row" />
        ) : monthly.error ? (
          <p role="alert" className="text-sm text-error">
            Gagal memuat tren: {monthly.error.message}
          </p>
        ) : (
          <SalesChart points={series} ariaLabel="Pendapatan bersih 14 hari terakhir" />
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Produk terlaris" className="space-y-2">
          <h2 className="text-h3 text-text">Produk terlaris (7 hari)</h2>
          {top.error ? (
            <p role="alert" className="text-sm text-error">
              Gagal memuat produk terlaris: {top.error.message}
            </p>
          ) : (
            <DataTable
              columns={topColumns}
              rows={top.data?.products ?? []}
              rowKey={(r) => r.product_id}
              pageSize={5}
              emptyMessage={top.isLoading ? 'Memuat…' : 'Belum ada penjualan.'}
              data-testid="top-products-table"
            />
          )}
        </section>

        <section aria-label="Stok menipis" className="space-y-2">
          <h2 className="text-h3 text-text">Stok menipis</h2>
          {low.isLoading ? (
            <Skeleton variant="row" count={3} />
          ) : low.error ? (
            <p role="alert" className="text-sm text-error">
              Gagal memuat stok: {low.error.message}
            </p>
          ) : (low.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-text-muted">Semua stok aman.</p>
          ) : (
            <ul className="space-y-2">
              {(low.data ?? []).map((a: LowStockAlertDTO) => (
                <li key={a.item_id} className="flex items-center justify-between rounded-card border border-warning/30 bg-white px-4 py-3 text-sm">
                  <span className="font-semibold text-text">{a.name}</span>
                  <span className="tabular-nums text-warning-fg">
                    {formatNumber(a.stock_quantity)} {a.unit} / min {formatNumber(a.reorder_point)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
