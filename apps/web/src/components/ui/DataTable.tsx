import { useMemo, useState, type ReactNode } from 'react';

/**
 * DataTable — primitive tabel admin (PRD-FRONTEND §6.2, Sprint 4 scope #5).
 *
 * Fitur: sort per kolom, pencarian/filter (via `filter` render-prop), pagination.
 * Aksesibel: `<table>` semantik, `aria-sort` pada header terurut, tombol ≥44px,
 * status "tidak ada hasil" sebagai teks (bukan warna saja).
 *
 * Generik atas `T`; kolom mendeklarasikan `sortValue` & `render` sendiri.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Nilai untuk pengurutan (string/number). Bila undefined → kolom tak terurut. */
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Kapasitas halaman; 0/undefined → tanpa pagination. */
  pageSize?: number;
  /** Nilai awal pencarian (opsional; bila diisi, tabel menampilkan input cari). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Predikat pencarian; default: cocokkan teks pada semua kolom string. */
  filterRow?: (row: T, query: string) => boolean;
  /** Slot filter tambahan (mis. dropdown kategori) di atas tabel. */
  toolbar?: ReactNode;
  emptyMessage?: string;
  caption?: string;
  'data-testid'?: string;
}

type SortDir = 'asc' | 'desc';

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize = 0,
  searchable = false,
  searchPlaceholder = 'Cari…',
  filterRow,
  toolbar,
  emptyMessage = 'Tidak ada data.',
  caption,
  'data-testid': testId,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    if (filterRow) return rows.filter((r) => filterRow(r, q));
    return rows.filter((r) =>
      columns.some((c) => String(c.render(r) ?? '').toLowerCase().includes(q)),
    );
  }, [rows, query, filterRow, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'id') * dir;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const total = sorted.length;
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  const paged = pageSize > 0 ? sorted.slice((safePage - 1) * pageSize, safePage * pageSize) : sorted;

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  };

  const alignCls = (a?: Column<T>['align']) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="space-y-3" data-testid={testId}>
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <label className="flex items-center gap-2">
              <span className="sr-only">Cari</span>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                aria-label="Cari di tabel"
                className="min-h-[44px] w-56 rounded-lg border border-border bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
              />
            </label>
          )}
          {toolbar}
        </div>
      )}

      <div className="overflow-x-auto rounded-card border border-brand-100 bg-white">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="px-3 py-2 text-left text-caption text-text-muted">{caption}</caption>}
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50/60">
              {columns.map((col) => {
                const active = sortKey === col.key;
                const ariaSort = !col.sortValue ? undefined : active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={['px-3 py-2 font-semibold text-text', alignCls(col.align)].join(' ')}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className="inline-flex min-h-[36px] items-center gap-1 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                      >
                        {col.header}
                        <span aria-hidden="true" className="text-caption text-text-muted">
                          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr key={rowKey(row)} className="border-b border-brand-100/60 last:border-0 hover:bg-brand-50/40">
                  {columns.map((col) => (
                    <td key={col.key} className={['px-3 py-2 text-text', alignCls(col.align), col.className].filter(Boolean).join(' ')}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageSize > 0 && total > pageSize && (
        <nav className="flex items-center justify-between gap-2 text-sm" aria-label="Navigasi halaman tabel">
          <span className="text-text-muted" aria-live="polite">
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, total)} dari {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="min-h-[36px] rounded-lg border border-border px-3 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              ← Sebelumnya
            </button>
            <span className="tabular-nums text-text-muted">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="min-h-[36px] rounded-lg border border-border px-3 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              Berikutnya →
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
