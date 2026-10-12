import { Router } from 'express';
import { metricsRegistry } from '../observability/metrics.js';

export const metricsRouter = Router();

/**
 * GET /metrics — endpoint Prometheus (issue #17 · DEVOPS §7).
 * Format teks OpenMetrics; aman di-scrape oleh Prometheus / Grafana Agent.
 */
metricsRouter.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
});
