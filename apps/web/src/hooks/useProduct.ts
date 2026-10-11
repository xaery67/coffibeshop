import { useQuery } from '@tanstack/react-query';
import type { ProductDTO } from '@coffibeshop/shared';
import { apiFetch } from '../lib/api.js';

/** Detail produk (varian + opsi) untuk PDP — F-002. */
export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => apiFetch<ProductDTO>(`/catalog/products/${id}`),
    enabled: Boolean(id),
    staleTime: 120_000,
  });
}
