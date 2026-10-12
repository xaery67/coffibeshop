import { useCallback, useSyncExternalStore } from 'react';

/**
 * Sesi auth klien (ringan) — token disimpan di localStorage `cs.accessToken`.
 * Dipakai untuk gating halaman member (riwayat, profil). Login penuh
 * (form/refresh) = Phase lanjut; hook ini hanya membaca & menghapus sesi.
 */

const TOKEN_KEY = 'cs.accessToken';
const USER_KEY = 'cs.user';

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  /** Outlet terkait untuk staff ber-scope (kasir/barista); null untuk owner/manager. */
  outlet_id?: string | null;
}

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Simpan sesi setelah login (dipakai form auth bila ada). */
export function setSession(token: string, user: SessionUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  emit();
}

/** Hapus sesi (logout). */
export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  emit();
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getUserSnapshot(): string | null {
  return localStorage.getItem(USER_KEY);
}

/** Hook sesi: `{ isAuthenticated, user, logout }`. Reaktif lintas komponen. */
export function useAuth() {
  const rawUser = useSyncExternalStore(subscribe, getUserSnapshot, () => null);
  const token = useSyncExternalStore(subscribe, getToken, () => null);

  let user: SessionUser | null = null;
  if (rawUser) {
    try {
      user = JSON.parse(rawUser) as SessionUser;
    } catch {
      user = null;
    }
  }

  const logout = useCallback(() => clearSession(), []);

  return { isAuthenticated: Boolean(token), user, logout };
}
