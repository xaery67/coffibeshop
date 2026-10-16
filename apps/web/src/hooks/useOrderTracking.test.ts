import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, h, waitFor } from '../test/render.js';
import { useOrderTracking, type TrackState } from './useOrderTracking.js';

/**
 * useOrderTracking — SSE primary + fallback polling (issue #12, ADR-009, AC-09).
 *
 * SSE tidak bisa dipakai di jsdom → kami sediakan `EventSource` tiruan yang bisa
 * memicu `status_change`/`onerror` secara manual, dan `fetch` tiruan untuk jalur
 * polling. Ini menguji transport & fallback TANPA server nyata.
 */

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, ((e: { data: string }) => void)[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (e: { data: string }) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    (this.listeners[type] ?? []).forEach((cb) => cb({ data: JSON.stringify(data) }));
  }
  fail() {
    this.onerror?.();
  }
}

/** Komponen probe: menjalankan hook & mengekspos state terakhir. */
function probe(target: any, opts: any, sink: { current: TrackState | null }) {
  function Probe() {
    const s = useOrderTracking(target, opts);
    sink.current = s;
    return h('div', null, s.mode);
  }
  return h(Probe, null);
}

let sink: { current: TrackState | null };

beforeEach(() => {
  sink = { current: null };
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource as any);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useOrderTracking — SSE (guest token)', () => {
  it('membuka SSE ke /orders/track/:token/events dan menerapkan status_change', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { status: 'PENDING', updated_at: '2026-10-13T09:00:00Z' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = render(probe({ token: 'tok-abc' }, {}, sink));

    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    expect(MockEventSource.instances[0].url).toContain('/orders/track/tok-abc/events');

    MockEventSource.instances[0].onopen?.();
    // Bungkus emit dalam microtask agar React flush state di dalam act() milik waitFor.
    await waitFor(() => {
      MockEventSource.instances[0].emit('status_change', {
        status: 'READY',
        estimated_ready_time: '2026-10-13T10:00:00Z',
        updated_at: '2026-10-13T09:59:00Z',
      });
      expect(sink.current?.status).toBe('READY');
    });

    expect(sink.current?.mode).toBe('sse');
    expect(sink.current?.connected).toBe(true);
    r.unmount();
  });

  it('fallback ke polling saat SSE error, lalu memuat status via fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { status: 'BEING_PREPARED', updated_at: '2026-10-13T09:00:00Z' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = render(probe({ token: 'tok-fail' }, { pollMs: 30 }, sink));
    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));

    // SSE gagal → hook harus fallback ke polling.
    MockEventSource.instances[0].fail();

    await waitFor(() => expect(sink.current?.status).toBe('BEING_PREPARED'));
    expect(sink.current?.mode).toBe('polling');
    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('/orders/track/tok-fail');
    r.unmount();
  });

  /**
   * REGRESI (bug "lacak orderan" macet di 'Memuat status pesanan…'):
   * Guest yang membuka halaman SETELAH order dibuat tak akan pernah menerima
   * `status_change` (event hanya dikirim saat status BERUBAH). Hook harus
   * memuat status AWAL lewat GET /orders/track/:token, bukan menunggu event.
   */
  it('memuat status AWAL untuk guest tanpa menunggu status_change', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { status: 'PAID', updated_at: '2026-10-13T09:00:00Z' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = render(probe({ token: 'tok-initial' }, {}, sink));

    // TANPA memicu event apa pun, status harus terisi dari fetch awal.
    await waitFor(() => expect(sink.current?.status).toBe('PAID'));
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/orders/track/tok-initial');
    expect(MockEventSource.instances.length).toBe(1); // SSE tetap dibuka
    r.unmount();
  });
});

describe('useOrderTracking — member (orderId, polling ber-header)', () => {
  it('memakai polling untuk member dan tidak membuka SSE', async () => {
    localStorage.setItem('cs.accessToken', 'jwt-123');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { status: 'CONFIRMED', updated_at: '2026-10-13T09:00:00Z' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = render(probe({ orderId: 'ord-1' }, { pollMs: 30 }, sink));

    await waitFor(() => expect(sink.current?.status).toBe('CONFIRMED'));
    expect(MockEventSource.instances.length).toBe(0); // member → polling, bukan SSE
    expect(sink.current?.mode).toBe('polling');
    const headers = fetchMock.mock.calls[0][1]?.headers ?? {};
    expect(headers.Authorization).toContain('Bearer jwt-123');
    r.unmount();
  });
});
