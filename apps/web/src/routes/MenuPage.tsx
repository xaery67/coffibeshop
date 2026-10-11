import { useEffect, useMemo, useState } from 'react';
import { useProducts } from '../hooks/useProducts.js';
import { useCategories } from '../hooks/useCategories.js';
import { ProductCard, ProductCardSkeleton } from '../components/domain/ProductCard.js';
import { EmptyState, ErrorState } from '../components/domain/States.js';

/** Debounce nilai (ms) untuk pencarian — PRD §2.3-B autocomplete 250ms. */
function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Menu / Catalog (PRD-FRONTEND §2.3-B) — grid produk + pencarian + tab kategori. */
export function MenuPage() {
  const [term, setTerm] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const q = useDebounced(term, 250);

  const categories = useCategories();
  const { data, isLoading, isError, refetch } = useProducts({ q, categoryId });
  const products = data?.data ?? [];

  const tabs = useMemo(
    () => [{ id: null as string | null, name: 'Semua' }, ...(categories.data ?? []).map((c) => ({ id: c.id, name: c.name }))],
    [categories.data],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-text">Menu</h1>
        <div className="relative sm:w-72">
          <label htmlFor="menu-search" className="sr-only">
            Cari produk
          </label>
          <input
            id="menu-search"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cari kopi…"
            inputMode="search"
            className="w-full rounded-lg border border-border bg-white px-3 py-2.5 pl-9 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true">
            🔍
          </span>
        </div>
      </div>

      {/* Tab kategori */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Kategori menu">
        {tabs.map((t) => {
          const active = categoryId === t.id;
          return (
            <button
              key={t.id ?? 'all'}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategoryId(t.id)}
              className={[
                'min-h-[44px] whitespace-nowrap rounded-pill border px-4 text-sm transition',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
                active ? 'border-brand bg-brand text-brand-fg font-semibold' : 'border-border bg-white text-text hover:border-brand-500/50',
              ].join(' ')}
            >
              {t.name}
            </button>
          );
        })}
      </div>

      {isError && <ErrorState message="Gagal memuat menu. Pastikan API berjalan." onRetry={() => refetch()} />}

      {!isError && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}

      {!isLoading && !isError && products.length === 0 && (
        <EmptyState
          icon="🔍"
          title="Produk tidak ditemukan"
          description={q ? `Tidak ada hasil untuk "${q}". Coba kata kunci lain.` : 'Belum ada produk pada kategori ini.'}
        />
      )}
    </section>
  );
}
