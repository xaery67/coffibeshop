import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorMiddleware.js';
import { apiRouter } from './modules/index.js';
import { healthRouter } from './routes/health.js';
import { configRouter } from './routes/config.js';
import { metricsRouter } from './routes/metrics.js';
import { metricsMiddleware } from './observability/metrics.js';

/** Bangun Express app (dipisah dari server agar mudah di-test). */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(metricsMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as any).requestId,
      autoLogging: {
        ignore: (req) => ['/health', '/ready', '/metrics'].includes(req.url ?? ''),
      },
    }),
  );
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health & readiness (tanpa prefix versi)
  app.use(healthRouter);

  // Metrics Prometheus (issue #17 — observability)
  app.use(metricsRouter);

  // Config publik (ADR-007)
  app.use('/api/v1/config', configRouter);

  // API v1 — 9 domain service
  app.use('/api/v1', apiRouter);

  // 404
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' },
    });
  });

  app.use(errorHandler);
  return app;
}
