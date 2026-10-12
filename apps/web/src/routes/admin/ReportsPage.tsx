import { useMemo, useState } from 'react';
import type { DailySalesRowDTO } from '@coffibeshop/shared';
import { useAdminOutlet } from '../../components/admin/AdminShell.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';
import { Button } from '../../components/ui/Button.js';
import { SalesChart } from '../../components/admin/SalesChart.js';
import { useDailyReport, useMonthlyReport, useTopProducts } from '../../hooks/useAdminReports.js';
import { downloadCsv, formatIDR, formatNumber, reportFilename, toCsv, type CsvColumn } from '../../lib/reporting.js';

type Mode = 'daily' | 'monthly';

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * ReportsPage — laporan harian/bulanan + filter tanggal + export CSV (F-014, §2.7).
 * Data dari `/reports/daily` & `/reports/monthly`; ekspor dibangkitkan di klien.
 */
export function ReportsPage() {
  const { outletId } = useAdminOutlet();
  const [mode, setMode] = useState<Mode>('daily');
  const [date, setDate] = useState(isoToday());
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const daily = useDailyReport(outletId, date);
  const monthly = useMonthlyReport(outletId, month, year);
  const top = useTopProducts(outletId, '30d');

  const dailyColumns: Column<DailySalesRowDTO>[] = [
    { key: 'date', header: 'Tanggal', sortValue: (r) => r.date, render: (r) => r.date },
    { key: 'orders', header: 'Pesanan', align: 'right', sortValue: (r) => r.orders, render: (r) => formatNumber(r.orders) },
    {
      key: 'gross',
      header: 'Bruto',
      align: 'right',
      sortValue: (r) => r.gross_revenue,
      render: (r) => <span className="tabular-nums">{formatIDR(r.gross_revenue)}</span>,
    },
    {
      key: 'net',
      header: 'Neto',
      align: 'right',
      sortValue: (r) => r.net_revenue,
      render: (r) => <span className="tabular-nums">{formatIDR(r.net_revenue)}</span>,
    },
    {
      key: 'tax',
      header: 'Pajak',
      align: 'right',
      sortValue: (r) => r.tax,
      render: (r) => <span className="tabular-nums">{formatIDR(r.tax)}</span>,
    },
    {
      key: 'avg',
      header: 'Rata-rata',
      align: 'right',
      sortValue: (r) => r.avg_ticket,
      render: (r) => <span className="tabular-nums">{formatIDR(r.avg_ticket)}</span>,
    },
  ];

  const monthlyRows: DailySalesRowDTO[] = useMemo(() => monthly.data?.days ?? [], [monthly.data]);

  const dailyCsvColumns: CsvColumn<DailySalesRowDTO>[] = [
    { key: 'date', header: 'Tanggal', value: (r) => r.date },
    { key: 'orders', header: 'Pesanan', value: (r) => r.orders },
    { key: 'gross_revenue', header: 'Bruto', value: (r) => r.gross_revenue },
    { key: 'net_revenue', header: 'Neto', value: (r) => r.net_revenue },
    { key: 'tax', header: 'Pajak', value: (r) => r.tax },
    { key: 'discount', header: 'Diskon', value: (r) => r.discount },
    { key: 'avg_ticket', header: 'Rata-rata', value: (r) => r.avg_ticket },
  ];

  function handleExport() {
    const period = mode === 'daily' ? date : `${year}-${String(month).padStart(2, '0')}`;
    const rows = mode === 'daily' ? (daily.data ? [toDailyRow(daily.data)] : []) : monthlyRows;
    const csv = toCsv(dailyCsvColumns, rows);
    downloadCsv(reportFilename(mode, outletId, period), csv);
  }

  const chartPoints = (mode === 'daily' ? daily.data?.by_hour ?? [] : []).map((h) => ({
    label: `${String(h.hour).padStart(2, '0')}:00`,
    value: h.revenue,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Jenis laporan</legend>
          {(['daily', 'monthly'] as Mode[]).map((m) => (
            <label key={m} className="inline-flex min-h-[44px] items-center gap-1 text-sm">
              <input type="radio" name="report-mode" checked={mode === m} onChange={() => setMode(m)} />
              {m === 'daily' ? 'Harian' : 'Bulanan'}
            </label>
          ))}
        </fieldset>

        {mode === 'daily' ? (
          <label className="text-sm">
            <span className="mr-2 font-semibold text-text">Tanggal</span>
            <input
              type="date"
              value={date}
              max={isoToday()}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-[44px] rounded-lg border border-border bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            />
          </label>
        ) : (
          <div className="flex items-end gap-2">
            <label className="text-sm">
              <span className="mr-2 font-semibold text-text">Bulan</span>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="min-h-[44px] rounded-lg border border-border bg-white px-3 text-sm"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i, 1).toLocaleDateString('id-ID', { month: 'long' })}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mr-2 font-semibold text-text">Tahun</span>
              <input
                type="number"
                min={2020}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="min-h-[44px] w-24 rounded-lg border border-border bg-white px-3 text-sm"
              />
            </label>
          </div>
        )}

        <Button variant="secondary" onClick={handleExport} className="ml-auto">
          ⬇ Export CSV
        </Button>
      </div>

      {mode === 'daily' ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Ringkasan harian">
            <SummaryTile label="Pesanan" value={formatNumber(daily.data?.orders ?? 0)} />
            <SummaryTile label="Bruto" value={formatIDR(daily.data?.gross_revenue ?? 0)} />
            <SummaryTile label="Neto" value={formatIDR(daily.data?.net_revenue ?? 0)} />
          </section>
          <section className="rounded-card border border-brand-100 bg-white p-4" aria-label="Penjualan per jam">
            <h2 className="mb-3 text-h3 text-text">Penjualan per jam</h2>
            <SalesChart points={chartPoints} ariaLabel={`Penjualan per jam ${date}`} />
          </section>
          <DataTable
            columns={dailyColumns}
            rows={daily.data ? [toDailyRow(daily.data)] : []}
            rowKey={(r) => r.date}
            emptyMessage={daily.isLoading ? 'Memuat…' : 'Tidak ada data.'}
            caption={`Ringkasan ${date}`}
            data-testid="daily-report-table"
          />
        </>
      ) : (
        <DataTable
          columns={dailyColumns}
          rows={monthlyRows}
          rowKey={(r) => r.date}
          pageSize={10}
          emptyMessage={monthly.isLoading ? 'Memuat…' : 'Tidak ada data.'}
          caption={`Laporan bulanan ${month}/${year}`}
          data-testid="monthly-report-table"
        />
      )}

      <section aria-label="Produk terlaris" className="space-y-2">
        <h2 className="text-h3 text-text">Produk terlaris (30 hari)</h2>
        <DataTable
          columns={[
            { key: 'name', header: 'Produk', sortValue: (r) => r.name, render: (r) => r.name },
            { key: 'qty', header: 'Terjual', align: 'right', sortValue: (r) => r.qty_sold, render: (r) => formatNumber(r.qty_sold) },
            {
              key: 'revenue',
              header: 'Pendapatan',
              align: 'right',
              sortValue: (r) => r.revenue,
              render: (r) => <span className="tabular-nums">{formatIDR(r.revenue)}</span>,
            },
          ]}
          rows={top.data?.products ?? []}
          rowKey={(r) => r.product_id}
          pageSize={5}
          emptyMessage={top.isLoading ? 'Memuat…' : 'Belum ada penjualan.'}
          data-testid="reports-top-table"
        />
      </section>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-brand-100 bg-white p-4">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-h2 tabular-nums text-text">{value}</p>
    </div>
  );
}

/** Ringkas `DailyReportDTO` → satu baris tabel (`DailySalesRowDTO`). */
function toDailyRow(r: {
  date: string;
  orders: number;
  gross_revenue: number;
  net_revenue: number;
  tax_total: number;
  discount_total: number;
  avg_ticket: number;
}): DailySalesRowDTO {
  return {
    date: r.date,
    orders: r.orders,
    gross_revenue: r.gross_revenue,
    net_revenue: r.net_revenue,
    tax: r.tax_total,
    discount: r.discount_total,
    avg_ticket: r.avg_ticket,
  };
}
