import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProductDTO } from '@coffibeshop/shared';
import { ProductDetailPage } from './ProductDetailPage.js';
import { render, h, waitFor } from '../test/render.js';

/**
 * ProductDetailPage — rute `/product/:slugOrId` (issue #84, Sprint 5).
 * FE harus mengirim param (slug ATAU id) apa adanya ke
 * `GET /catalog/products/:identifier` — backend menerima keduanya.
 * Backward-compat: `/product/<uuid>` tetap memanggil endpoint yang sama.
 */

const detail: ProductDTO = {
  id: '11111111-1111-4111-8111-111111111111',
  outlet_id: 'o1',
  name: 'Iced Latte',
  slug: 'iced-latte',
  description: 'Espresso dingin dengan susu.',
  base_price: 27000,
  image_url: null,
  is_available: true,
  is_active: true,
  category_id: 'c1',
  variants: [],
  options: [],
};

let fetchMock: ReturnType<typeof vi.fn>;

function wrap(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return h(
    QueryClientProvider,
    { client: qc },
    h(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      h(
        Routes,
        null,
        h(Route, { path: '/product/:slugOrId', element: h(ProductDetailPage, null) }),
      ),
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: detail, error: null }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('ProductDetailPage — param slugOrId', () => {
  it('memanggil API dengan SLUG dari URL', async () => {
    const r = render(wrap('/product/iced-latte'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/catalog/products/iced-latte');
    await waitFor(() => expect(r.text()).toContain('Iced Latte'));
    r.unmount();
  });

  it('backward-compat: URL berisi UUID tetap memanggil endpoint yang sama', async () => {
    const r = render(wrap('/product/11111111-1111-4111-8111-111111111111'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/catalog/products/11111111-1111-4111-8111-111111111111');
    await waitFor(() => expect(r.text()).toContain('Iced Latte'));
    r.unmount();
  });
});
