import type { CartItemDTO } from '@coffibeshop/shared';
import type { CartLine, CartOptionSnapshot, CartVariantSnapshot } from '../stores/cart.store.js';

/**
 * Reorder 1-klik (ADR-010, AC-10) — normalisasi item dari
 * `POST /orders/:id/reorder` ke bentuk `CartLine` store.
 *
 * Backend dapat mengembalikan `CartItemDTO` (kontrak ADR-010) atau baris
 * `OrderItem` mentah (product_id/variant_id/qty/unit_price/options). Fungsi ini
 * menerima KEDUA bentuk agar cart terisi lengkap walau kontrak bergeser.
 * `base_price` direkonstruksi dari `unit_price` dikurangi penyesuaian opsi/varian
 * (hanya untuk preview — server tetap otoritatif saat checkout).
 */

export type NewCartLine = Omit<CartLine, 'id' | 'fingerprint'>;

interface RawOption {
  name?: string;
  option_value_id?: string;
  price_adjustment?: number;
}

interface RawItem {
  product_id?: string;
  product_name?: string;
  product?: { name?: string };
  variant_id?: string | null;
  variant?: { variantId?: string; name?: string; priceAdjustment?: number } | null;
  options?: RawOption[] | string[];
  option_ids?: string[];
  notes?: string | null;
  note?: string | null;
  qty?: number;
  unit_price?: number | string;
  unavailable?: boolean;
}

const toNum = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

function mapOptions(raw: RawOption[] | string[] | undefined): CartOptionSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => {
      if (typeof o === 'string') return { optionValueId: o, name: '', priceAdjustment: 0 };
      return {
        optionValueId: o.option_value_id ?? o.name ?? '',
        name: o.name ?? '',
        priceAdjustment: toNum(o.price_adjustment),
      };
    })
    .filter((o) => o.optionValueId || o.name);
}

function mapVariant(item: RawItem): CartVariantSnapshot | null {
  if (item.variant && item.variant.variantId) {
    return {
      variantId: item.variant.variantId,
      name: item.variant.name ?? '',
      priceAdjustment: toNum(item.variant.priceAdjustment),
    };
  }
  if (item.variant_id) {
    return { variantId: item.variant_id, name: '', priceAdjustment: 0 };
  }
  return null;
}

/** Satu item server → `NewCartLine` (null bila tak ada product_id → tak bisa dipesan). */
export function serverItemToCartLine(item: RawItem): NewCartLine | null {
  if (!item?.product_id) return null;

  const variant = mapVariant(item);
  const options = mapOptions(item.options as RawOption[] | string[] | undefined);
  const unitPrice = toNum(item.unit_price);
  const adjust = (variant?.priceAdjustment ?? 0) + options.reduce((s, o) => s + o.priceAdjustment, 0);
  const basePrice = Math.max(0, unitPrice - adjust);

  return {
    product_id: item.product_id,
    product_name: item.product_name ?? item.product?.name ?? 'Produk',
    variant,
    options,
    note: item.notes ?? item.note ?? undefined,
    qty: Math.max(1, Math.min(99, toNum(item.qty) || 1)),
    base_price: basePrice,
    unit_price: unitPrice,
  };
}

/** Daftar item server → `NewCartLine[]` (item tanpa product_id / `unavailable` dibuang). */
export function serverItemsToCartLines(items: unknown): NewCartLine[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => serverItemToCartLine(it as RawItem))
    .filter((l): l is NewCartLine => l !== null);
}

/** Item yang tidak tersedia (produk nonaktif) dari respons reorder. */
export function unavailableItems(items: CartItemDTO[] | unknown): RawItem[] {
  if (!Array.isArray(items)) return [];
  return (items as RawItem[]).filter((i) => i?.unavailable === true);
}
