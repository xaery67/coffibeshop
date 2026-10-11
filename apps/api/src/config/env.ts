import 'dotenv/config';
import { z } from 'zod';

/**
 * Validasi environment sekali di boot — fail fast kalau ada yang kurang.
 * Lihat .env.example untuk daftar lengkap.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  WS_BASE_URL: z.string().default('ws://localhost:4000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  // Database
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),

  // Redis
  REDIS_CACHE_URL: z.string().optional(),
  REDIS_QUEUE_URL: z.string().optional(),

  // JWT — RS256 (asimetris, ADR-005)
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PRIVATE_KEY_PATH: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // Payment
  MIDTRANS_SERVER_KEY: z.string().optional(),
  XENDIT_SECRET_KEY: z.string().optional(),

  // Business config
  TAX_RATE: z.coerce.number().default(0.11),
  POINT_VALUE: z.coerce.number().default(1),
  CURRENCY: z.string().default('IDR'),
  SHIPPING_FLAT_FEE: z.coerce.number().default(10000),
  SSE_HEARTBEAT_INTERVAL_MS: z.coerce.number().default(15000),
  TRACKING_POLL_INTERVAL_MS: z.coerce.number().default(3000),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
