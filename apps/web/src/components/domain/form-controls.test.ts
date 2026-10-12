import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuantityStepper } from './QuantityStepper.js';
import { Button } from '../ui/Button.js';
import { render, h } from '../../test/render.js';

/**
 * Komponen form — QuantityStepper & Button (issue #18 poin 2).
 * Fokus: interaksi (klik), batas min/max, aksesibilitas (aria), target sentuh 44px.
 */

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('QuantityStepper', () => {
  it('menampilkan nilai awal', () => {
    const r = render(h(QuantityStepper, { value: 2, onChange: () => {} }));
    expect(r.text()).toContain('2');
    r.unmount();
  });

  it('tombol + memanggil onChange(value+1)', () => {
    const onChange = vi.fn();
    const r = render(h(QuantityStepper, { value: 2, onChange }));
    r.click('[aria-label="Tambah"]');
    expect(onChange).toHaveBeenCalledWith(3);
    r.unmount();
  });

  it('tombol − memanggil onChange(value-1)', () => {
    const onChange = vi.fn();
    const r = render(h(QuantityStepper, { value: 2, onChange }));
    r.click('[aria-label="Kurangi"]');
    expect(onChange).toHaveBeenCalledWith(1);
    r.unmount();
  });

  it('tombol − nonaktif saat value = min', () => {
    const r = render(h(QuantityStepper, { value: 1, min: 1, onChange: () => {} }));
    const dec = r.$('[aria-label="Kurangi"]') as HTMLButtonElement;
    expect(dec.disabled).toBe(true);
    r.unmount();
  });

  it('tombol + nonaktif saat value = max', () => {
    const r = render(h(QuantityStepper, { value: 99, max: 99, onChange: () => {} }));
    const inc = r.$('[aria-label="Tambah"]') as HTMLButtonElement;
    expect(inc.disabled).toBe(true);
    r.unmount();
  });

  it('menghormati min & max kustom (tidak melampaui)', () => {
    const onChange = vi.fn();
    const r = render(h(QuantityStepper, { value: 5, min: 2, max: 5, onChange }));
    // value=max → + nonaktif, − aktif memanggil 4
    r.click('[aria-label="Kurangi"]');
    expect(onChange).toHaveBeenCalledWith(4);
    expect((r.$('[aria-label="Tambah"]') as HTMLButtonElement).disabled).toBe(true);
    r.unmount();
  });

  it('punya aria-label grup & live region (aksesibilitas)', () => {
    const r = render(h(QuantityStepper, { value: 1, onChange: () => {}, label: 'Kuantitas Latte' }));
    expect(r.$('[role="group"]')?.getAttribute('aria-label')).toBe('Kuantitas Latte');
    expect(r.$('[aria-live="polite"]')).toBeTruthy();
    r.unmount();
  });
});

describe('Button', () => {
  it('merender children & menangani klik', () => {
    const onClick = vi.fn();
    const r = render(h(Button, { onClick }, 'Pesan'));
    expect(r.text()).toContain('Pesan');
    r.click('button');
    expect(onClick).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('loading menonaktifkan tombol & menandai aria-busy', () => {
    const r = render(h(Button, { loading: true }, 'Memproses'));
    const btn = r.$('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    r.unmount();
  });

  it('disabled tidak memanggil onClick', () => {
    const onClick = vi.fn();
    const r = render(h(Button, { disabled: true, onClick }, 'X'));
    r.click('button');
    expect(onClick).not.toHaveBeenCalled();
    r.unmount();
  });

  it('block menambahkan w-full', () => {
    const r = render(h(Button, { block: true }, 'X'));
    expect(r.$('button')!.className).toContain('w-full');
    r.unmount();
  });

  it('variant danger memakai kelas error', () => {
    const r = render(h(Button, { variant: 'danger' }, 'Hapus'));
    expect(r.$('button')!.className).toContain('bg-error');
    r.unmount();
  });
});
