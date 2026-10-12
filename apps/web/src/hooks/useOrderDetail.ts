import { useQuery } from '@tanstack/react-query';
import type { OrderDTO } from '@coffibeshop/shared';
import { getOrder } from '../lib/orders.js';

/** Detail order member (`GET /orders/:id`) — untuk halaman tracking member. */
export function useOrderDetail(orderId?: string) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getOrder(orderId as string),
    enabled: Boolean(orderId),
    staleTime: 15_000,
  });
}

export type { OrderDTO };
