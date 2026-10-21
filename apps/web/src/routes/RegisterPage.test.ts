import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RegisterPage } from './RegisterPage.js';
import { render, h, waitFor } from '../test/render.js';

/**
 * RegisterPage — form pendaftaran member (issue #60 lanjutan).
 * Menguji: render form, validasi klien (password/konfirmasi/email/HP), submit
 * sukses (setSession + redirect), dan pesan error dari envelope backend.
 */

const TOKEN_KEY = 'cs.accessToken';
const USER_KEY = 'cs.user';

const MEMBER = {
  id: 'u-member',
  email: 'baru@example.com',
  full_name: 'Budi Baru',
  role: 'member',
  outlet_id: null,
};

function okRegister(user = MEMBER) {
  return {
    ok: true,
    status: 201,
    json: async () => ({
      success: true,
      data: {
        access_token: 'tok-reg',
        refresh_token: 'ref-reg',
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

function failRegister(message = 'Email sudah terdaftar') {
  return {
    ok: false,
    status: 409,
    json: async () => ({ success: false, data: null, error: { code: 'CONFLICT', message } }),
  } as unknown as Response;
}

function renderRegister(initialEntry = '/register') {
  return render(
    h(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      h(
        Routes,
        null,
        h(Route, { path: '/register', element: h(RegisterPage, null) }),
        h(Route, { path: '/login', element: h('p', null, 'HALAMAN-LOGIN') }),
        h(Route, { path: '/', element: h('p', null, 'HALAMAN-HOME') }),
      ),
    ),
  );
}

/** Isi form: nama, email, [phone], password, konfirmasi. */
function fillForm(
  r: ReturnType<typeof renderRegister>,
  values: { name?: string; email?: string; phone?: string; password?: string; confirm?: string } = {},
) {
  const name = values.name ?? 'Budi Baru';
  const email = values.email ?? 'baru@example.com';
  const phone = values.phone ?? '';
  const password = values.password ?? 'Password123';
  const confirm = values.confirm ?? password;

  const byType = (t: string) => r.$$('input').find((i) => (i as HTMLInputElement).type === t)!;
  r.setValue(byType('text'), name);
  r.setValue(byType('email'), email);
  if (phone) r.setValue(byType('tel'), phone);
  const pwds = r.$$('input').filter((i) => (i as HTMLInputElement).type === 'password');
  r.setValue(pwds[0], password);
  r.setValue(pwds[1], confirm);

  const submit = r.$$('button').find((b) => (b as HTMLButtonElement).type === 'submit')!;
  r.clickNode(submit);
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('RegisterPage — render', () => {
  it('menampilkan form daftar (nama, email, HP, password, konfirmasi)', () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = renderRegister();
    expect(r.text()).toContain('Daftar');
    expect(r.$('input[type="text"]')).not.toBeNull();
    expect(r.$('input[type="email"]')).not.toBeNull();
    expect(r.$('input[type="tel"]')).not.toBeNull();
    expect(r.$$('input[type="password"]')).toHaveLength(2);
    r.unmount();
  });

  it('menyediakan tautan ke halaman Masuk', () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = renderRegister();
    const link = r.$$('a').find((a) => a.getAttribute('href')?.startsWith('/login'));
    expect(link).toBeTruthy();
    r.unmount();
  });
});

describe('RegisterPage — submit sukses', () => {
  it('memanggil POST /auth/register, menyimpan sesi, dan redirect ke home', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okRegister());
    vi.stubGlobal('fetch', fetchMock);

    const r = renderRegister();
    fillForm(r);

    await waitFor(() => expect(r.text()).toContain('HALAMAN-HOME'));

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/auth/register');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      full_name: 'Budi Baru',
      email: 'baru@example.com',
      password: 'Password123',
    });

    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok-reg');
    expect(JSON.parse(localStorage.getItem(USER_KEY)!).role).toBe('member');
    r.unmount();
  });

  it('menyertakan phone bila diisi', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okRegister());
    vi.stubGlobal('fetch', fetchMock);
    const r = renderRegister();
    fillForm(r, { phone: '08123456789' });
    await waitFor(() => expect(r.text()).toContain('HALAMAN-HOME'));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.phone).toBe('08123456789');
    r.unmount();
  });
});

describe('RegisterPage — validasi klien', () => {
  it('password < 8 karakter → error tanpa memanggil API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = renderRegister();
    fillForm(r, { password: 'abc1' });
    await waitFor(() => expect(r.$('[aria-invalid="true"]')).not.toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    r.unmount();
  });

  it('konfirmasi password tidak sama → error', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = renderRegister();
    fillForm(r, { password: 'Password123', confirm: 'Password999' });
    await waitFor(() => expect(r.text()).toContain('tidak sama'));
    expect(fetchMock).not.toHaveBeenCalled();
    r.unmount();
  });

  it('email tidak valid → error', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = renderRegister();
    fillForm(r, { email: 'bukan-email' });
    await waitFor(() => expect(r.$('[aria-invalid="true"]')).not.toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    r.unmount();
  });

  it('nomor HP tidak valid (bila diisi) → error', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = renderRegister();
    fillForm(r, { phone: '123' });
    await waitFor(() => expect(r.$('[aria-invalid="true"]')).not.toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    r.unmount();
  });
});

describe('RegisterPage — submit gagal', () => {
  it('menampilkan pesan error dari envelope (mis. email sudah terdaftar)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failRegister('Email sudah terdaftar')));
    const r = renderRegister();
    fillForm(r);
    await waitFor(() => expect(r.$('[role="alert"]')).not.toBeNull());
    expect(r.$('[role="alert"]')?.textContent).toContain('Email sudah terdaftar');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    r.unmount();
  });
});

describe('RegisterPage — hormati ?next=', () => {
  it('setelah daftar kembali ke path `next` (internal)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okRegister()));
    const r = renderRegister('/register?next=%2Flogin');
    fillForm(r);
    await waitFor(() => expect(r.text()).toContain('HALAMAN-LOGIN'));
    r.unmount();
  });

  it('mengabaikan `next` eksternal (anti open-redirect)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okRegister()));
    const r = renderRegister('/register?next=' + encodeURIComponent('https://evil.example.com'));
    fillForm(r);
    await waitFor(() => expect(r.text()).toContain('HALAMAN-HOME'));
    r.unmount();
  });
});
