import { useQuery } from '@tanstack/react-query';
import type { OutletDTO } from '@coffibeshop/shared';
import { apiFetch } from '../lib/api.js';

/** Daftar outlet untuk pemilih outlet di Checkout (F-001). */
export function useOutlets() {
  return useQuery({
    queryKey: ['outlets'],
    queryFn: () => apiFetch<OutletDTO[]>('/catalog/outlets'),
    staleTime: 5 * 60_000,
  });
}
