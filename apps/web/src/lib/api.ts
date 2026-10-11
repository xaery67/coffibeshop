import type { ApiResponse } from '@coffibeshop/shared';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** guestId untuk cart guest (ADR-006) — generate & simpan di localStorage. */
export function getGuestId(): string {
  const KEY = 'cs.guestId';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('cs.accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Fetch wrapper dengan envelope { success, data, error } + header guest. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Guest-Id': getGuestId(),
      ...authHeader(),
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return body.data as T;
}
