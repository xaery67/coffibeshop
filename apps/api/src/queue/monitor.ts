import type { Queue } from 'bullmq';
import { Gauge } from 'prom-client';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { metricsRegistry } from '../observability/metrics.js';
import { queues } from './queues.js';

/**
 * Queue depth monitoring + alert (issue #16 · DEVOPS §7).
 *
 * Setiap `QUEUE_MONITOR_INTERVAL_MS`, hitung `waiting + delayed` per queue dan
 * ekspos sebagai gauge Prometheus di `metricsRegistry` (bukan registry default):
 *   - `bullmq_queue_depth{queue="..."}` → jumlah job menunggu
 *   - `bullmq_queue_alert{queue="..."}` → 1 bila melewati ambang, 0 bila tidak
 * Warn di-rate-limit: hanya dicatat saat status berubah (naik melewati ambang)
 * atau depth terus naik, agar tidak membanjiri log.
 */

export const queueDepthGauge = new Gauge({
  name: 'bullmq_queue_depth',
  help: 'Jumlah job menunggu (waiting + delayed) per queue',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const queueAlertGauge = new Gauge({
  name: 'bullmq_queue_alert',
  help: '1 bila queue depth melewati QUEUE_ALERT_THRESHOLD, selain itu 0',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

/** Potongan Queue yang dibutuhkan monitor — memudahkan mocking di test. */
export type QueueLike = Pick<Queue, 'getJobCounts'>;

/** Depth tertinggi yang sudah di-warn per queue (rate-limit) — kosong = belum alert. */
const lastLoggedDepth = new Map<string, number>();

/** Reset state rate-limit (dipakai test). */
export function resetQueueAlertState(): void {
  lastLoggedDepth.clear();
}

/** Redis dianggap terkonfigurasi bila salah satu URL diisi. */
export function isRedisConfigured(): boolean {
  return Boolean(env.REDIS_QUEUE_URL || env.REDIS_CACHE_URL);
}

/**
 * Baca depth satu queue, perbarui gauge, dan log warn bila melewati ambang.
 * @returns depth (waiting + delayed) yang terbaca.
 */
export async function checkQueueDepth(name: string, queue: QueueLike): Promise<number> {
  const counts = await queue.getJobCounts('waiting', 'delayed');
  const depth = (counts.waiting ?? 0) + (counts.delayed ?? 0);
  const threshold = env.QUEUE_ALERT_THRESHOLD;
  const alerting = depth > threshold;

  queueDepthGauge.set({ queue: name }, depth);
  queueAlertGauge.set({ queue: name }, alerting ? 1 : 0);

  if (alerting) {
    const prev = lastLoggedDepth.get(name);
    // Log hanya saat pertama melewati ambang, atau saat depth naik lebih tinggi.
    if (prev === undefined || depth > prev) {
      logger.warn({ queue: name, depth, threshold }, 'queue depth melewati ambang');
      lastLoggedDepth.set(name, depth);
    }
  } else {
    // Turun ke bawah ambang → reset agar crossing berikutnya tercatat lagi.
    lastLoggedDepth.delete(name);
  }

  return depth;
}

/** Iterasi seluruh queue sekali (dipakai interval & test). Error per-queue ditelan. */
export async function collectQueueDepths(): Promise<void> {
  await Promise.all(
    Object.entries(queues).map(async ([name, queue]) => {
      try {
        await checkQueueDepth(name, queue);
      } catch (err) {
        logger.error(
          { queue: name, err: (err as Error).message },
          'gagal membaca queue depth',
        );
      }
    }),
  );
}

export interface QueueMonitorHandle {
  /** Hentikan interval monitor (dipanggil saat graceful shutdown). */
  stop: () => void;
}

let monitor: QueueMonitorHandle | null = null;

/**
 * Nyalakan monitor queue depth. No-op (return null) bila Redis belum
 * dikonfigurasi agar boot tidak crash di lingkungan tanpa Upstash.
 */
export function startQueueMonitor(): QueueMonitorHandle | null {
  if (!isRedisConfigured()) {
    logger.info('queue monitor dilewati — Redis belum dikonfigurasi');
    return null;
  }
  if (monitor) return monitor;

  // Ambil sampel pertama segera, lalu berkala.
  void collectQueueDepths();
  const timer = setInterval(() => void collectQueueDepths(), env.QUEUE_MONITOR_INTERVAL_MS);
  timer.unref();

  monitor = {
    stop: () => {
      clearInterval(timer);
      monitor = null;
    },
  };
  logger.info(
    { intervalMs: env.QUEUE_MONITOR_INTERVAL_MS, threshold: env.QUEUE_ALERT_THRESHOLD },
    'queue monitor aktif',
  );
  return monitor;
}
