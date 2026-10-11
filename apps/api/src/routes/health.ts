import { Router } from 'express';
import { asyncHandler, sendOk } from '../lib/http.js';
import { prisma } from '../config/prisma.js';
import { pingRedis } from '../config/redis.js';

export const healthRouter = Router();

/** GET /health — liveness (selalu cepat). */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'coffibeshop-api', uptime: process.uptime() });
});

/** GET /ready — readiness (cek DB + Redis). */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, string> = {};
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }
    checks.redis = (await pingRedis()) ? 'up' : 'down';
    const ready = !Object.values(checks).includes('down');
    res.status(ready ? 200 : 503).json({ ready, checks });
  }),
);
