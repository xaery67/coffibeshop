import { beforeEach, vi } from 'vitest';

// jsdom kadang tak menyediakan localStorage penuh — beri implementasi in-memory.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
  key(i: number) { return [...this.store.keys()][i] ?? null; }
  get length() { return this.store.size; }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage(), writable: true });

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: { ...globalThis.crypto, randomUUID: () => '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0') },
    writable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
});
