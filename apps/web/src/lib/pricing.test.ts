import { describe, it, expect } from 'vitest';
import type { ProductDTO } from '@coffibeshop/shared';
import {
  unitPrice,
  lineUnitPrice,
  lineSubtotal,
  computeTotals,
  selectionUnitPrice,
  selectionToLine,
  validateSelection,
  formatIDR,
} from './pricing.js';

/** Fixture Latte — 2 varian + 2 opsi (Extra Shot, Sugar Level), sesuai seed dev. */
const latte: ProductDTO = {
  id: 'p-latte',
  outlet_id: 'o1',
  name: 'Latte',
  slug: 'latte',
  description: null,
  base_price: 27000,
  image_url: null,
  is_available: true,
  is_active: true,
  category_id: 'c1',
  variants: [
    { id: 'v-reg', name: 'Regular', sku: 'LATTE-REG', price_delta: 0, stock_quantity: 100, sort_order: 1, is_active: true },
    { id: 'v-lrg', name: 'Large', sku: 'LATTE-LRG', price_delta: 5000, stock_quantity: 0, sort_order: 2, is_active: true },
  ],
  options: [
    {
      id: 'opt-shot', name: 'Extra Shot', option_type: 'single', min_select: 0, max_select: 1,
      is_required: false, sort_order: 1, is_active: true,
      values: [
        { id: 'shot-no', value: 'Tanpa Extra Shot', price_adjustment: 0, stock_code: null, sort_order: 1, is_active: true },
        { id: 'shot-yes', value: 'Extra Shot', price_adjustment: 5000, stock_code: null, sort_order: 2, is_active: true },
      ],
    },
    {
      id: 'opt-sugar', name: 'Sugar Level', option_type: 'single', min_select: 1, max_select: 1,
      is_required: true, sort_order: 2, is_active: true,
      values: [
        { id: 'sugar-normal', value: 'Normal Sugar', price_adjustment: 0, stock_code: null, sort_order: 1, is_active: true },
        { id: 'sugar-less', value: 'Less Sugar', price_adjustment: 0, stock_code: null, sort_order: 2, is_active: true },
      ],
    },
  ],
};

describe('pricing engine — unitPrice / line', () => {
  it('base + varian + opsi', () => {
    expect(unitPrice(27000, 5000, [{ priceAdjustment: 5000, qty: 1 }])).toBe(37000);
  });

  it('lineUnitPrice menggabungkan varian & opsi', () => {
    expect(
      lineUnitPrice({ basePrice: 27000, variantDelta: 5000, options: [{ priceAdjustment: 5000, qty: 1 }], quantity: 1 }),
    ).toBe(37000);
  });

  it('lineSubtotal = unitPrice × qty', () => {
    expect(lineSubtotal({ basePrice: 25000, quantity: 3 })).toBe(75000);
  });

  it('opsi dengan qty > 1 dikalikan', () => {
    expect(lineUnitPrice({ basePrice: 10000, options: [{ priceAdjustment: 2000, qty: 2 }], quantity: 1 })).toBe(14000);
  });
});

describe('pricing engine — computeTotals', () => {
  it('golden test PRD: 84.000 − 10.000 → pajak 8.140 → 82.140', () => {
    const t = computeTotals({
      lines: [{ basePrice: 28000, quantity: 3 }], // 84.000
      voucherDiscount: 10000,
      taxRate: 0.11,
    });
    expect(t.subtotal).toBe(84000);
    expect(t.discount).toBe(10000);
    expect(t.tax).toBe(8140); // round(74000 × 0.11)
    expect(t.grandTotal).toBe(82140);
  });

  it('urutan Subtotal → Voucher → Poin → Pajak → Ongkir', () => {
    const t = computeTotals({
      lines: [{ basePrice: 50000, quantity: 1 }],
      voucherDiscount: 5000,
      pointsToRedeem: 100,
      pointValue: 1,
      taxRate: 0.1,
      deliveryFee: 10000,
    });
    expect(t.subtotal).toBe(50000);
    expect(t.discount).toBe(5000);
    expect(t.pointsDiscount).toBe(100);
    // taxable = 50000 - 5000 - 100 = 44900 → tax = 4490
    expect(t.tax).toBe(4490);
    expect(t.grandTotal).toBe(44900 + 4490 + 10000);
  });

  it('diskon voucher tidak boleh membuat taxable negatif', () => {
    const t = computeTotals({ lines: [{ basePrice: 10000, quantity: 1 }], voucherDiscount: 99999, taxRate: 0.11 });
    expect(t.subtotal).toBe(10000);
    expect(t.discount).toBe(99999);
    expect(t.tax).toBe(0);
    expect(t.grandTotal).toBe(0);
  });

  it('poin + voucher melebihi subtotal → taxable = 0', () => {
    const t = computeTotals({
      lines: [{ basePrice: 10000, quantity: 1 }],
      voucherDiscount: 8000,
      pointsToRedeem: 5000,
      pointValue: 1,
      taxRate: 0.11,
    });
    expect(t.tax).toBe(0);
    expect(t.grandTotal).toBe(0);
  });

  it('tanpa ongkir (non-delivery) → deliveryFee 0', () => {
    const t = computeTotals({ lines: [{ basePrice: 20000, quantity: 1 }], taxRate: 0.11 });
    expect(t.deliveryFee).toBe(0);
    expect(t.grandTotal).toBe(20000 + 2200);
  });

  it('cart kosong → semua nol', () => {
    const t = computeTotals({ lines: [] });
    expect(t).toEqual({ subtotal: 0, discount: 0, pointsDiscount: 0, tax: 0, deliveryFee: 0, grandTotal: 0 });
  });
});

describe('pricing engine — selection PDP', () => {
  it('harga mengikuti varian + opsi terpilih', () => {
    expect(selectionUnitPrice(latte, { variantId: 'v-lrg', optionValueIds: ['shot-yes', 'sugar-less'] })).toBe(
      27000 + 5000 + 5000,
    );
  });

  it('harga dasar tanpa pilihan = base_price', () => {
    expect(selectionUnitPrice(latte, { variantId: null, optionValueIds: [] })).toBe(27000);
  });

  it('selectionToLine menghasilkan line yang setara', () => {
    const line = selectionToLine(latte, { variantId: 'v-lrg', optionValueIds: ['shot-yes', 'sugar-normal'] }, 2);
    expect(lineUnitPrice(line)).toBe(37000);
    expect(lineSubtotal(line)).toBe(74000);
  });

  it('validasi gagal saat opsi wajib belum dipilih', () => {
    const r = validateSelection(latte, { variantId: 'v-reg', optionValueIds: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Sugar Level'))).toBe(true);
  });

  it('validasi gagal saat stok varian habis', () => {
    const r = validateSelection(latte, { variantId: 'v-lrg', optionValueIds: ['sugar-normal'] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Stok'))).toBe(true);
  });

  it('validasi lolos untuk pilihan lengkap & stok ada', () => {
    const r = validateSelection(latte, { variantId: 'v-reg', optionValueIds: ['shot-yes', 'sugar-normal'] });
    expect(r).toEqual({ valid: true, errors: [] });
  });
});

describe('formatIDR', () => {
  it('format Rupiah dengan pemisah ribuan', () => {
    expect(formatIDR(82140)).toBe('Rp 82.140');
    expect(formatIDR(0)).toBe('Rp 0');
  });
});
