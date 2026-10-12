import type { CartLine } from '../stores/cart.store.js';
import { apiFetch } from './api.js';

/**
 * Sinkronisasi cart klien → Redis server (ADR-006, hybrid cart).
 *
 * Backend checkout membaca cart OTORITATIF dari Redis (`cart:guest:{guestId}`),
 * sedangkan UI memakai Zustand+localStorage. Backend tidak punya endpoint "replace cart",
 * jadi kita rekonsiliasi lewat endpoint yang ada: hapus semua item server, lalu tambah ulang
 * dari state klien. Deterministik & idempoten (aman bila pengguna menekan "Buat Pesanan" ulang).
 */

interface ServerCart {
  items?: { id: string }[];
}

/** Konversi CartLine (klien) → input server `POST /orders/cart/items`. */
export function lineToServerInput(line: CartLine) {
  return {
    product_id: line.product_id,
    variant_id: line.variant?.variantId ?? null,
    option_ids: line.options.map((o) => o.optionValueId),
    qty: line.qty,
    notes: line.note,
  };
}

/** Ganti isi cart server agar sama persis dengan cart klien. */
export async function replaceServerCart(lines: CartLine[]): Promise<void> {
  const cart = await apiFetch<ServerCart>('/orders/cart');
  for (const item of cart.items ?? []) {
    await apiFetch(`/orders/cart/items/${item.id}`, { method: 'DELETE' });
  }
  for (const line of lines) {
    await apiFetch('/orders/cart/items', {
      method: 'POST',
      body: JSON.stringify(lineToServerInput(line)),
    });
  }
}
