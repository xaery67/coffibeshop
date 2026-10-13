import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminTopbar } from './AdminTopbar.js';
import { setSession, clearSession, type SessionUser } from '../../hooks/useAuth.js';
import { render, h } from '../../test/render.js';

/**
 * AdminTopbar — tombol Keluar sesi staf/owner (issue #64).
 *
 * Menguji perilaku nyata (tanpa mock): klik "Keluar" memanggil `logout()`
 * (menghapus `cs.accessToken`/`cs.user`) lalu bernavigasi ke `/login`.
 */

const OWNER: SessionUser = {
  id: 'u-owner',
  email: 'owner@coffibeshop.id',
  full_name: 'Owner Demo',
  role: 'owner',
  outlet_id: null,
};

const OUTLETS = [{ id: 'o1', name: 'CoffeeShop Pusat — Jakarta' }] as never;

function renderTopbar(role: string | null = 'owner') {
  return render(
    h(
      MemoryRouter,
      { initialEntries: ['/admin'] },
      h(
        Routes,
        null,
        h(Route, {
          path: '/admin',
          element: h(AdminTopbar, {
            title: 'Dashboard',
            outlets: OUTLETS,
            outletId: 'o1',
            outletName: 'CoffeeShop Pusat — Jakarta',
            onOutletChange: () => {},
            outletLocked: false,
            role,
          }),
        }),
        h(Route, { path: '/login', element: h('p', null, 'HALAMAN-LOGIN') }),
        h(Route, { path: '/', element: h('p', null, 'HALAMAN-TOKO') }),
      ),
    ),
  );
}

beforeEach(() => clearSession());

describe('AdminTopbar — tombol Keluar (logout sesi admin)', () => {
  it('menampilkan tombol "Keluar" untuk staf/owner', () => {
    setSession('tok-owner', OWNER);
    const r = renderTopbar('owner');
    const btn = r.$('button[aria-label="Keluar"]');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain('Keluar');
    // Touch target ≥44px.
    expect(btn?.className).toMatch(/min-h-\[44px\]/);
    r.unmount();
  });

  it('tetap mempertahankan link "← Toko"', () => {
    setSession('tok-owner', OWNER);
    const r = renderTopbar('owner');
    const store = r.$$('a').find((a) => a.textContent?.includes('← Toko'));
    expect(store?.getAttribute('href')).toBe('/');
    r.unmount();
  });

  it('klik Keluar menghapus sesi & mendarat di /login', () => {
    setSession('tok-owner', OWNER);
    expect(localStorage.getItem('cs.accessToken')).toBe('tok-owner');

    const r = renderTopbar('owner');
    r.clickNode(r.$('button[aria-label="Keluar"]')!);

    // Sesi terhapus.
    expect(localStorage.getItem('cs.accessToken')).toBeNull();
    expect(localStorage.getItem('cs.user')).toBeNull();
    // Navigasi ke halaman login (bukan konten admin).
    expect(r.text()).toContain('HALAMAN-LOGIN');
    expect(r.text()).not.toContain('HALAMAN-TOKO');
    r.unmount();
  });

  it('tersedia juga untuk kasir (staff outlet)', () => {
    setSession('tok-kasir', { ...OWNER, id: 'u-k', role: 'kasir', outlet_id: 'o1' });
    const r = renderTopbar('kasir');
    expect(r.$('button[aria-label="Keluar"]')).not.toBeNull();
    r.clickNode(r.$('button[aria-label="Keluar"]')!);
    expect(localStorage.getItem('cs.accessToken')).toBeNull();
    expect(r.text()).toContain('HALAMAN-LOGIN');
    r.unmount();
  });
});
