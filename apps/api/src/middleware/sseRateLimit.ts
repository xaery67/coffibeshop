import type { RequestHandler } from 'express';
import { redisCache } from '../config/redis.js';
import { ServiceUnavailable } from '../lib/http.js';

/**
 * Rate limiter untuk SSE (TC-REALTIME-INFRA).
 * Default: 40 req / menit per IP → 503 Retry-After.
 * Key: `ratelimit:sse:{ip}` di Redis.
 */
export function sseRateLimit(
  maxRequests = 40,
  windowMs = 60_000,
  keyPrefix = 'ratelimit:sse'
): RequestHandler {
  return async (req, _res, next) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = `${keyPrefix}:${ip}`;
    
    try {
      const current = await redisCache.incr(key);
      if (current === 1) {
        // First request in window, set expiry
        await redisCache.pexpire(key, windowMs);
      }
      
      if (current >= maxRequests) {
        const ttlMs = await redisCache.pttl(key);
        const retryAfter = Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000);
        
        // Set standard rate limit headers
        _res.set({
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil((Date.now() + (ttlMs > 0 ? ttlMs : windowMs)) / 1000)),
          'Retry-After': String(retryAfter),
        });
        
        return next(ServiceUnavailable(`Rate limit exceeded. Try again in ${retryAfter}s`));
      }
      
      // Set headers for successful requests
      const ttlMs = await redisCache.pttl(key);
      _res.set({
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': String(maxRequests - current),
        'X-RateLimit-Reset': String(Math.ceil((Date.now() + (ttlMs > 0 ? ttlMs : windowMs)) / 1000)),
      });
      
      next();
    } catch (err) {
      // Fail open - if Redis is down, don't block requests
      console.warn('[sseRateLimit] Redis error, failing open:', err);
      next();
    }
  };
}