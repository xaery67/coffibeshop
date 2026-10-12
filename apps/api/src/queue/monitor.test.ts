import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Queue depth monitor (issue #16).
 * `queues` + `logger` + `env` dimock: tidak menyentuh Redis/infra nyata.
 * Tujuan: gauge ter-update, alert menyala tepat di atas ambang, dan warn
 * TIDAK spam (hanya saat melewati ambang / depth naik lebih tinggi).
 */

// ── State mock (hoisted agar bisa dipakai di vi.mock) ──
const h = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  env: {
    QUEUE_ALERT_THRESHOLD: 1000,
    QUEUE_MONITOR_INTERVAL_MS: 60_000,
    REDIS_QUEUE_URL: 'redis://localhost:6379',
    REDIS_CACHE_URL: 'redis://localhost:6379',
  } as Record<string, unknown>,
  counts: {} as Record<string, { waiting?: number; delayed?: number }>,
  fail: new Set<string>(),
}));

vi.mock('../config/logger.js', () => ({
  logger: { warn: h.warn, info: h.info, error: h.error },
}));

vi.mock('../config/env.js', () => ({ env: h.env }));

vi.mock('./queues.js', () => {
  const make = (name: string) => ({
    getJobCounts: async (...types: string[]) => {
      if (h.fail.has(name)) throw new Error('redis down');
      const c = h.counts[name] ?? {};
      const out: Record<string, number> = {};
      for (const t of types) out[t] = (c as Record<string, number>)[t] ?? 0;
      return out;
    },
  });
  return {
    queues: {
      payment: make('payment'),
      notification: make('notification'),
      loyalty: make('loyalty'),
      reporting: make('reporting'),
    },
  };
});

import {
  queueDepthGauge,
  queueAlertGauge,
  checkQueueDepth,
  collectQueueDepths,
  startQueueMonitor,
  resetQueueAlertState,
} from './monitor.js';

/** Ambil nilai gauge untuk satu label queue. */
async function gaugeValue(gauge: typeof queueDepthGauge, queue: string): Promise<number> {
  const data = await gauge.get();
  const found = data.values.find((v) => v.labels.queue === queue);
  return found?.value ?? 0;
}

beforeEach(() => {
  h.warn.mockClear();
  h.info.mockClear();
  h.error.mockClear();
  h.counts = {};
  h.fail.clear();
  h.env.QUEUE_ALERT_THRESHOLD = 1000;
  h.env.REDIS_QUEUE_URL = 'redis://localhost:6379';
  h.env.REDIS_CACHE_URL = 'redis://localhost:6379';
  resetQueueAlertState();
  queueDepthGauge.reset();
  queueAlertGauge.reset();
});

describe('checkQueueDepth — gauge', () => {
  it('menghitung waiting + delayed dan meng-update gauge depth', async () => {
    const depth = await checkQueueDepth('reporting', {
      getJobCounts: async () => ({ waiting: 3, delayed: 2 }),
    } as never);
    expect(depth).toBe(5);
    expect(await gaugeValue(queueDepthGauge, 'reporting')).toBe(5);
  });

  it('menganggap counts kosong sebagai 0', async () => {
    const depth = await checkQueueDepth('payment', {
      getJobCounts: async () => ({}),
    } as never);
    expect(depth).toBe(0);
    expect(await gaugeValue(queueDepthGauge, 'payment')).toBe(0);
  });
});

