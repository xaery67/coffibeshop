import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGuestId, apiFetch } from './api.js';

/**
 * API client & guest identity (issue #18 poin 2, ADR-006).
 * Kontrak: header `X-Guest-Id` selalu dikirim; envelope {success,data,error}
 * dibuka; token Bearer disertakan bila ada; error envelope → throw.
 */

const GUEST_KEY = 'cs.guestId';
const TOKEN_KEY = 'cs.accessToken';

beforeEach(() => {
  localStorage.clear();
  // jsdom tidak selalu punya crypto.randomUUID.
  if (!globalThis.crypto?.randomUUID) {
    (globalThis as any).crypto = { ...(globalThis.crypto ?? {}), randomUUID: () => 'uuid-fixed-1234' };
  }
});

afterEach(() => vi.restoreAllMocks());

describe('getGuestId', () => {
  it('membuat id & menyimpannya di localStorage', () => {
    const id = getGuestId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(localStorage.getItem(GUEST_KEY)).toBe(id);
  });

  it('id stabil antar pemanggilan (tidak regenerate)', () => {
    const first = getGuestId();
    const second = getGuestId();
    expect(second).toBe(first);
  });

  it('memakai id yang sudah ada di localStorage', () => {
    localStorage.setItem(GUEST_KEY, 'existing-guest-id');
    expect(getGuestId()).toBe('existing-guest-id');
  });
});

describe('apiFetch — envelope & header', () => {
  function mockFetch(body: unknown, ok = true, status = 200) {
    const fn = vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    } as unknown as Response);
    vi.stubGlobal('fetch', fn);
    return fn;
  }

  it('mengirim X-Guest-Id pada setiap request', async () => {
    const f = mockFetch({ success: true, data: { x: 1 }, error: null });
    await apiFetch('/config');
    const headers = (f.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Guest-Id']).toBe(getGuestId());
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('menambahkan Authorization bila token tersimpan', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok-abc');
    const f = mockFetch({ success: true, data: {}, error: null });
    await apiFetch('/orders');
    const headers = (f.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toContain('tok-abc');
  });

  it('tanpa token → tidak ada Authorization', async () => {
    const f = mockFetch({ success: true, data: {}, error: null });
    await apiFetch('/orders');
    const headers = (f.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('membuka envelope → mengembalikan data', async () => {
    mockFetch({ success: true, data: { total: 82140 }, error: null });
    await expect(apiFetch('/cart')).resolves.toEqual({ total: 82140 });
  });

  it('HTTP tidak ok → throw pesan error dari envelope', async () => {
    mockFetch({ success: false, data: null, error: { message: 'Stok habis', code: 'OUT_OF_STOCK' } }, false, 409);
    await expect(apiFetch('/orders')).rejects.toThrow('Stok habis');
  });

  it('HTTP ok tapi success:false → throw juga', async () => {
    mockFetch({ success: false, data: null, error: { message: 'Validasi gagal' } }, true, 200);
    await expect(apiFetch('/orders')).rejects.toThrow('Validasi gagal');
  });

  it('fallback pesan HTTP <status> bila envelope tanpa error', async () => {
    mockFetch({ success: false, data: null, error: null }, false, 500);
    await expect(apiFetch('/orders')).rejects.toThrow('HTTP 500');
  });

  it('header kustom menimpa default', async () => {
    const f = mockFetch({ success: true, data: {}, error: null });
    await apiFetch('/orders', { headers: { 'Idempotency-Key': 'idem-1' } });
    const headers = (f.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('idem-1');
  });
});
