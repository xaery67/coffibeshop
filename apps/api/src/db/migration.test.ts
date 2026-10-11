import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { hasTestDb, TEST_DB_URL, makeTestPrisma } from '../../test/db.js';

/**
 * Migration / DB segar (issue #18 poin 4).
 *
 * Membuktikan: dari DB KOSONG, `prisma migrate deploy` berhasil dan index
 * trigram (`pg_trgm`) benar-benar ada di tabel `products`.
 *
 * Prasyarat: `QA_TEST_DATABASE_URL` menunjuk DB KOSONG. Test mengosongkan skema
 * public (DROP SCHEMA) agar benar-benar fresh. Tanpa env → di-skip.
 *
 * Jalankan lokal:
 *   QA_TEST_DATABASE_URL=postgresql://coffibeshop:coffibeshop@localhost:5432/cb_mig_test \
 *     npx vitest run src/db/migration.test.ts
 */

const run = hasTestDb();

describe.skipIf(!run)('Migrasi DB segar + index trgm (issue #18 poin 4)', () => {
  let prisma: any;

  beforeAll(async () => {
    prisma = await makeTestPrisma();
    // Benar-benar segar: buang seluruh skema public lalu buat ulang.
    await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('prisma migrate deploy berhasil dari DB kosong', () => {
    const out = execSync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL },
      encoding: 'utf8',
    });
    expect(out).toMatch(/migrations have been successfully applied|No pending migrations/i);
  }, 120_000);

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
