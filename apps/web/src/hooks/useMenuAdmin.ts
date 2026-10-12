import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createMenuProduct,
  deleteMenuProduct,
  listMenuCategories,
  listMenuProducts,
  updateMenuProduct,
  type MenuProductInput,
} from '../lib/admin.js';

/** Manajemen menu admin (katalog §2.2 — endpoint sudah ada di backend). */

export function useMenuProducts(outletId: string | null, params: { q?: string; category_id?: string } = {}) {
  return useQuery({
    queryKey: ['admin', 'menu', outletId, params.q ?? '', params.category_id ?? ''],
    queryFn: () =>
      listMenuProducts({ outlet_id: outletId!, q: params.q, category_id: params.category_id, limit: 100 }),
    enabled: Boolean(outletId),
    select: (res) => res.data ?? [],
  });
}

export function useMenuCategories(outletId: string | null) {
  return useQuery({
    queryKey: ['admin', 'menu-categories', outletId],
    queryFn: () => listMenuCategories(outletId!),
    enabled: Boolean(outletId),
    staleTime: 5 * 60_000,
  });
}

export function useCreateMenuProduct(outletId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MenuProductInput) => createMenuProduct({ ...input, outlet_id: outletId ?? undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'menu', outletId] }),
  });
}

export function useUpdateMenuProduct(outletId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MenuProductInput> }) =>
      updateMenuProduct(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'menu', outletId] }),
  });
}

export function useDeleteMenuProduct(outletId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMenuProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'menu', outletId] }),
  });
}
