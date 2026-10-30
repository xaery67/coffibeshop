import { test, expect, loginAsStaff, CREDS } from './fixtures.js';

/**
 * Auth + panel admin — issue #60 (login staff) & RBAC `RoleGuard`.
 * Guest TIDAK boleh melihat admin; staf masuk lewat form lalu mendarat di /admin.
 */
test.describe('Auth & akses admin', () => {
  test('guest yang buka /admin dialihkan ke /login dengan next', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
    // Tunggu chunk lazy /login selesai dimuat sebelum cek heading (Vite cold start).
    await expect(page.getByRole('heading', { level: 1, name: 'Masuk' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Email atau nomor HP')).toBeVisible();
  });

  test('form login menolak field kosong tanpa memanggil API', async ({ page }) => {
    let called = false;
    await page.route('**/api/v1/auth/login', (route) => {
      called = true;
      return route.abort();
    });

    await page.goto('/login');
    await page.getByRole('button', { name: /Masuk/ }).click();

    await expect(page.getByText('Isi email atau nomor HP')).toBeVisible();
    await expect(page.getByText('Password wajib diisi')).toBeVisible();
    expect(called, 'validasi klien harus menahan submit').toBe(false);
  });

  test('kredensial salah menampilkan error, bukan masuk', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email atau nomor HP').fill(CREDS.owner.email);
    await page.getByLabel('Password').fill('password-salah-banget');
    await page.getByRole('button', { name: /Masuk/ }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('owner login lalu melihat dashboard admin', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email atau nomor HP').fill(CREDS.owner.email);
    await page.getByLabel('Password').fill(CREDS.owner.password);
    await page.getByRole('button', { name: /Masuk/ }).click();

    await expect(page).toHaveURL(/\/admin$/);
    // Dashboard = data nyata; KPI & tren penjualan harus termuat.
    await expect(page.getByRole('region', { name: 'Indikator utama' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tren penjualan (14 hari)' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigasi admin' })).toBeVisible();
  });

  test('owner bisa membuka antrian pesanan', async ({ page }) => {
    await loginAsStaff(page);
    await page.goto('/admin/orders');

    await expect(page.getByRole('navigation', { name: 'Navigasi admin' })).toBeVisible();
    // Empat kolom kanonik antrian: Baru · Diproses · Siap · Selesai.
    await expect(page.getByRole('region', { name: /^Kolom / })).toHaveCount(4);
  });

  test('sesi tersimpan: reload /admin tidak melempar keluar', async ({ page }) => {
    await loginAsStaff(page);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin$/);

    await page.reload();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('navigation', { name: 'Navigasi admin' })).toBeVisible();
  });
});
