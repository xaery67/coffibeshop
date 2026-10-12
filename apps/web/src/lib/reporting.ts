import type { DailySalesRowDTO } from '@coffibeshop/shared';

/**
 * Helper laporan (PRD-BACKEND §2.7) — format angka, seri grafik, dan **export CSV**.
 * Semua fungsi murni kecuali `downloadCsv` (sentuh DOM/Blob) → mudah diuji.
 */

/** Rp 1.234.567 (tanpa desimal). */
export function formatIDR(n: number | null | undefined): string {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  return `Rp ${Math.round(v).toLocaleString('id-ID')}`;
}

export function formatNumber(n: number | null | undefined): string {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  return v.toLocaleString('id-ID');
}

/** Persentase perubahan (curr vs prev). `null` bila prev 0 / tak ada basis. */
export function percentChange(curr: number, prev: number): number | null {
  if (!Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export interface CsvColumn<T> {
  key: string;
  header: string;
  value: (row: T) => unknown;
}

/** Escape satu sel CSV (RFC 4180): kutip bila memuat koma/kuot/baris baru. */
function escapeCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialisasi tabel → string CSV (header + baris). */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(','));
  return [head, ...body].join('\n');
}

/** Unduh CSV di browser (no-op di lingkungan tanpa DOM/Blob). */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return;
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Nama file ekspor konsisten: `laporan-<kind>-<outlet>-<periode>.csv`. */
export function reportFilename(kind: string, outletId: string | null, period: string): string {
  const outlet = outletId ? outletId.slice(0, 8) : 'semua';
  return `laporan-${kind}-${outlet}-${period}.csv`;
}

/** Ambil `limit` hari terakhir dari laporan bulanan → seri grafik. */
export function salesSeries(
  days: DailySalesRowDTO[],
  limit: number,
): { date: string; revenue: number; orders: number }[] {
  return days
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)
    .map((d) => ({ date: d.date, revenue: d.net_revenue, orders: d.orders }));
}
