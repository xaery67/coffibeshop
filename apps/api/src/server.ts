import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';
import { redisCache, redisQueue } from './config/redis.js';
import { startWorkers } from './queue/worker.js';

/** Titik masuk — graceful shutdown agar SSE & job tidak terputus (DEVOPS §1.6). */
async function main() {
  const app = createApp();

  // Nyalakan worker BullMQ (in-process untuk MVP; pisah pod saat scale)
  const workers = startWorkers();

  const server = app.listen(env.API_PORT, () => {
    logger.info(
      { port: env.API_PORT, env: env.NODE_ENV },
      `☕ CoffeeShop API siap di ${env.API_BASE_URL}`,
    );
  });

  // SSE butuh idle timeout panjang; Node default sudah baik, tapi set eksplisit.
  server.keepAliveTimeout = 130_000;
  server.headersTimeout = 135_000;

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'graceful shutdown dimulai');
    server.close(async () => {
      await Promise.allSettled([
        ...workers.map((w) => w.close()),
        prisma.$disconnect(),
        redisCache.quit(),
        redisQueue.quit(),
      ]);
      logger.info('shutdown selesai');
      process.exit(0);
    });
    // Paksa keluar bila > 30s
    setTimeout(() => process.exit(1), 30_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandledRejection'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'gagal boot');
  process.exit(1);
});
