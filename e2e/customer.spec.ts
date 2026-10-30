import { test, expect, waitForApi } from './fixtures.js';

/**
 * Alur pelanggan (guest) end-to-end — PRD-FRONTEND §2.3:
 * Home → Menu → PDP → Cart → Checkout (5 langkah) → halaman Pembayaran.
 *
 * Guest checkout TIDAK butuh login. Berhenti di halaman pembayaran karena
 * `POST /payments/initiate` memanggil Midtrans (butuh server key sandbox asli);
 * membuat order + tracking token SUDAH diuji di sini.
 */
test.describe('Pelanggan — pesan tanpa login', () => {
  test('home menampilkan hero dan rekomendasi dari API', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Pesan kopi favoritmu');
    // Rekomendasi = data nyata dari /catalog/products, bukan skeleton.
    await expect(page.getByRole('heading', { name: 'Rekomendasi untukmu' })).toBeVisible();
    await expect(page.locator('a[aria-label^="Lihat detail"]').first()).toBeVisible();
  });

  test('menu bisa dicari dan hasilnya menyaring', async ({ page }) => {
    await page.goto('/menu');
    await expect(page.getByRole('heading', { level: 1, name: 'Menu' })).toBeVisible();

    const cards = page.locator('a[aria-label^="Lihat detail"]');
    await expect(cards.first()).toBeVisible();
    const total = await cards.count();

    // Pencarian = state lokal (debounce 250ms) → tunggu request /catalog/products?q=
    const filtered = waitForApi(page, 'q=kopi');
    await page.getByLabel('Cari produk').fill('kopi');
    await filtered;

    await expect(cards.first()).toBeVisible();
    expect(await cards.count(), 'pencarian harus menyaring, bukan menambah').toBeLessThanOrEqual(total);
  });

  test('tambah ke keranjang lalu checkout sampai order dibuat', async ({ page }) => {
    // 1) PDP
    await page.goto('/menu');
    const firstProduct = page.locator('a[aria-label^="Lihat detail"]').first();
    const productName = (await firstProduct.getAttribute('aria-label'))!.replace('Lihat detail ', '');
    await firstProduct.click();

    await expect(page.getByRole('heading', { level: 1, name: productName })).toBeVisible();

    // 2) Tambah ke cart — desktop punya tombol sticky, mobile lewat BottomSheet.
    //    Tombol stepper kuantitas juga berlabel "Tambah", jadi pakai nama tombol
    //    sticky yang menyertakan harga ("Tambah · Rp…").
    const addBtn = page.getByRole('button', { name: /^Tambah · Rp/ });
    if (await addBtn.isVisible()) {
      await addBtn.click();
    } else {
      await page.getByRole('button', { name: /Kustomisasi & Pesan/ }).click();
      await page.getByRole('button', { name: /^Tambah · Rp/ }).click();
    }

    // 3) Cart
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Keranjang' })).toBeVisible();
    await expect(page.getByText(productName).first()).toBeVisible();

    // 4) Checkout — 5 langkah
    await page.getByRole('button', { name: 'Checkout', exact: true }).click();
    await expect(page).toHaveURL(/\/checkout$/);

    // Langkah 1: metode pengambilan (default pickup sudah terpilih)
    await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
    await page.getByRole('button', { name: 'Lanjut' }).click();

    // Langkah 2: outlet + waktu
    await page.getByLabel('Outlet').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Lanjut' }).click();

    // Langkah 3: kontak
    // Label wajib menambahkan "*" di dalam <label> (Input.tsx), jadi nama aksesibelnya "Nama*".
    await page.getByLabel(/^Nama\*?$/).fill('Budi Santoso');
    await page.getByLabel(/^Nomor WhatsApp\*?$/).fill('081234567890');
    await page.getByRole('button', { name: 'Lanjut' }).click();

    // Langkah 4: metode pembayaran — hanya yang aktif dari /config
    await page.getByRole('radio', { name: 'QRIS' }).click();
    await page.getByRole('button', { name: 'Lanjut' }).click();

    // Langkah 5: konfirmasi + buat pesanan
    await expect(page.getByText('Budi Santoso · 081234567890')).toBeVisible();
    const checkout = waitForApi(page, '/orders/checkout', 201);
    await page.getByRole('button', { name: /Buat Pesanan/ }).click();

    const res = await checkout;
    const body = await res.json();
    expect(body.success, 'checkout harus sukses').toBe(true);
    expect(body.data.order_id, 'order_id wajib ada').toBeTruthy();
    expect(body.data.tracking_token, 'tracking_token wajib ada (ADR-008)').toBeTruthy();

    // 5) Sampai di halaman pembayaran untuk order tersebut
    await expect(page).toHaveURL(new RegExp(`/payment/${body.data.order_id}`));
  });

  test('keranjang kosong menolak checkout dengan pesan jelas', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page.getByText('Keranjang masih kosong')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Lihat Menu' })).toBeVisible();
  });

  test('token pelacakan palsu tidak menampilkan status palsu', async ({ page }) => {
    await page.goto('/track/token-yang-tidak-ada');
    await expect(page.getByRole('heading', { level: 1, name: 'Lacak Pesanan' })).toBeVisible();
    // Regresi: SSE dulu menerima token apa pun → UI "Live" + spinner selamanya.
    // Sekarang stream ditolak 404 dan UI wajib berhenti memuat lalu tampilkan error.
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Memuat status pesanan…')).toBeHidden();
  });
});
