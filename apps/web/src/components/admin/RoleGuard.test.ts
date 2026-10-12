import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RoleGuard } from './RoleGuard.js';
import { setSession, clearSession, type SessionUser } from '../../hooks/useAuth.js';
import { render, h } from '../../test/render.js';

/**
 * RoleGuard — RBAC route admin (PRD-FRONTEND §2.1). Membuktikan staff vs owner
 * vs customer: owner lolos semua, kasir lolos shell tapi TIDAK laporan, customer
 * diarahkan ke /login.
 */

function user(role: string, outlet_id?: string | null): SessionUser {
  return { id: 'u1', email: 'x@y.z', full_name: 'Test', role, outlet_id };
}

function renderGuard(allowed?: readonly string[]) {
  return render(
    h(
      MemoryRouter,
      { initialEntries: ['/admin'] },
      h(
        Routes,
        null,
        h(Route, {
          path: '/admin',
          element: h(RoleGuard, { allowed }, h('p', null, 'KONTEN-ADMIN')),
        }),
        h(Route, { path: '/login', element: h('p', null, 'HALAMAN-LOGIN') }),
      ),
    ),
  );
}

beforeEach(() => clearSession());

describe('RoleGuard — belum login', () => {
  it('mengarahkan ke /login', () => {
    const r = renderGuard();
    expect(r.text()).toContain('HALAMAN-LOGIN');
    expect(r.text()).not.toContain('KONTEN-ADMIN');
    r.unmount();
  });
});

describe('RoleGuard — customer (bukan staff)', () => {
  it('member ditolak (403, bukan konten admin)', () => {
    setSession('tok', user('member'));
    const r = renderGuard();
    expect(r.text()).toContain('Akses ditolak');
    expect(r.text()).not.toContain('KONTEN-ADMIN');
    r.unmount();
  });
});

describe('RoleGuard — staff vs owner', () => {
  it('owner lolos shell admin', () => {
    setSession('tok', user('owner'));
    const r = renderGuard();
    expect(r.text()).toContain('KONTEN-ADMIN');
    r.unmount();
  });

  it('kasir lolos shell admin (staff outlet)', () => {
    setSession('tok', user('kasir', 'o1'));
    const r = renderGuard();
    expect(r.text()).toContain('KONTEN-ADMIN');
    r.unmount();
  });

  it('kasir DITOLAK dari route laporan (allowed owner/manager/finance)', () => {
    setSession('tok', user('kasir', 'o1'));
    const r = renderGuard(['owner', 'manager', 'finance']);
    expect(r.text()).toContain('Akses ditolak');
    expect(r.text()).not.toContain('KONTEN-ADMIN');
    r.unmount();
  });

  it('owner lolos route laporan (owner selalu diizinkan)', () => {
    setSession('tok', user('owner'));
    const r = renderGuard(['owner', 'manager', 'finance']);
    expect(r.text()).toContain('KONTEN-ADMIN');
    r.unmount();
  });

  it('manager lolos route laporan', () => {
    setSession('tok', user('manager'));
    const r = renderGuard(['owner', 'manager', 'finance']);
    expect(r.text()).toContain('KONTEN-ADMIN');
    r.unmount();
  });
});
