import { useQuery } from '@tanstack/react-query';
import type { CategoryDTO } from '@coffibeshop/shared';
import { apiFetch } from '../lib/api.js';

/** Kategori katalog untuk tab filter (F-001). */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<CategoryDTO[]>('/catalog/categories'),
    staleTime: 5 * 60_000,
  });
}
