import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { hasTestDb, makePrisma, deriveDbUrl, adminDbUrl, tempDbName, TEST_DB_URL } from '../../test/db.js';

/**
 * Migration / DB segar (issue #18 poin 4).
 *
 * Membuktikan: dari DB KOSONG, `prisma migrate deploy` berhasil dan index
 * trigram (`pg_trgm`) benar-benar ada di tabel `products`.
 *
 * ISOLASI: test ini membuat DATABASE SEMENTARA sendiri (`cb_qa_mig_<ts>_<rand>`)
 * dari koneksi `QA_TEST_DATABASE_URL`, menjalankan migrasi di sana, lalu
 * men-DROP-nya di `afterAll`. TIDAK menyentuh DB bersama yang dipakai file lain
 * — sehingga aman dijalankan PARALEL dengan `checkout.e2e.test.ts`. (Sebelumnya
 * test ini `DROP SCHEMA public` di DB bersama → menjatuhkan schema di tengah
 * test checkout paralel → 7 test checkout gagal.)
 *
 * Prasyarat: `QA_TEST_DATABASE_URL` menunjuk DB yang boleh dipakai untuk
 * CREATE/DROP DATABASE (mis. `cb_test`). Tanpa env → di-skip.
 *
 * Jalankan lokal:
 *   QA_TEST_DATABASE_URL=postgresql://coffibeshop:***@localhost:5432/cb_test \
 *     npx vitest run
 */

const run = hasTestDb();

describe.skipIf(!run)('Migrasi DB segar + index trgm (issue #18 poin 4)', () => {
  let prisma: any;
  let admin: any;
  let dbName = '';
  let migrateOutput = '';

  beforeAll(async () => {
    // 1) Buat DATABASE sementara (terpisah dari DB bersama).
    dbName = tempDbName('cb_qa_mig');
    const url = deriveDbUrl(TEST_DB_URL, dbName);
    admin = await makePrisma(adminDbUrl());
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);

    // 2) Migrasi dari kondisi kosong.
    migrateOutput = execSync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      encoding: 'utf8',
    });

    // 3) Buka koneksi ke DB sementara untuk asersi (DB hidup sampai afterAll).
    prisma = await makePrisma(url);
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (admin && dbName) {
      try {
        await admin.$executeRawUnsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`,
        );
        await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
      } finally {
        await admin.$disconnect();
      }
    }
  });

  it('prisma migrate deploy berhasil dari DB kosong', () => {
    expect(migrateOutput).toMatch(/migrations have been successfully applied|No pending migrations/i);
  });

  it('ekstensi pg_trgm terpasang', async () => {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`,
    );
    expect(rows.map((x) => x.extname)).toContain('pg_trgm');
  });

  it('index GIN trgm ada di tabel products (name & description)', async () => {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'products' ORDER BY indexname`,
    );
    const names = rows.map((x) => x.indexname);
    expect(names).toContain('products_name_trgm_idx');
    expect(names).toContain('products_description_trgm_idx');

    const def = rows.find((x) => x.indexname === 'products_name_trgm_idx')?.indexdef ?? '';
    expect(def).toMatch(/USING gin/i);
    expect(def).toMatch(/gin_trgm_ops/i);
  });

  it('tabel inti ada (orders, order_items, order_status_logs, payments, vouchers)', async () => {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const tables = rows.map((x) => x.tablename);
    for (const t of ['orders', 'order_items', 'order_status_logs', 'payments', 'vouchers', 'products', 'users']) {
      expect(tables).toContain(t);
    }
  });

  it('enum OrderStatus berisi 7 status kanonik', async () => {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'OrderStatus' ORDER BY e.enumsortorder`,
    );
    expect(rows.map((x) => x.enumlabel)).toEqual([
      'PENDING', 'PAID', 'CONFIRMED', 'BEING_PREPARED', 'READY', 'COMPLETED', 'CANCELLED',
    ]);
  });

  it('constraint unik: order_number & tracking_token unik', async () => {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'orders'`,
    );
    const defs = rows.map((x) => x.indexname);
    expect(defs.some((n: string) => n.includes('order_number'))).toBe(true);
    expect(defs.some((n: string) => n.includes('tracking_token'))).toBe(true);
  });
});
