import { describe, it, expect } from 'vitest';
import type { ProductDTO } from '@coffibeshop/shared';
import {
  computeTotals,
  unitPrice,
  lineSubtotal,
  activeVariants,
  activeOptions,
  selectionUnitPrice,
  validateSelection,
  formatIDR,
} from './pricing.js';

/**
 * Pricing engine — perluasan (issue #18 poin 2).
 * Fokus golden PRD, urutan penerapan diskon, pembulatan, dan konsistensi
 * dengan nilai yang dihitung server (cart.service) agar FE==BE.
 */

describe('pricing — golden & pembulatan', () => {
  it('GOLDEN: 74.000 + pajak 8.140 = 82.140', () => {
    const t = computeTotals({ lines: [{ basePrice: 37000, quantity: 2 }], taxRate: 0.11 });
    expect(t.subtotal).toBe(74000);
    expect(t.tax).toBe(8140);
    expect(t.grandTotal).toBe(82140);
  });

  it('pajak dibulatkan sekali di level total (bukan per line)', () => {
    // Dua line yang bila dibulatkan per-line akan berbeda.
    const t = computeTotals({
      lines: [
        { basePrice: 3333, quantity: 1 },
        { basePrice: 3333, quantity: 1 },
      ],
      taxRate: 0.11,
    });
    expect(t.subtotal).toBe(6666);
    expect(t.tax).toBe(Math.round(6666 * 0.11)); // 733
  });

  it('taxRate 0 → tanpa pajak', () => {
    const t = computeTotals({ lines: [{ basePrice: 50000, quantity: 1 }], taxRate: 0 });
    expect(t.tax).toBe(0);
    expect(t.grandTotal).toBe(50000);
  });

  it('delivery fee ditambahkan SETELAH pajak', () => {
    const t = computeTotals({
      lines: [{ basePrice: 74000, quantity: 1 }],
      taxRate: 0.11,
      deliveryFee: 10000,
    });
    expect(t.tax).toBe(8140);
    expect(t.grandTotal).toBe(74000 + 8140 + 10000);
  });

  it('pointsDiscount = points × pointValue', () => {
    const t = computeTotals({
      lines: [{ basePrice: 50000, quantity: 1 }],
      pointsToRedeem: 200,
      pointValue: 100,
      taxRate: 0,
    });
    expect(t.pointsDiscount).toBe(20000);
    expect(t.grandTotal).toBe(30000);
  });

  it('urutan penuh: subtotal → voucher → poin → pajak → ongkir', () => {
    const t = computeTotals({
      lines: [{ basePrice: 100000, quantity: 1 }],
      voucherDiscount: 10000,
      pointsToRedeem: 100,
      pointValue: 10,
      taxRate: 0.11,
      deliveryFee: 10000,
    });
    // taxable = 100000 - 10000 - 1000 = 89000 → tax 9790
    expect(t.tax).toBe(9790);
    expect(t.grandTotal).toBe(89000 + 9790 + 10000);
  });
});

describe('pricing — line & unit', () => {
  it('unitPrice menjumlahkan varian + opsi×qty', () => {
    expect(unitPrice(27000, 5000, [{ priceAdjustment: 3000, qty: 2 }])).toBe(38000);
  });

  it('lineSubtotal = unit × qty', () => {
    expect(lineSubtotal({ basePrice: 37000, quantity: 2 })).toBe(74000);
  });

  it('qty besar tetap integer (tidak ada galat floating)', () => {
    const t = computeTotals({ lines: [{ basePrice: 12345, quantity: 7 }], taxRate: 0.11 });
    expect(Number.isInteger(t.subtotal)).toBe(true);
    expect(Number.isInteger(t.tax)).toBe(true);
    expect(Number.isInteger(t.grandTotal)).toBe(true);
  });
});

describe('pricing — varian/opsi aktif', () => {
  const product = {
    base_price: 27000,
    variants: [
      { id: 'v1', price_delta: 0, is_active: true, stock_quantity: 10 },
      { id: 'v2', price_delta: 5000, is_active: false, stock_quantity: 10 },
    ],
    options: [
      { id: 'o1', is_active: true, values: [{ id: 'ov1', price_adjustment: 5000 }] },
      { id: 'o2', is_active: false, values: [{ id: 'ov2', price_adjustment: 9999 }] },
    ],
  } as unknown as ProductDTO;

  it('activeVariants menyaring varian non-aktif', () => {
    expect(activeVariants(product).map((v) => v.id)).toEqual(['v1']);
  });

  it('activeOptions menyaring opsi non-aktif', () => {
    expect(activeOptions(product).map((o) => o.id)).toEqual(['o1']);
  });

  it('selectionUnitPrice hanya menghitung varian/opsi aktif', () => {
    expect(selectionUnitPrice(product, { variantId: 'v1', optionValueIds: ['ov1'] })).toBe(32000);
  });
});

describe('pricing — validasi & format', () => {
  it('validateSelection gagal saat varian nonaktif dipilih', () => {
    const product = {
      variants: [{ id: 'v1', name: 'Regular', price_delta: 0, stock_quantity: 5, is_active: true }],
      options: [],
    } as unknown as ProductDTO;
    const r = validateSelection(product, { variantId: 'v-tidak-ada', optionValueIds: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Varian tidak tersedia'))).toBe(true);
  });

  it('formatIDR pakai pemisah ribuan id-ID', () => {
    expect(formatIDR(82140)).toBe('Rp 82.140');
    expect(formatIDR(1000000)).toBe('Rp 1.000.000');
    expect(formatIDR(0)).toBe('Rp 0');
  });
});
