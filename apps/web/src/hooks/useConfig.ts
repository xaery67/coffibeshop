import { useQuery } from '@tanstack/react-query';
import type { PublicConfigDTO } from '@coffibeshop/shared';
import { apiFetch } from '../lib/api.js';

/** Ambil config publik (ADR-007) — tax, point, ongkir flat. Tidak hardcode. */
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => apiFetch<PublicConfigDTO>('/config'),
    staleTime: 5 * 60_000,
  });
}
