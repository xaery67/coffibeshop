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
  SUPABASE_STORAGE_BUCKET: z.string().default('cs-dev-products'),

  // Database
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),

  // Redis
  REDIS_CACHE_URL: z.string().optional(),
  REDIS_QUEUE_URL: z.string().optional(),
  QUEUE_ALERT_THRESHOLD: z.coerce.number().default(1000),
  QUEUE_MONITOR_INTERVAL_MS: z.coerce.number().default(60_000),

  // JWT — RS256 (asimetris, ADR-005)
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PRIVATE_KEY_PATH: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // Payment — Midtrans (sandbox/live) + Xendit (failover, opsional)
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_CLIENT_KEY: z.string().optional(),
  MIDTRANS_IS_PRODUCTION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  XENDIT_SECRET_KEY: z.string().optional(),
  XENDIT_CALLBACK_TOKEN: z.string().optional(),

  // Business config
  TAX_RATE: z.coerce.number().default(0.11),
  POINT_VALUE: z.coerce.number().default(1),
  CURRENCY: z.string().default('IDR'),
  SHIPPING_FLAT_FEE: z.coerce.number().default(10000),
  SSE_HEARTBEAT_INTERVAL_MS: z.coerce.number().default(15000),
  TRACKING_POLL_INTERVAL_MS: z.coerce.number().default(3000),
});

// .env boleh memuat nilai kosong (mis. `SUPABASE_URL=` belum diisi user) —
// perlakukan sebagai UNSET agar default/opsional schema tetap berlaku,
// bukan gagal validasi `.url()`.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''),
);
const parsed = EnvSchema.safeParse(rawEnv);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
