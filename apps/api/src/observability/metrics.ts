import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

/**
 * Metrics Prometheus untuk API (issue #17 · DEVOPS §7).
 *
 * - `collectDefaultMetrics` → CPU, memori, event loop, GC, dll (prefix `coffibeshop_api_`).
 * - `http_request_duration_seconds` → histogram latency per route/method/status.
 *
 * `/metrics` sebaiknya hanya diakses dari jaringan internal / service monitor.
 * Registry dipisah agar tidak mencemari metric proses lain saat di-test.
 */
export const metricsRegistry = new Registry();
metricsRegistry.setDefaultLabels({ service: 'coffibeshop-api' });
collectDefaultMetrics({ register: metricsRegistry, prefix: 'coffibeshop_api_' });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durasi request HTTP dalam detik',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

/** Counter sederhana untuk melihat volume request per route (opsional, murah). */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total request HTTP',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry],
});

/**
 * Middleware pengukur latency. Menggunakan pola route (bukan URL mentah) agar
 * label tidak meledak (high cardinality) — jatuh ke `req.path` bila belum ada.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    // `req.route?.path` terisi setelah router cocok; fallback ke path dasar.
    const route = `${req.baseUrl ?? ''}${req.route?.path ?? req.path}` || 'unknown';
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestDuration.observe(labels, seconds);
    httpRequestsTotal.inc(labels);
  });
  next();
}
