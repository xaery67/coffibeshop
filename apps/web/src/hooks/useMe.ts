import { useQuery } from '@tanstack/react-query';
import type { MeDTO } from '@coffibeshop/shared';
import { apiFetch } from '../lib/api.js';

/** Profil member (`GET /auth/me`). `withAddresses` menyertakan address book. */
export function useMe(enabled = true, withAddresses = false) {
  return useQuery({
    queryKey: ['me', withAddresses],
    queryFn: () => apiFetch<MeDTO>(`/auth/me${withAddresses ? '?addresses=true' : ''}`),
    enabled,
    staleTime: 60_000,
  });
}
