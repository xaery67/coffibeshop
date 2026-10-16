import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ProductDTO } from '@coffibeshop/shared';
import { ProductCard } from './ProductCard.js';
import { render, h } from '../../test/render.js';

/**
 * ProductCard — tautan PDP memakai **slug** (issue #84, Sprint 5).
 * Backward-compat: bila `slug` null → jatuh ke `id` (link lama tetap valid).
 */

function product(overrides: Partial<ProductDTO> = {}): ProductDTO {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    outlet_id: 'o1',
    name: 'Iced Latte',
    slug: 'iced-latte',
    description: null,
    base_price: 27000,
    image_url: null,
    is_available: true,
    is_active: true,
    category_id: 'c1',
    variants: [],
    options: [],
    ...overrides,
  };
}

function renderCard(p: ProductDTO) {
  return render(h(MemoryRouter, null, h(ProductCard, { product: p })));
}

describe('ProductCard — tautan produk', () => {
  it('memakai slug bila tersedia', () => {
    const r = renderCard(product({ slug: 'iced-latte' }));
    const link = r.$('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/product/iced-latte');
    r.unmount();
  });

  it('fallback ke id bila slug null', () => {
    const r = renderCard(product({ slug: null, id: 'uuid-abc-123' }));
    const link = r.$('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/product/uuid-abc-123');
    r.unmount();
  });

  it('tetap menampilkan nama & harga produk', () => {
    const r = renderCard(product());
    expect(r.text()).toContain('Iced Latte');
    expect(r.text()).toContain('27.000');
    r.unmount();
  });
});
