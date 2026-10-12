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

/**
 * Provision DATABASE SEMENTARA sendiri + `prisma migrate deploy`, untuk isolasi
 * penuh antar file test DB-heavy (issue #55). Aman dijalankan paralel: DB tidak
 * dibagi dengan file lain, lalu di-DROP di teardown.
 *
 * Prasyarat: `QA_TEST_DATABASE_URL` menunjuk DB yang boleh CREATE/DROP DATABASE.
 * Panggil `teardownTempDb` di `afterAll` (selalu, walau test gagal).
 *
 * @example
 *   const t = await provisionTempDb('cb_qa_s4');
 *   // ... pakai t.prisma ...
 *   await teardownTempDb(t);
 */
export async function provisionTempDb(prefix = 'cb_qa_tmp'): Promise<{
  url: string;
  dbName: string;
  admin: any;
  prisma: any;
}> {
  const { execSync } = await import('node:child_process');
  const dbName = tempDbName(prefix);
  const url = deriveDbUrl(TEST_DB_URL, dbName);
  const admin = await makePrisma(adminDbUrl());
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    encoding: 'utf8',
  });
  const prisma = await makePrisma(url);
  return { url, dbName, admin, prisma };
}

/** Hapus DB sementara yang dibuat `provisionTempDb` (terminate koneksi dulu). */
export async function teardownTempDb(t: { dbName: string; admin: any; prisma?: any }): Promise<void> {
  await t.prisma?.$disconnect?.();
  if (!t.admin || !t.dbName) return;
  try {
    await t.admin.$executeRawUnsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${t.dbName}' AND pid <> pg_backend_pid()`,
    );
    await t.admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${t.dbName}"`);
  } finally {
    await t.admin.$disconnect();
  }
}
