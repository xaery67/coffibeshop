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

import { URL } from 'node:url';

export const TEST_DB_URL = process.env.QA_TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? '';

/** True bila ada URL DB test yang dikonfigurasi. */
export function hasTestDb(): boolean {
  return TEST_DB_URL.trim().length > 0;
}

/**
 * Buat PrismaClient untuk URL apa pun.
 * Dipanggil SETELAH menyetel process.env.DATABASE_URL/DIRECT_URL (bila perlu).
 */
export async function makePrisma(url: string) {
  const { PrismaClient } = await import('@prisma/client');
  return new PrismaClient({ datasources: { db: { url } } });
}

/**
 * Buat PrismaClient yang menunjuk ke DB test bersama (`QA_TEST_DATABASE_URL`).
 */
export async function makeTestPrisma() {
  return makePrisma(TEST_DB_URL);
}

/** Turunkan URL baru dari `baseUrl` dengan nama database diganti `dbName`. */
export function deriveDbUrl(baseUrl: string, dbName: string): string {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** URL koneksi ke database maintenance `postgres` (untuk CREATE/DROP DATABASE). */
export function adminDbUrl(baseUrl: string = TEST_DB_URL): string {
  return deriveDbUrl(baseUrl, 'postgres');
}

/**
 * Nama database sementara yang unik — aman dipakai paralel & berulang.
 * Identifier hanya berisi [a-z0-9_], jadi aman di-embed dalam DDL.
 */
export function tempDbName(prefix = 'cb_qa'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`.toLowerCase();
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
