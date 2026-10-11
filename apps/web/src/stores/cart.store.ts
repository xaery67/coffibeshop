import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Snapshot varian terpilih (bukan otoritatif harga — hanya untuk preview & label). */
export interface CartVariantSnapshot {
  variantId: string;
  name: string;
  priceAdjustment: number;
}

/** Snapshot opsi terpilih. */
export interface CartOptionSnapshot {
  optionValueId: string;
  name: string;
  priceAdjustment: number;
}

export interface CartLine {
  id: string;
  /** Kunci dedupe: productId|variantId|sorted(optionValueIds)|note (PRD §3.2). */
  fingerprint: string;
  product_id: string;
  product_name: string;
  image_url?: string | null;
  variant?: CartVariantSnapshot | null;
  options: CartOptionSnapshot[];
  note?: string;
  qty: number;
  /** Harga dasar saat ditambahkan (deteksi perubahan harga — PRD §3.2). */
  base_price: number;
  /** Harga 1 unit hasil kustomisasi (preview; server otoritatif). */
  unit_price: number;
}

export type Fulfillment = 'pickup' | 'delivery' | 'dine_in';

interface CartState {
  items: CartLine[];
  fulfillment: Fulfillment;
  add: (line: Omit<CartLine, 'id' | 'fingerprint'> & { fingerprint?: string }) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  setFulfillment: (f: Fulfillment) => void;
  clear: () => void;
}

/** Bangun fingerprint dedupe dari komponen line. */
export function buildFingerprint(input: {
  product_id: string;
  variant?: CartVariantSnapshot | null;
  options: CartOptionSnapshot[];
  note?: string;
}): string {
  const optionIds = input.options
    .map((o) => o.optionValueId)
    .sort()
    .join(',');
  return [input.product_id, input.variant?.variantId ?? '', optionIds, input.note ?? ''].join('|');
}

/**
 * Cart = client state (Zustand + persist) — PRD-FRONTEND §3.2, §3.4.
 * localStorage = mirror instan/offline; Redis (server, header X-Guest-Id) = otoritas saat checkout.
 * Line dengan fingerprint identik → qty dijumlahkan (dedupe, PRD §3.8).
 */
export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      fulfillment: 'pickup',
      add: (line) => {
        const fingerprint = line.fingerprint ?? buildFingerprint(line);
        set((s) => {
          const existing = s.items.find((i) => i.fingerprint === fingerprint);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.fingerprint === fingerprint ? { ...i, qty: Math.min(99, i.qty + line.qty) } : i,
              ),
            };
          }
          return { items: [...s.items, { ...line, fingerprint, id: crypto.randomUUID() }] };
        });
      },
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      setQty: (id, qty) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, qty: Math.max(1, Math.min(99, qty)) } : i,
          ),
        })),
      setFulfillment: (fulfillment) => set({ fulfillment }),
      clear: () => set({ items: [] }),
    }),
    { name: 'cs.cart' },
  ),
);
