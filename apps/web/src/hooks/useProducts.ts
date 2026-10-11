import { useQuery } from '@tanstack/react-query';
import type { ProductDTO } from '@coffibeshop/shared';
import { apiFetch } from '../lib/api.js';

interface PagedProducts {
  data: ProductDTO[];
  meta: { page: number; limit: number; total: number; total_pages: number };
}

/**
 * Daftar produk dengan pencarian `q` (pg_trgm, toleran typo) & filter kategori (F-001).
 * `q` di-debounce di komponen; query key menyertakan keduanya agar cache tepat.
 */
export function useProducts(params: { q?: string; categoryId?: string | null } = {}) {
  const { q = '', categoryId = null } = params;
  const search = new URLSearchParams({ limit: '50' });
  if (q.trim()) search.set('q', q.trim());
  if (categoryId) search.set('category_id', categoryId);

  return useQuery({
    queryKey: ['products', q.trim(), categoryId],
    queryFn: () => apiFetch<PagedProducts>(`/catalog/products?${search.toString()}`),
    staleTime: 60_000,
  });
}
