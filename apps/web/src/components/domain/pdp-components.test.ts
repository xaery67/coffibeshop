import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OptionChipGroup } from './OptionChipGroup.js';
import { StickyPriceFooter } from './StickyPriceFooter.js';
import { PriceText } from './PriceText.js';
import { render, h } from '../../test/render.js';
import type { OptionDTO } from '@coffibeshop/shared';

/**
 * Komponen kustomisasi PDP — OptionChipGroup, StickyPriceFooter, PriceText
 * (issue #18 poin 2, PRD-FRONTEND §6.3/§6.4).
 */

beforeEach(() => {
  document.body.innerHTML = '';
});

const singleOption: OptionDTO = {
  id: 'opt-shot',
  name: 'Extra Shot',
  option_type: 'single',
  min_select: 0,
  max_select: 1,
  is_required: false,
  sort_order: 1,
  is_active: true,
  values: [
    { id: 'shot-no', value: 'Tanpa Extra Shot', price_adjustment: 0, stock_code: null, sort_order: 1, is_active: true },
    { id: 'shot-yes', value: 'Extra Shot', price_adjustment: 5000, stock_code: null, sort_order: 2, is_active: true },
  ],
};

const multiOption: OptionDTO = {
  ...singleOption,
  id: 'opt-topping',
  name: 'Topping',
  option_type: 'multiple',
  max_select: 1,
  values: [
    { id: 't1', value: 'Boba', price_adjustment: 3000, stock_code: null, sort_order: 1, is_active: true },
    { id: 't2', value: 'Jelly', price_adjustment: 3000, stock_code: null, sort_order: 2, is_active: true },
  ],
};

describe('OptionChipGroup — single (radio)', () => {
  it('merender semua nilai opsi', () => {
    const r = render(h(OptionChipGroup, { option: singleOption, selectedIds: [], onToggle: () => {} }));
    expect(r.text()).toContain('Tanpa Extra Shot');
    expect(r.text()).toContain('Extra Shot');
    r.unmount();
  });

  it('role radio + aria-checked mencerminkan pilihan', () => {
    const r = render(h(OptionChipGroup, { option: singleOption, selectedIds: ['shot-yes'], onToggle: () => {} }));
    const radios = r.$$('[role="radio"]');
    // Urutan nilai: [0] Tanpa Extra Shot, [1] Extra Shot.
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].getAttribute('aria-checked')).toBe('false');
    // Chip terpilih menampilkan ikon centang (bukan warna saja — WCAG 1.4.1).
    expect(radios[1].querySelector('[aria-hidden="true"]')?.textContent).toBe('✓');
    r.unmount();
  });

  it('klik memanggil onToggle dengan valueId', () => {
    const onToggle = vi.fn();
    const r = render(h(OptionChipGroup, { option: singleOption, selectedIds: [], onToggle }));
    r.click('[role="radio"]', 1);
    expect(onToggle).toHaveBeenCalledWith('shot-yes');
    r.unmount();
  });

  it('menampilkan penyesuaian harga untuk opsi berbayar', () => {
    const r = render(h(OptionChipGroup, { option: singleOption, selectedIds: [], onToggle: () => {} }));
    expect(r.text()).toContain('+Rp 5.000');
    r.unmount();
  });

  it('menandai opsi wajib dengan label (wajib)', () => {
    const r = render(h(OptionChipGroup, { option: { ...singleOption, is_required: true }, selectedIds: [], onToggle: () => {} }));
    expect(r.text()).toContain('(wajib)');
    r.unmount();
  });
});

describe('OptionChipGroup — multiple (checkbox, max_select)', () => {
  it('role checkbox & radiogroup vs group sesuai tipe', () => {
    const r = render(h(OptionChipGroup, { option: multiOption, selectedIds: [], onToggle: () => {} }));
    expect(r.$$('[role="checkbox"]').length).toBe(2);
    expect(r.$('[role="group"]')).toBeTruthy();
    r.unmount();
  });

  it('menonaktifkan nilai lain saat max_select tercapai', () => {
    const r = render(h(OptionChipGroup, { option: multiOption, selectedIds: ['t1'], onToggle: () => {} }));
    const checkboxes = r.$$('[role="checkbox"]') as HTMLButtonElement[];
    const t1 = checkboxes.find((el) => el.textContent?.includes('Boba'))!;
    const t2 = checkboxes.find((el) => el.textContent?.includes('Jelly'))!;
    expect(t1.disabled).toBe(false); // sudah dipilih → tetap bisa di-uncheck
    expect(t2.disabled).toBe(true); // max tercapai & belum dipilih → disabled
    r.unmount();
  });

  it('menampilkan "maks N" pada opsi multiple', () => {
    const r = render(h(OptionChipGroup, { option: multiOption, selectedIds: [], onToggle: () => {} }));
    expect(r.text()).toContain('maks 1');
    r.unmount();
  });
});

describe('StickyPriceFooter', () => {
  it('menampilkan harga & label tombol', () => {
    const r = render(h(StickyPriceFooter, { unitPrice: 37000, onAdd: () => {} }));
    expect(r.text()).toContain('Rp 37.000');
    expect(r.text()).toContain('Tambah');
    r.unmount();
  });

  it('tombol aktif memanggil onAdd', () => {
    const onAdd = vi.fn();
    const r = render(h(StickyPriceFooter, { unitPrice: 37000, onAdd }));
    r.click('button');
    expect(onAdd).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('disabled menonaktifkan tombol & menampilkan alasan', () => {
    const onAdd = vi.fn();
    const r = render(
      h(StickyPriceFooter, { unitPrice: 0, disabled: true, disabledReason: 'Pilih gula dulu', onAdd }),
    );
    expect((r.$('button') as HTMLButtonElement).disabled).toBe(true);
    expect(r.text()).toContain('Pilih gula dulu');
    r.click('button');
    expect(onAdd).not.toHaveBeenCalled();
    r.unmount();
  });

  it('alasan disabled memakai role alert (a11y)', () => {
    const r = render(h(StickyPriceFooter, { unitPrice: 0, disabled: true, disabledReason: 'X', onAdd: () => {} }));
    expect(r.$('[role="alert"]')).toBeTruthy();
    r.unmount();
  });
});

describe('PriceText', () => {
  it('memformat Rupiah', () => {
    const r = render(h(PriceText, { value: 82140 }));
    expect(r.text()).toBe('Rp 82.140');
    r.unmount();
  });

  it('ukuran lg menambahkan kelas text-xl', () => {
    const r = render(h(PriceText, { value: 1000, size: 'lg' }));
    expect(r.$('span')!.className).toContain('text-xl');
    r.unmount();
  });

  it('memakai tabular-nums (lebar angka stabil)', () => {
    const r = render(h(PriceText, { value: 1000 }));
    expect(r.$('span')!.className).toContain('tabular-nums');
    r.unmount();
  });
});