describe('alert gauge & rate-limited warn', () => {
  it('alert = 0 dan TIDAK warn bila depth ≤ threshold', async () => {
    h.env.QUEUE_ALERT_THRESHOLD = 100;
    await checkQueueDepth('payment', {
      getJobCounts: async () => ({ waiting: 100, delayed: 0 }),
    } as never);
    expect(await gaugeValue(queueAlertGauge, 'payment')).toBe(0);
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('alert = 1 dan warn sekali bila depth > threshold', async () => {
    h.env.QUEUE_ALERT_THRESHOLD = 100;
    await checkQueueDepth('payment', {
      getJobCounts: async () => ({ waiting: 150, delayed: 0 }),
    } as never);
    expect(await gaugeValue(queueAlertGauge, 'payment')).toBe(1);
    expect(h.warn).toHaveBeenCalledTimes(1);
    expect(h.warn).toHaveBeenCalledWith(
      expect.objectContaining({ queue: 'payment', depth: 150, threshold: 100 }),
      'queue depth melewati ambang',
    );
  });

  it('TIDAK spam: depth sama/berfluktuasi di atas ambang tetap 1 warn', async () => {
    h.env.QUEUE_ALERT_THRESHOLD = 100;
    const q = { getJobCounts: async () => ({ waiting: 150, delayed: 0 }) } as never;
    await checkQueueDepth('payment', q);
    await checkQueueDepth('payment', q);
    await checkQueueDepth('payment', q);
    expect(h.warn).toHaveBeenCalledTimes(1);
  });

  it('warn lagi hanya saat depth naik lebih tinggi', async () => {
    h.env.QUEUE_ALERT_THRESHOLD = 100;
    await checkQueueDepth('payment', { getJobCounts: async () => ({ waiting: 150 }) } as never);
    await checkQueueDepth('payment', { getJobCounts: async () => ({ waiting: 200 }) } as never);
    expect(h.warn).toHaveBeenCalledTimes(2);
    expect(h.warn).toHaveBeenLastCalledWith(
      expect.objectContaining({ depth: 200 }),
      'queue depth melewati ambang',
    );
  });

  it('turun di bawah ambang → alert reset, crossing berikutnya warn lagi', async () => {
    h.env.QUEUE_ALERT_THRESHOLD = 100;
    await checkQueueDepth('payment', { getJobCounts: async () => ({ waiting: 150 }) } as never);
    await checkQueueDepth('payment', { getJobCounts: async () => ({ waiting: 10 }) } as never);
    expect(await gaugeValue(queueAlertGauge, 'payment')).toBe(0);
    await checkQueueDepth('payment', { getJobCounts: async () => ({ waiting: 150 }) } as never);
    expect(h.warn).toHaveBeenCalledTimes(2);
  });
});

describe('collectQueueDepths — seluruh queue', () => {
  it('meng-update gauge untuk setiap queue', async () => {
    h.counts = {
      payment: { waiting: 1 },
      notification: { waiting: 2, delayed: 3 },
      loyalty: { waiting: 0 },
      reporting: { delayed: 7 },
    };
    await collectQueueDepths();
    expect(await gaugeValue(queueDepthGauge, 'payment')).toBe(1);
    expect(await gaugeValue(queueDepthGauge, 'notification')).toBe(5);
    expect(await gaugeValue(queueDepthGauge, 'loyalty')).toBe(0);
    expect(await gaugeValue(queueDepthGauge, 'reporting')).toBe(7);
  });

  it('error satu queue tidak menggagalkan queue lain (dicatat via logger.error)', async () => {
    h.counts = { payment: { waiting: 4 }, notification: { waiting: 2 } };
    h.fail.add('payment');
    await collectQueueDepths();
    expect(h.error).toHaveBeenCalledTimes(1);
    expect(await gaugeValue(queueDepthGauge, 'notification')).toBe(2);
  });
});

describe('startQueueMonitor — guard & lifecycle', () => {
  it('return null (no-op) bila Redis belum dikonfigurasi', () => {
    h.env.REDIS_QUEUE_URL = '';
    h.env.REDIS_CACHE_URL = '';
    const handle = startQueueMonitor();
    expect(handle).toBeNull();
    expect(h.info).toHaveBeenCalledWith(
      expect.stringContaining('Redis belum dikonfigurasi'),
    );
  });

  it('mengembalikan handle dengan stop() bila Redis terkonfigurasi', () => {
    const handle = startQueueMonitor();
    expect(handle).not.toBeNull();
    expect(typeof handle?.stop).toBe('function');
    handle?.stop();
  });
});
