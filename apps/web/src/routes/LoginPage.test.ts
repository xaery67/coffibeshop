import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './LoginPage.js';
import { render, h, waitFor } from '../test/render.js';

/**
 * LoginPage — issue #60 (P0): route/halaman login staff hilang.
 * Menguji: render form, submit sukses (setSession + redirect), submit gagal
 * (pesan error dari envelope), dan penghormatan `?next=` (anti open-redirect).
 */

const TOKEN_KEY = 'cs.accessToken';
const USER_KEY = 'cs.user';

const OWNER = {
  id: 'u-owner',
  email: 'owner@coffibeshop.id',
  full_name: 'Owner Coffee',
  role: 'owner',
  outlet_id: null,
};

function okLogin(user = OWNER) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        access_token: 'tok-123',
        refresh_token: 'ref-123',
        token_type: 'Bearer',
        expires_in: 3600,
        user,
        cart_merged: false,
        cart_item_count: 0,
      },
      error: null,
    }),
  } as unknown as Response;
}

function failLogin(message = 'Email/HP atau password salah') {
  return {
    ok: false,
    status: 401,
    json: async () => ({ success: false, data: null, error: { code: 'UNAUTHORIZED', message } }),
  } as unknown as Response;
}

function renderLogin(initialEntry = '/login') {
  return render(
    h(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      h(
        Routes,
        null,
        h(Route, { path: '/login', element: h(LoginPage, null) }),
        h(Route, { path: '/admin', element: h('p', null, 'HALAMAN-ADMIN') }),
        h(Route, { path: '/', element: h('p', null, 'HALAMAN-HOME') }),
      ),
    ),
  );
}

function fillAndSubmit(r: ReturnType<typeof renderLogin>, identity = 'owner@coffibeshop.id', password = 'ChangeMe123!') {
  const inputs = r.$$('input');
  const identityInput = inputs.find((i) => (i as HTMLInputElement).type === 'text')!;
  const passwordInput = inputs.find((i) => (i as HTMLInputElement).type === 'password')!;
  r.setValue(identityInput, identity);
  r.setValue(passwordInput, password);
  const submit = r.$$('button').find((b) => (b as HTMLButtonElement).type === 'submit')!;
  r.clickNode(submit);
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('LoginPage — render', () => {
  it('menampilkan form identitas + password dengan label terhubung', () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = renderLogin();
    expect(r.text()).toContain('Masuk');
    expect(r.$('input[type="text"]')).not.toBeNull();
    expect(r.$('input[type="password"]')).not.toBeNull();
    // Label terhubung ke input (a11y): htmlFor === id elemen (React useId bisa
    // menghasilkan id seperti ':r1:' — bukan selector CSS valid → pakai getElementById).
    const label = r.$$('label').find((l) => l.textContent?.includes('Password'))!;
    const fieldId = label.getAttribute('for')!;
    expect(r.container.querySelector('input[type="password"]')?.id).toBe(fieldId);
    r.unmount();
  });

  it('memakai autoComplete yang benar untuk password manager', () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = renderLogin();
    expect(r.$('input[type="text"]')?.getAttribute('autocomplete')).toBe('username');
    expect(r.$('input[type="password"]')?.getAttribute('autocomplete')).toBe('current-password');
    r.unmount();
  });
});

describe('LoginPage — submit sukses', () => {
  it('memanggil POST /auth/login, menyimpan sesi, dan redirect ke /admin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okLogin());
    vi.stubGlobal('fetch', fetchMock);

    const r = renderLogin();
    fillAndSubmit(r);

    await waitFor(() => expect(r.text()).toContain('HALAMAN-ADMIN'));

    // Endpoint & body sesuai kontrak LoginInput.
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/auth/login');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: 'owner@coffibeshop.id',
      password: 'ChangeMe123!',
    });

    // setSession → localStorage terisi.
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok-123');
    expect(JSON.parse(localStorage.getItem(USER_KEY)!).role).toBe('owner');
    r.unmount();
  });

  it('member (bukan staff) diarahkan ke home customer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okLogin({ ...OWNER, id: 'u-m', role: 'member' })));
    const r = renderLogin();
    fillAndSubmit(r, 'member@example.com', 'Password123');
    await waitFor(() => expect(r.text()).toContain('HALAMAN-HOME'));
    r.unmount();
  });

  it('identitas non-email dikirim sebagai `phone`', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okLogin());
    vi.stubGlobal('fetch', fetchMock);
    const r = renderLogin();
    fillAndSubmit(r, '08123456789', 'Password123');
    await waitFor(() => expect(r.text()).toContain('HALAMAN-ADMIN'));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ phone: '08123456789', password: 'Password123' });
    r.unmount();
  });
});

describe('LoginPage — submit gagal', () => {
  it('menampilkan pesan error dari envelope & tidak menyimpan sesi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failLogin('Email/HP atau password salah')));
    const r = renderLogin();
    fillAndSubmit(r);

    await waitFor(() => expect(r.$('[role="alert"]')).not.toBeNull());
    expect(r.$('[role="alert"]')?.textContent).toContain('Email/HP atau password salah');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    r.unmount();
  });

  it('field kosong → validasi klien tanpa memanggil API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = renderLogin();
    const submit = r.$$('button').find((b) => (b as HTMLButtonElement).type === 'submit')!;
    r.clickNode(submit);

    await waitFor(() => expect(r.$('[aria-invalid="true"]')).not.toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    r.unmount();
  });
});

describe('LoginPage — hormati ?next=', () => {
  it('setelah login kembali ke path `next` (bukan /admin default)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okLogin()));
    const r = renderLogin('/login?next=%2Fadmin');
    fillAndSubmit(r);
    await waitFor(() => expect(r.text()).toContain('HALAMAN-ADMIN'));
    r.unmount();
  });

  it('mengabaikan `next` eksternal (anti open-redirect)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okLogin()));
    // next di-encode menunjuk ke host lain → harus jatuh ke default /admin.
    const r = renderLogin('/login?next=' + encodeURIComponent('https://evil.example.com'));
    fillAndSubmit(r);
    await waitFor(() => expect(r.text()).toContain('HALAMAN-ADMIN'));
    r.unmount();
  });
});
