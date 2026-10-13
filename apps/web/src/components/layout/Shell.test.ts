import { describe, it, expect, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Header, BottomNav } from './Shell.js';
import { render, h } from '../../test/render.js';
import { setSession } from '../../hooks/useAuth.js';
import { useCartStore } from '../../stores/cart.store.js';

/**
 * Shell responsive (issue #65, PRD-FRONTEND §7.2):
 * - BottomNav: 4 tab, ikon+label, tab aktif `aria-current="page"`, touch ≥44px.
 * - Header: hanya brand + ikon keranjang/akun (tanpa nav horizontal) + Masuk/Keluar.
 */

function renderAt(el: ReactElement, path = '/') {
  return render(h(MemoryRouter, { initialEntries: [path] }, el));
}

beforeEach(() => {
  localStorage.clear();
  useCartStore.setState({ items: [], fulfillment: 'pickup' });
});

describe('BottomNav — navigasi utama mobile', () => {
  it('menampilkan 4 tab dengan tautan & label yang benar', () => {
    const r = renderAt(h(BottomNav, null));
    const links = r.$$('a');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/menu', '/orders', '/profile']);
    const text = r.text();
    for (const label of ['Home', 'Menu', 'Pesanan', 'Profil']) expect(text).toContain(label);
    r.unmount();
  });

  it('memakai landmark <nav aria-label="Navigasi utama">', () => {
    const r = renderAt(h(BottomNav, null));
    expect(r.$('nav[aria-label="Navigasi utama"]')).not.toBeNull();
    r.unmount();
  });

  it('menandai tab aktif dengan aria-current="page" (Home di "/")', () => {
    const r = renderAt(h(BottomNav, null), '/');
    const home = r.$$('a').find((a) => a.getAttribute('href') === '/')!;
    const menu = r.$$('a').find((a) => a.getAttribute('href') === '/menu')!;
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(menu.getAttribute('aria-current')).toBeNull();
    r.unmount();
  });

  it('memindahkan penanda aktif saat berada di /orders', () => {
    const r = renderAt(h(BottomNav, null), '/orders');
    const orders = r.$$('a').find((a) => a.getAttribute('href') === '/orders')!;
    expect(orders.getAttribute('aria-current')).toBe('page');
    r.unmount();
  });

  it('tiap tab punya target sentuh ≥44px (min-h & min-w pada kelas)', () => {
    const r = renderAt(h(BottomNav, null));
    for (const a of r.$$('a')) {
      expect(a.className).toMatch(/min-h-\[/);
    }
    r.unmount();
  });
});

describe('Header — brand + ikon aksi (tanpa nav horizontal)', () => {
  it('tidak lagi memuat nav horizontal 4 item', () => {
    const r = renderAt(h(Header, null));
    // Nav utama kini hanya di BottomNav.
    expect(r.$('header nav')).toBeNull();
    // Brand tetap ada.
    expect(r.text()).toContain('CoffeeShop');
    r.unmount();
  });

  it('tamu melihat ikon Masuk (tautan /login) & ikon keranjang', () => {
    const r = renderAt(h(Header, null));
    const login = r.$('a[aria-label="Masuk"]');
    expect(login?.getAttribute('href')).toBe('/login');
    expect(r.$('a[aria-label^="Keranjang"]')).not.toBeNull();
    expect(r.$('button[aria-label="Keluar"]')).toBeNull();
    r.unmount();
  });

  it('pengguna login melihat tombol Keluar yang menghapus sesi', () => {
    setSession('tok-abc', { id: 'u1', email: 'a@b.c', full_name: 'Ada', role: 'member' });
    const r = renderAt(h(Header, null));
    const logout = r.$('button[aria-label="Keluar"]');
    expect(logout).not.toBeNull();
    expect(r.$('a[aria-label="Masuk"]')).toBeNull();

    r.clickNode(logout!);
    expect(localStorage.getItem('cs.accessToken')).toBeNull();
    r.unmount();
  });

  it('badge keranjang menampilkan total qty', () => {
    const { add } = useCartStore.getState();
    add({ product_id: 'p1', product_name: 'Latte', options: [], qty: 2, base_price: 32000, unit_price: 32000 });
    add({ product_id: 'p2', product_name: 'Americano', options: [], qty: 1, base_price: 25000, unit_price: 25000 });
    const r = renderAt(h(Header, null));
    const cart = r.$('a[aria-label^="Keranjang"]');
    expect(cart?.getAttribute('aria-label')).toBe('Keranjang, 3 item');
    r.unmount();
  });
});
