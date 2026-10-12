import { describe, it, expect } from 'vitest';
import React from 'react';
import { DataTable, type Column } from './DataTable.js';
import { render, h } from '../../test/render.js';

/**
 * DataTable primitif (Sprint 4 #5): sort, filter/pencarian, pagination.
 * Komponen di-render tanpa JSX (lihat catatan di test/render.ts).
 */

interface Row {
  id: string;
  name: string;
  price: number;
}

const ROWS: Row[] = [
  { id: '1', name: 'Latte', price: 32000 },
  { id: '2', name: 'Americano', price: 25000 },
  { id: '3', name: 'Cappuccino', price: 30000 },
  { id: '4', name: 'Matcha', price: 35000 },
  { id: '5', name: 'Croissant', price: 22000 },
];

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Nama', sortValue: (r) => r.name, render: (r) => r.name },
  {
    key: 'price',
    header: 'Harga',
    align: 'right',
    sortValue: (r) => r.price,
    render: (r) => `Rp ${r.price}`,
  },
];

function renderTable(props: Record<string, unknown> = {}) {
  return render(
    h(DataTable as unknown as React.ElementType, {
      columns: COLUMNS,
      rows: ROWS,
      rowKey: (r: Row) => r.id,
      ...props,
    }),
  );
}

describe('DataTable — render dasar', () => {
  it('menampilkan header & semua baris bila tanpa pagination', () => {
    const r = renderTable();
    expect(r.text()).toContain('Nama');
    expect(r.text()).toContain('Harga');
    for (const row of ROWS) expect(r.text()).toContain(row.name);
    r.unmount();
  });

  it('menampilkan pesan kosong kustom', () => {
    const r = renderTable({ rows: [], emptyMessage: 'Belum ada produk.' });
    expect(r.text()).toContain('Belum ada produk.');
    r.unmount();
  });
});

describe('DataTable — sorting', () => {
  it('klik header menaikkan urutan (ascending)', () => {
    const r = renderTable();
    const nameHeader = r.$$('th button').find((b) => b.textContent?.includes('Nama'))!;
    r.clickNode(nameHeader);
    expect(nameHeader.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    // Baris pertama harus 'Americano' (A < C < ...).
    const firstCell = r.$$('tbody tr')[0].querySelector('td')?.textContent;
    expect(firstCell).toBe('Americano');
    r.unmount();
  });

  it('klik kedua kali membalik ke descending', () => {
    const r = renderTable();
    const priceHeader = r.$$('th button').find((b) => b.textContent?.includes('Harga'))!;
    r.clickNode(priceHeader); // asc
    r.clickNode(priceHeader); // desc
    expect(priceHeader.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    const firstPrice = r.$$('tbody tr')[0].querySelectorAll('td')[1].textContent;
    expect(firstPrice).toBe('Rp 35000'); // termahal dulu
    r.unmount();
  });
});

describe('DataTable — pencarian', () => {
  it('memfilter baris sesuai query', () => {
    const r = renderTable({ searchable: true });
    const input = r.$('input[type="search"]')!;
    r.setValue(input, 'lat');
    expect(r.text()).toContain('Latte');
    expect(r.text()).not.toContain('Americano');
    r.unmount();
  });

  it('query tanpa hasil menampilkan emptyMessage', () => {
    const r = renderTable({ searchable: true, emptyMessage: 'Tidak ada.' });
    r.setValue(r.$('input[type="search"]')!, 'zzz');
    expect(r.text()).toContain('Tidak ada.');
    r.unmount();
  });
});

describe('DataTable — pagination', () => {
  it('hanya menampilkan satu halaman & ringkasan rentang', () => {
    const r = renderTable({ pageSize: 2 });
    const bodyRows = r.$$('tbody tr');
    expect(bodyRows).toHaveLength(2);
    expect(r.text()).toContain('1–2 dari 5');
    r.unmount();
  });

  it('tombol Berikutnya pindah halaman', () => {
    const r = renderTable({ pageSize: 2 });
    const next = r.$$('button').find((b) => b.textContent?.includes('Berikutnya'))!;
    r.clickNode(next);
    expect(r.text()).toContain('3–4 dari 5');
    r.unmount();
  });

  it('tombol Sebelumnya nonaktif di halaman pertama', () => {
    const r = renderTable({ pageSize: 2 });
    const prev = r.$$('button').find((b) => b.textContent?.includes('Sebelumnya'))! as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    r.unmount();
  });
});
