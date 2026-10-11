/**
 * Helper test DB (issue #18 poin 4 & 1).
 *
 * Test yang memerlukan Postgres SUNGGUHAN di-guard: hanya berjalan bila env
 * `QA_TEST_DATABASE_URL` (atau `TEST_DATABASE_URL`) diset. Tanpa env tersebut,
 * suite di-skip agar `npm test` biasa tetap hijau & offline.
 *
 * Contoh menjalankan (lokal/CI):
 *   QA_TEST_DATABASE_URL=postgresql://coffibeshop:coffibeshop@localhost:5432/cb_test \
 *     npm run test --workspace=@coffibeshop/api
 */

export const TEST_DB_URL = process.env.QA_TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? '';

/** True bila ada URL DB test yang dikonfigurasi. */
export function hasTestDb(): boolean {
  return TEST_DB_URL.trim().length > 0;
}

/**
 * Buat PrismaClient yang menunjuk ke DB test.
 * Dipanggil SETELAH menyetel process.env.DATABASE_URL/DIRECT_URL.
 */
export async function makeTestPrisma() {
  const { PrismaClient } = await import('@prisma/client');
  return new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
}

/**
 * Bersihkan tabel-tabel yang dipakai test (urutan penting karena FK).
 * Hanya menyentuh DB test — TIDAK pernah DB dev/produksi.
 */
export async function truncateForTest(prisma: any): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      order_status_logs, order_items, loyalty_points, orders, payments, addresses,
      option_values, product_options, product_variants, products, categories, outlets, users
    RESTART IDENTITY CASCADE
  `);
}
