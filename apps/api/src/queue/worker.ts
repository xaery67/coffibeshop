import { Worker, type Job } from 'bullmq';
import { redisQueue } from '../config/redis.js';
import { logger } from '../config/logger.js';

/** Handler per jenis job — kerangka; implementasi detail di sprint. */
const handlers: Record<string, (job: Job) => Promise<unknown>> = {
  'payment.refund': async (job) => logger.info({ id: job.id }, 'memproses refund'),
  'notification.send': async (job) => logger.info({ id: job.id }, 'mengirim notifikasi'),
  'loyalty.award': async (job) => logger.info({ id: job.id }, 'memberi poin loyalty'),
  'reporting.daily': async (job) => logger.info({ id: job.id }, 'membuat laporan harian'),
};

/**
 * Nyalakan worker untuk setiap domain. In-process untuk MVP;
 * di produksi pisahkan pod worker (HPA by queue_depth — DEVOPS §1.5).
 */
export function startWorkers(): Worker[] {
  const names = ['payment', 'notification', 'loyalty', 'reporting'];
  return names.map((name) => {
    const worker = new Worker(
      name,
      async (job) => {
        const handler = handlers[`${name}.${job.name}`] ?? handlers[`${name}.default`];
        if (handler) return handler(job);
        logger.warn({ queue: name, job: job.name }, 'tidak ada handler');
        return null;
      },
      { connection: redisQueue, concurrency: 5 },
    );
    worker.on('completed', (job) => logger.info({ queue: name, id: job.id }, 'job selesai'));
    worker.on('failed', (job, err) =>
      logger.error({ queue: name, id: job?.id, err: err.message }, 'job gagal'),
    );
    logger.info({ queue: name }, 'worker aktif');
    return worker;
  });
}
