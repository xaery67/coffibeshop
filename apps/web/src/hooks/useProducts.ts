import { useQuery } from '@tanstack/react-query';
import type { ProductDTO } from '@coffibeshop/shared';
import { apiFetch } from '../lib/api.js';

interface Paged { data: ProductDTO[]; meta: { page: number; total: number } }

export function useProducts(q?: string) {
  return useQuery({
    queryKey: ['products', q ?? ''],
    queryFn: () => apiFetch<Paged>(`/catalog/products?limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    staleTime: 60_000,
  });
}
