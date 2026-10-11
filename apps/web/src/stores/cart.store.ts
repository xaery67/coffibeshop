import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartLine {
  id: string;
  product_id: string;
  product_name: string;
  variant_id?: string | null;
  option_ids: string[];
  qty: number;
  unit_price: number;
}

interface CartState {
  items: CartLine[];
  fulfillment: 'pickup' | 'delivery' | 'dine_in';
  add: (line: Omit<CartLine, 'id'>) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  setFulfillment: (f: CartState['fulfillment']) => void;
  clear: () => void;
}

/**
 * Cart = client state (Zustand + persist) — PRD-FRONTEND §3.
 * localStorage = mirror untuk instant read/offline; Redis (server) = source of truth saat checkout.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      fulfillment: 'pickup',
      add: (line) =>
        set((s) => ({
          items: [...s.items, { ...line, id: crypto.randomUUID() }],
        })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      setQty: (id, qty) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i)),
        })),
      setFulfillment: (fulfillment) => set({ fulfillment }),
      clear: () => set({ items: [] }),
    }),
    { name: 'cs.cart' },
  ),
);
