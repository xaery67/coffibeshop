import { describe, it, expect } from 'vitest';
import type { DailySalesRowDTO } from '@coffibeshop/shared';
import {
  downloadCsv,
  formatIDR,
  formatNumber,
  percentChange,
  reportFilename,
  salesSeries,
  toCsv,
  type CsvColumn,
} from './reporting.js';

/** Helper laporan & export CSV (PRD-BACKEND §2.7). */

describe('formatIDR / formatNumber', () => {
  it('memformat rupiah tanpa desimal', () => {
    expect(formatIDR(82140)).toBe('Rp 82.140');
    expect(formatIDR(0)).toBe('Rp 0');
    expect(formatIDR(null)).toBe('Rp 0');
    expect(formatIDR(undefined)).toBe('Rp 0');
  });

  it('memformat angka dengan pemisah ribuan id-ID', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(NaN)).toBe('0');
  });
});

describe('percentChange', () => {
  it('menghitung perubahan persentase', () => {
    expect(percentChange(110, 100)).toBeCloseTo(10);
    expect(percentChange(90, 100)).toBeCloseTo(-10);
  });

  it('null bila basis 0 / tak valid', () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(10, NaN)).toBeNull();
  });
});

describe('toCsv — serialisasi RFC 4180', () => {
  const cols: CsvColumn<{ a: string; b: number }>[] = [
    { key: 'a', header: 'Nama', value: (r) => r.a },
    { key: 'b', header: 'Total', value: (r) => r.b },
  ];

  it('menulis header + baris', () => {
    const csv = toCsv(cols, [{ a: 'Latte', b: 32000 }]);
    expect(csv).toBe('Nama,Total\nLatte,32000');
  });

  it('mengutip sel yang memuat koma / kutip / baris baru', () => {
    const csv = toCsv(cols, [{ a: 'Latte, Large', b: 1 }]);
    expect(csv.split('\n')[1]).toBe('"Latte, Large",1');
    const quoted = toCsv(cols, [{ a: 'Ka"fe', b: 2 }]);
    expect(quoted.split('\n')[1]).toBe('"Ka""fe",2');
  });
});

describe('downloadCsv', () => {
  it('tidak melempar di lingkungan tanpa URL.createObjectURL', () => {
    // jsdom tidak menyediakan createObjectURL → fungsi harus aman (no-op).
    expect(() => downloadCsv('x.csv', 'a,b')).not.toThrow();
  });
});

describe('reportFilename', () => {
  it('memuat jenis, outlet singkat, dan periode', () => {
    expect(reportFilename('daily', 'abcdef12-3456', '2026-10-12')).toBe('laporan-daily-abcdef12-2026-10-12.csv');
    expect(reportFilename('monthly', null, '2026-10')).toBe('laporan-monthly-semua-2026-10.csv');
  });
});

describe('salesSeries', () => {
  const rows: DailySalesRowDTO[] = [
    { date: '2026-10-03', orders: 3, gross_revenue: 300, net_revenue: 270, tax: 30, discount: 0, avg_ticket: 100 },
    { date: '2026-10-01', orders: 1, gross_revenue: 100, net_revenue: 90, tax: 10, discount: 0, avg_ticket: 100 },
    { date: '2026-10-02', orders: 2, gross_revenue: 200, net_revenue: 180, tax: 20, discount: 0, avg_ticket: 100 },
  ];

  it('mengurutkan kronologis & mengambil N hari terakhir', () => {
    const series = salesSeries(rows, 2);
    expect(series.map((s) => s.date)).toEqual(['2026-10-02', '2026-10-03']);
    expect(series[0].revenue).toBe(180);
  });
});
