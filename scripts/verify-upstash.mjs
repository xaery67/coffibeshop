#!/usr/bin/env node
/**
 * Verifikasi konektivitas Upstash Redis (issue #16).
 *
 * Langkah:
 *   1. Baca `.env` (root / apps/api) — bila REDIS_CACHE_URL & REDIS_QUEUE_URL
 *      kosong → "SKIP: kredensial belum diisi" dan exit(2).
 *   2. PING kedua instance (cache & queue) via ioredis.
 *   3. Cek CONFIG GET maxmemory-policy: cache harus `allkeys-lru`,
 *      queue harus `noeviction`. Upstash terkelola bisa menolak CONFIG →
 *      ditandai "tidak dapat diverifikasi (dikelola)", bukan kegagalan.
 *   4. Round-trip BullMQ: enqueue job ke queue `reporting` (name `verify.ping`),
 *      tunggu worker lokal memproses (timeout 15s), lalu hapus job.
 *
 * Exit code: 0 = semua lolos, 1 = ada kegagalan nyata, 2 = SKIP (kredensial kosong).
 *
 * Catatan: TIDAK menuliskan kredensial ke output (URL di-mask).
 *
 * Jalankan: node scripts/verify-upstash.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Muat .env sederhana (tanpa dependensi dotenv baru) ──────────────────────
function loadEnvFiles() {
  const candidates = [join(ROOT, '.env'), join(ROOT, 'apps', 'api', '.env')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
loadEnvFiles();

/** Mask kredensial di URL agar tidak bocor ke log. */
function maskUrl(url) {
  if (!url) return '(kosong)';
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '(url tidak valid)';
  }
}

const CACHE_URL = (process.env.REDIS_CACHE_URL || '').trim();
const QUEUE_URL = (process.env.REDIS_QUEUE_URL || '').trim();

// ── Tabel hasil ─────────────────────────────────────────────────────────────
const rows = [];
function step(name, status, detail) {
  rows.push({ name, status, detail });
  const icon = status === 'OK' ? '✅' : status === 'WARN' ? '⚠️ ' : status === 'SKIP' ? '⏭️ ' : '❌';
  console.log(`${icon} ${name.padEnd(38)} ${detail}`);
}
function printSummary() {
  console.log('\n── Ringkasan ─────────────────────────────────────────');
  for (const r of rows) console.log(`  [${r.status.padEnd(4)}] ${r.name}`);
}

// ── Guard: kredensial kosong ────────────────────────────────────────────────
if (!CACHE_URL && !QUEUE_URL) {
  console.log('⏭️  SKIP: kredensial belum diisi');
  console.log('   Set REDIS_CACHE_URL & REDIS_QUEUE_URL di .env (lihat .env.example).');
  process.exit(2);
}
if (!CACHE_URL || !QUEUE_URL) {
  step('Kelengkapan kredensial', 'FAIL', 'salah satu URL kosong — keduanya wajib diisi');
  printSummary();
  process.exit(1);
}

// ── Import dinamis (biar guard SKIP tidak perlu memuat ioredis/bullmq) ───────
let Redis, Queue;
try {
  ({ default: Redis } = await import('ioredis'));
  ({ Queue } = await import('bullmq'));
} catch (err) {
  console.error('❌ Gagal memuat ioredis/bullmq dari node_modules:', err.message);
  process.exit(1);
}

console.log('☕ Verifikasi Upstash Redis (issue #16)');
console.log(`   cache : ${maskUrl(CACHE_URL)}`);
console.log(`   queue : ${maskUrl(QUEUE_URL)}\n`);

let failures = 0;
const clients = [];

function makeClient(url) {
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: false,
    retryStrategy: (times) => (times > 2 ? null : Math.min(times * 300, 1000)),
  });
  client.on('error', () => {}); // error ditangani lewat await ping
  clients.push(client);
  return client;
}

async function cleanup() {
  for (const c of clients) {
    try {
      await c.quit();
    } catch {
      /* abaikan */
    }
  }
}

// Watchdog: jangan pernah menggantung lebih dari 60s — paksa exit(1).
const watchdog = setTimeout(() => {
  console.error('\n❌ Timeout: verifikasi melebihi 60s (Redis tak terjangkau?).');
  process.exit(1);
}, 60_000);
watchdog.unref();

