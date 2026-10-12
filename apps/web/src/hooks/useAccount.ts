import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddressDTO, AddressInput } from '@coffibeshop/shared';
import {
  createAddress,
  deleteAddress,
  getAddresses,
  updateAddress,
} from '../lib/addresses.js';
import { getLoyaltyPoints, getLoyaltyVouchers, postRedeem, type RedeemInput } from '../lib/loyalty.js';
import { getOrderHistory, postReorder } from '../lib/orders.js';
import { serverItemsToCartLines, unavailableItems } from '../lib/reorder.js';
import { useCartStore } from '../stores/cart.store.js';

/** Riwayat order member (`GET /orders`). */
export function useOrderHistory(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['orders', page, limit],
    queryFn: () => getOrderHistory({ page, limit }),
    staleTime: 30_000,
  });
}

/** Loyalty: saldo poin + riwayat. */
export function useLoyaltyPoints() {
  return useQuery({
    queryKey: ['loyalty', 'points'],
    queryFn: getLoyaltyPoints,
    staleTime: 60_000,
  });
}

/** Loyalty: voucher aktif. */
export function useLoyaltyVouchers() {
  return useQuery({
    queryKey: ['loyalty', 'vouchers'],
    queryFn: getLoyaltyVouchers,
    staleTime: 60_000,
  });
}

/** Address book member. */
export function useAddresses(enabled = true) {
  return useQuery({
    queryKey: ['addresses'],
    queryFn: getAddresses,
    enabled,
    staleTime: 30_000,
  });
}

/** Reorder 1-klik → isi cart store, kembalikan jumlah item ditambahkan & yang tak tersedia. */
export function useReorder() {
  const queryClient = useQueryClient();
  const add = useCartStore((s) => s.add);

  return useMutation({
    mutationFn: (orderId: string) => postReorder(orderId),
    onSuccess: (res) => {
      const lines = serverItemsToCartLines(res.items);
      lines.forEach((line) => add(line));
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}

/** Ringkas hasil reorder untuk pesan UI. */
export function reorderSummary(items: unknown): { added: number; unavailable: number } {
  return {
    added: serverItemsToCartLines(items).length,
    unavailable: unavailableItems(items).length,
  };
}

/** CRUD alamat dengan invalidasi cache. */
export function useAddressMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['addresses'] });

  const create = useMutation({
    mutationFn: (input: AddressInput) => createAddress(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AddressInput> }) => updateAddress(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAddress(id),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

/** Redeem poin → voucher, lalu segarkan saldo & voucher. */
export function useRedeem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RedeemInput) => postRedeem(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loyalty'] });
    },
  });
}

export type { AddressDTO };
