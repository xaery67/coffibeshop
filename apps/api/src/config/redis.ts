import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Dua koneksi Redis terpisah (DEVOPS §1.4):
 *  - redisCache : allkeys-lru  (session, cart, menu cache, rate-limit)
 *  - redisQueue : noeviction   (BullMQ — job TIDAK boleh hilang)
 */
function createClient(url: string | undefined, label: string): Redis {
  const client = new Redis(url ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 3000),
  });
  client.on('connect', () => logger.info({ label }, 'redis connected'));
  client.on('error', (err) => logger.error({ label, err: err.message }, 'redis error'));
  return client;
}

export const redisCache = createClient(env.REDIS_CACHE_URL, 'cache');
export const redisQueue = createClient(env.REDIS_QUEUE_URL ?? env.REDIS_CACHE_URL, 'queue');

/** Health check — kembalikan true bila PING berhasil. */
export async function pingRedis(): Promise<boolean> {
  try {
    await redisCache.ping();
    return true;
  } catch {
    return false;
  }
}
