import { useEffect, useMemo, useRef, useState } from 'react';
import { useProducts } from '../hooks/useProducts.js';
import { useCategories } from '../hooks/useCategories.js';
import { ProductCard, ProductCardSkeleton } from '../components/domain/ProductCard.js';
import { EmptyState, ErrorState } from '../components/domain/States.js';
import { chipClasses } from '../components/ui/Chip.js';

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
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const categories = useCategories();
  const { data, isLoading, isError, refetch } = useProducts({ q, categoryId });
  const products = data?.data ?? [];

  const tabs = useMemo(
    () => [
      { id: null as string | null, name: 'Semua' },
      ...(categories.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    ],
    [categories.data],
  );

  const activeIndex = tabs.findIndex((t) => t.id === categoryId);

  /** Navigasi keyboard pola tab (DS §7.4 / audit M5): panah kiri/kanan + Home/End. */
  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    setCategoryId(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-h1 text-text">Menu</h1>
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
            className="min-h-[44px] w-full rounded-lg border border-border bg-white px-3 py-2 pl-9 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true">
            🔍
          </span>
        </div>
      </div>

      {/* Tab kategori — pola ARIA tab lengkap (tablist/tab/tabpanel + keyboard, audit M5) */}
      <div role="tablist" aria-label="Kategori menu" className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t, i) => {
          const active = categoryId === t.id;
          return (
            <button
              key={t.id ?? 'all'}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`menu-tab-${t.id ?? 'all'}`}
              aria-selected={active}
              aria-controls="menu-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => setCategoryId(t.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={chipClasses({ selected: active, className: 'whitespace-nowrap' })}
            >
              {t.name}
            </button>
          );
        })}
      </div>

      <div
        id="menu-panel"
        role="tabpanel"
        aria-labelledby={`menu-tab-${tabs[activeIndex]?.id ?? 'all'}`}
        tabIndex={0}
        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
      >
        {isError && <ErrorState message="Gagal memuat menu. Pastikan API berjalan." onRetry={() => refetch()} />}

        {!isError && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
      </div>
    </section>
  );
}