try {
  // ── 1. PING cache & queue ─────────────────────────────────────────────────
  const cache = makeClient(CACHE_URL);
  const queue = makeClient(QUEUE_URL);

  const pingOk = { cache: false, queue: false };
  for (const [label, client] of [['cache', cache], ['queue', queue]]) {
    try {
      const pong = await client.ping();
      if (pong === 'PONG') {
        pingOk[label] = true;
        step(`PING ${label}`, 'OK', `→ ${pong}`);
      } else {
        step(`PING ${label}`, 'FAIL', `→ ${pong}`);
        failures++;
      }
    } catch (err) {
      step(`PING ${label}`, 'FAIL', `→ ${err.message}`);
      failures++;
    }
  }

  // ── 2. maxmemory-policy (hanya bila PING instance terkait berhasil) ────────
  const expected = { cache: 'allkeys-lru', queue: 'noeviction' };
  for (const [label, client] of [['cache', cache], ['queue', queue]]) {
    if (!pingOk[label]) {
      step(`maxmemory-policy ${label}`, 'SKIP', 'PING gagal — dilewati');
      continue;
    }
    try {
      const res = await client.config('GET', 'maxmemory-policy');
      // ioredis mengembalikan array [key, value]
      const policy = Array.isArray(res) ? res[1] : res;
      if (!policy) {
        step(`maxmemory-policy ${label}`, 'WARN', 'tidak dapat diverifikasi (dikelola)');
      } else if (String(policy) === expected[label]) {
        step(`maxmemory-policy ${label}`, 'OK', `= ${policy} (sesuai)`);
      } else {
        step(
          `maxmemory-policy ${label}`,
          'FAIL',
          `= ${policy} (diharapkan ${expected[label]})`,
        );
        failures++;
      }
    } catch (err) {
      const msg = String(err.message || err);
      // Upstash terkelola menolak CONFIG → bukan kegagalan keras.
      if (/unknown|not allowed|NOPERM|disabled|ERR/i.test(msg)) {
        step(`maxmemory-policy ${label}`, 'WARN', 'tidak dapat diverifikasi (dikelola)');
      } else {
        step(`maxmemory-policy ${label}`, 'FAIL', `→ ${msg}`);
        failures++;
      }
    }
  }

  // ── 3. Round-trip BullMQ (queue reporting, job verify.ping) ───────────────
  const QNAME = 'reporting';
  if (!pingOk.queue) {
    step('BullMQ round-trip (reporting)', 'SKIP', 'PING queue gagal — dilewati');
  } else {
    // BullMQ WAJIB memakai maxRetriesPerRequest: null pada koneksinya.
    const bullConnection = {
      url: QUEUE_URL,
      maxRetriesPerRequest: null,
    };
    const q = new Queue(QNAME, { connection: bullConnection });
    let processed = false;
    let worker;
    try {
      // Worker lokal untuk memproses job verifikasi.
      const { Worker } = await import('bullmq');
      worker = new Worker(
        QNAME,
        async (job) => {
          if (job.name === 'verify.ping') {
            processed = true;
            return { pong: true };
          }
          return null;
        },
        { connection: { url: QUEUE_URL, maxRetriesPerRequest: null }, concurrency: 1 },
      );

      const job = await q.add('verify.ping', { at: Date.now() }, { removeOnComplete: false });

      const deadline = Date.now() + 15_000;
      while (!processed && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250));
      }

      if (processed) {
        step('BullMQ round-trip (reporting)', 'OK', `job ${job.id} diproses worker lokal`);
      } else {
        step('BullMQ round-trip (reporting)', 'FAIL', 'job tidak diproses dalam 15s');
        failures++;
      }

      // Bersihkan job.
      try {
        await job.remove();
        step('Bersihkan job verifikasi', 'OK', `job ${job.id} dihapus`);
      } catch (err) {
        step('Bersihkan job verifikasi', 'WARN', `gagal hapus: ${err.message}`);
      }
    } catch (err) {
      step('BullMQ round-trip (reporting)', 'FAIL', `→ ${err.message}`);
      failures++;
    } finally {
      if (worker) await worker.close();
      await q.close();
    }
  }
} catch (err) {
  step('Eksekusi verifikasi', 'FAIL', `→ ${err.message}`);
  failures++;
} finally {
  await cleanup();
}

printSummary();
if (failures > 0) {
  console.log(`\n❌ Verifikasi GAGAL — ${failures} langkah bermasalah.`);
  process.exit(1);
}
console.log('\n✅ Verifikasi Upstash Redis LOLOS.');
process.exit(0);
