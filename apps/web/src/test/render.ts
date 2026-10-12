import React, { type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 18.3 menyediakan `React.act` (menggantikan react-dom/test-utils).
const act: typeof import('react').act = (React as any).act ?? ((cb: any) => cb());

// Beri tahu React bahwa ini environment test (menghilangkan warning act).
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Helper render komponen React untuk test (issue #18 poin 2).
 *
 * Catatan: vitest di vite.config.ts hanya meng-include file test ber-ekstensi .ts
 * (bukan .tsx) dan konfigurasi itu milik @frontend-engineer — jadi test komponen
 * ditulis tanpa JSX, memakai React.createElement. Helper ini menyembunyikan detail.
 */

export interface RenderResult {
  container: HTMLElement;
  root: Root;
  /** Query teks di dalam container. */
  text: () => string;
  /** Query elemen. */
  $: <T extends Element = HTMLElement>(selector: string) => T | null;
  $$: <T extends Element = HTMLElement>(selector: string) => T[];
  /** Klik elemen (dibungkus act). */
  click: (selector: string, index?: number) => void;
  /** Klik langsung node. */
  clickNode: (el: Element) => void;
  /** Set nilai input/textarea lalu dispatch change. */
  setValue: (el: Element, value: string) => void;
  rerender: (el: ReactElement) => void;
  unmount: () => void;
}

/** Render elemen ke container baru di document.body. */
export function render(el: ReactElement): RenderResult {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(el);
  });

  const $ = <T extends Element = HTMLElement>(selector: string) =>
    container.querySelector<T>(selector);
  const $$ = <T extends Element = HTMLElement>(selector: string) =>
    Array.from(container.querySelectorAll<T>(selector));

  const clickNode = (target: Element) => {
    act(() => {
      (target as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  };

  const click = (selector: string, index = 0) => {
    const nodes = $$(selector);
    if (!nodes[index]) throw new Error(`Elemen tidak ditemukan: ${selector}[${index}]`);
    clickNode(nodes[index]);
  };

  const setValue = (target: Element, value: string) => {
    act(() => {
      const el = target as HTMLInputElement | HTMLTextAreaElement;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  return {
    container,
    root,
    text: () => container.textContent ?? '',
    $,
    $$,
    click,
    clickNode,
    setValue,
    rerender: (next: ReactElement) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Buat React element tanpa JSX. */
export function h(
  type: React.ElementType,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
): ReactElement {
  return React.createElement(type as any, props as any, ...children);
}

/**
 * Tunggu kondisi terpenuhi sambil membungkus update async dalam act().
 * Dipakai untuk query React Query / efek async agar tidak memicu warning act.
 */
export async function waitFor(assert: () => void, { timeout = 1500, interval = 20 } = {}): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;
  // Beri kesempatan microtask/tick untuk flush query.
  while (Date.now() - start < timeout) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, interval));
    });
    try {
      assert();
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('waitFor timeout');
}
