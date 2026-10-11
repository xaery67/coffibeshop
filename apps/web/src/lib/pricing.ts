/**
 * Pricing Engine — fungsi MURNI & deterministik (PRD-FRONTEND §3.3 & §6.4).
 *
 * Semua nilai uang = integer Rupiah (tanpa desimal) → bebas galat floating point.
 * Dipakai klien untuk PREVIEW instan; server tetap otoritatif saat checkout.
 *
 * Aturan pembulatan (disepakati): pajak di-`round` SEKALI di level total (bukan per line);
 * urutan penerapan: Subtotal → Voucher → Poin → Pajak → Ongkir.
 */

import type { OptionDTO, ProductDTO, VariantDTO } from '@coffibeshop/shared';

export type Money = number;

/** Satu baris yang bisa dihitung harganya (subset dari CartLine). */
export interface PricingLine {
  /** Harga dasar produk (snapshot). */
  basePrice: Money;
  /** Selisih harga varian terpilih (mis. Large +5000). */
  variantDelta?: Money;
  /** Nilai opsi terpilih + penyesuaian harga masing-masing (bisa qty > 1). */
  options?: { priceAdjustment: Money; qty: number }[];
  /** Kuantitas. */
  quantity: number;
}

export interface TotalsInput {
  lines: PricingLine[];
  /** Diskon voucher absolut (Rupiah), sudah dihitung/di-round. */
  voucherDiscount?: Money;
  /** Jumlah poin yang ditukar. */
  pointsToRedeem?: number;
  /** Nilai 1 poin dalam Rupiah (dari GET /config.point_value). */
  pointValue?: Money;
  /** Tarif pajak, mis. 0.11 (dari GET /config.tax_rate). */
  taxRate?: number;
  /** Ongkir flat (hanya saat fulfillment = delivery). */
  deliveryFee?: Money;
}

export interface Totals {
  subtotal: Money;
  discount: Money;
  pointsDiscount: Money;
  tax: Money;
  deliveryFee: Money;
  grandTotal: Money;
}

/** Harga 1 unit dari komponen mentah. */
export function unitPrice(
  basePrice: Money,
  variantDelta: Money = 0,
  options: { priceAdjustment: Money; qty: number }[] = [],
): Money {
  const optionTotal = options.reduce((sum, o) => sum + o.priceAdjustment * o.qty, 0);
  return basePrice + variantDelta + optionTotal;
}

/** Harga 1 unit untuk sebuah baris. */
export function lineUnitPrice(line: PricingLine): Money {
  return unitPrice(line.basePrice, line.variantDelta ?? 0, line.options ?? []);
}

/** Subtotal satu baris = unitPrice × qty. */
export function lineSubtotal(line: PricingLine): Money {
  return lineUnitPrice(line) * line.quantity;
}

/**
 * Hitung total cart. Pajak = round(taxable × rate) SEKALI; `taxable` tidak boleh negatif.
 */
export function computeTotals(input: TotalsInput): Totals {
  const subtotal = input.lines.reduce((sum, l) => sum + lineSubtotal(l), 0);
  const discount = Math.max(0, Math.round(input.voucherDiscount ?? 0));
  const pointsDiscount = Math.max(0, (input.pointsToRedeem ?? 0) * (input.pointValue ?? 0));

  // Poin + voucher tidak boleh melebihi subtotal.
  const taxable = Math.max(0, subtotal - discount - pointsDiscount);
  const tax = Math.round(taxable * (input.taxRate ?? 0));
  const deliveryFee = Math.max(0, Math.round(input.deliveryFee ?? 0));
  const grandTotal = Math.max(0, taxable + tax + deliveryFee);

  return { subtotal, discount, pointsDiscount, tax, deliveryFee, grandTotal };
}

/** Ringkasan opsi terpilih pada PDP (untuk label & harga). */
export interface SelectionState {
  variantId: string | null;
  /** valueId → qty (qty > 1 untuk opsi `multiple`). */
  optionValueIds: string[];
}

export interface SelectionValidation {
  valid: boolean;
  errors: string[];
}

/** Varian aktif saja yang boleh dipilih. */
export function activeVariants(product: Pick<ProductDTO, 'variants'>): VariantDTO[] {
  return (product.variants ?? []).filter((v) => v.is_active);
}

/** Opsi aktif saja yang boleh dipilih. */
export function activeOptions(product: Pick<ProductDTO, 'options'>): OptionDTO[] {
  return (product.options ?? []).filter((o) => o.is_active);
}

/**
 * Validasi pilihan terhadap aturan produk:
 * - opsi `is_required` harus terisi (≥ min_select, minimal 1)
 * - jumlah pilihan ∈ [min_select, max_select]
 * - varian terpilih harus punya stok (stock_quantity null = tidak dilacak)
 */
export function validateSelection(
  product: ProductDTO,
  selection: SelectionState,
): SelectionValidation {
  const errors: string[] = [];

  const variants = activeVariants(product);
  if (variants.length > 0 && selection.variantId) {
    const v = variants.find((x) => x.id === selection.variantId);
    if (!v) {
      errors.push('Varian tidak tersedia.');
    } else if (v.stock_quantity !== null && v.stock_quantity <= 0) {
      errors.push(`Stok varian "${v.name}" habis.`);
    }
  }

  for (const opt of activeOptions(product)) {
    const selected = opt.values.filter((val) => selection.optionValueIds.includes(val.id));
    const min = opt.is_required ? Math.max(1, opt.min_select) : opt.min_select;

    if (selected.length < min) {
      errors.push(`"${opt.name}" wajib dipilih minimal ${min}.`);
    }
    if (selected.length > opt.max_select) {
      errors.push(`"${opt.name}" maksimal ${opt.max_select} pilihan.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Harga 1 unit untuk pilihan pada PDP (base + varian + Σ opsi terpilih).
 * Mengabaikan aturan min/max (validasi terpisah) agar harga tetap bisa dipreview.
 */
export function selectionUnitPrice(
  product: ProductDTO,
  selection: SelectionState,
): Money {
  const variantDelta =
    activeVariants(product).find((v) => v.id === selection.variantId)?.price_delta ?? 0;

  const optionTotal = activeOptions(product).reduce((sum, opt) => {
    const delta = opt.values
      .filter((val) => selection.optionValueIds.includes(val.id))
      .reduce((s, val) => s + val.price_adjustment, 0);
    return sum + delta;
  }, 0);

  return product.base_price + variantDelta + optionTotal;
}

/** Bangun PricingLine dari pilihan PDP (untuk preview di StickyPriceFooter). */
export function selectionToLine(
  product: ProductDTO,
  selection: SelectionState,
  quantity: number,
): PricingLine {
  const variantDelta =
    activeVariants(product).find((v) => v.id === selection.variantId)?.price_delta ?? 0;
  const options = activeOptions(product).flatMap((opt) =>
    opt.values
      .filter((val) => selection.optionValueIds.includes(val.id))
      .map((val) => ({ priceAdjustment: val.price_adjustment, qty: 1 })),
  );
  return { basePrice: product.base_price, variantDelta, options, quantity };
}

/** Format Rupiah terpusat: 84000 → "Rp 84.000". */
export function formatIDR(value: Money): string {
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
}
