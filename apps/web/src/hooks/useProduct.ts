import { useQuery } from '@tanstack/react-query';
import type { ProductDTO } from '@coffibeshop/shared';
import { apiFetch } from '../lib/api.js';

/**
 * Detail produk (varian + opsi) untuk PDP — F-002.
 *
 * `identifier` boleh **id (uuid)** ATAU **slug** — backend menerima keduanya di
 * `GET /catalog/products/:identifier` (issue #79/#84). Link lama `/product/<uuid>`
 * tetap bekerja (backward-compat).
 */
export function useProduct(identifier: string | undefined) {
  return useQuery({
    queryKey: ['product', identifier],
    queryFn: () => apiFetch<ProductDTO>(`/catalog/products/${identifier}`),
    enabled: Boolean(identifier),
    staleTime: 120_000,
  });
}
