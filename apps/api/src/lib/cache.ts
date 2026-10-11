import { redisCache } from '../config/redis.js';
import { logger } from '../config/logger.js';

/**
 * Helper cache Redis (PRD-BACKEND §6).
 *
 *  - Semua nilai disimpan sebagai JSON string.
 *  - Invalidasi by pattern memakai SCAN (non-blocking), bukan KEYS.
 *  - Kegagalan cache tidak boleh menjatuhkan request → selalu fallback ke DB.
 */

/** Ambil nilai dari cache; null bila tidak ada / rusak / Redis error. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redisCache.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    logger.warn({ err: (err as Error).message, key }, 'cache get gagal — fallback ke DB');
    return null;
  }
}

/** Simpan nilai ke cache dengan TTL detik; gagal senyap. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redisCache.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.warn({ err: (err as Error).message, key }, 'cache set gagal');
  }
}

/** Hapus satu/lebih key; gagal senyap. */
export async function cacheDel(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    await redisCache.del(...keys);
  } catch (err) {
    logger.warn({ err: (err as Error).message, keys }, 'cache del gagal');
  }
}

/**
 * Hapus semua key yang cocok dengan pola glob (mis. `menu:*`).
 * Memakai SCAN kursor — aman untuk keyspace besar (tidak seperti KEYS).
 */
export async function cacheDelByPattern(pattern: string): Promise<number> {
  let deleted = 0;
  try {
    const stream = redisCache.scanStream({ match: pattern, count: 200 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) {
        await redisCache.del(...keys);
        deleted += keys.length;
      }
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, pattern }, 'cache del-by-pattern gagal');
  }
  return deleted;
}

/** Bungkus pola cache-aside: coba cache → hitung ulang → simpan. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await produce();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}

// ── Key builder katalog (dipakai service & invalidasi) ──
export const CacheKeys = {
  /** Menu lengkap sebuah outlet (produk + kategori) — TTL 5m (PRD-BACKEND §8 F-001). */
  menu: (outletId: string) => `menu:${outletId}`,
  /** Daftar produk ter-paginasi (per kombinasi filter). */
  productList: (fingerprint: string) => `catalog:products:${fingerprint}`,
  /** Detail produk tunggal. */
  product: (id: string) => `catalog:product:${id}`,
  /** Kategori sebuah outlet (atau semua bila outletId kosong). */
  categories: (outletId?: string | null) => `catalog:categories:${outletId ?? 'all'}`,
  /** Daftar outlet aktif. */
  outlets: () => 'catalog:outlets:all',
} as const;

/** TTL standar katalog (detik). */
export const TTL = {
  MENU: 300, // 5 menit
  PRODUCT: 300,
  CATEGORIES: 300,
  OUTLETS: 600,
} as const;

/**
 * Invalidasi seluruh cache katalog (dipanggil setiap admin mengubah
 * outlet/kategori/produk/varian/opsi — AC issue #4 "invalidasi saat update").
 */
export async function invalidateCatalogCache(opts?: { outletId?: string | null; productId?: string }): Promise<void> {
  await cacheDelByPattern('menu:*');
  await cacheDelByPattern('catalog:*');
  if (opts?.productId) await cacheDel(CacheKeys.product(opts.productId));
  logger.debug({ ...opts }, 'cache katalog diinvalidasi');
}
