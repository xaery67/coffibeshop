# 🔍 UI Audit — Kepatuhan terhadap Design System

> **Versi:** v1.1 · **Tanggal:** 2026-10-12 · **Auditor:** UI/UX Designer (@ui-ux-designer)
> **Base commit:** `d34e2737` (design system sudah ter-merge, PR #43)
> **Rujukan:** `docs/DESIGN-SYSTEM.md` (§), `docs/UX-FLOWS.md` (§), `docs/PRD-FRONTEND-UX.md`.
> **Metode:** membaca kode nyata (`apps/web/src/**`) + `tailwind.config.js` + `styles/index.css`, lalu dibandingkan dengan `DESIGN-SYSTEM.md` yang sudah di-merge. Setiap temuan disertai `file:baris` + kutipan.
> **Aturan:** laporan ini **tidak mengubah kode**. Perbaikan = tugas @frontend-engineer.
> **Catatan koreksi:** saat audit, saya menemukan **klaim awal saya sendiri yang keliru** (radius tombol) dan membuangnya sebelum publikasi — lihat §6.

---

## 1. Ringkasan

**Cakupan yang diaudit:** 6 halaman (`HomePage`, `MenuPage`, `ProductDetailPage`, `CartPage`, `TrackPage`, `AdminPage`),
10 file komponen (`Button`, `Card`, `BottomSheet`, `ProductCard`(+`ProductCardSkeleton`), `OptionChipGroup`, `PriceText`,
`QuantityStepper`, `States`, `StickyPriceFooter`, `Shell`), 2 file token/style (`tailwind.config.js`, `styles/index.css`).

**Total temuan: 22**

| Tingkat | Jumlah | Sifat |
|---|---|---|
| 🔴 **Tinggi** | **5** | Fungsi inti hilang / gagal WCAG AA / HTML invalid |
| 🟡 **Sedang** | **9** | Menyimpang dari token, a11y tak lengkap, duplikasi, state hilang |
| 🟢 **Rendah** | **8** | Ketidaksesuaian dokumen↔kode, konsistensi, optimasi kecil |

**Kabar baik singkat:** fondasi token & komponen inti sudah kuat (lihat §5). Masalah utama terkonsentrasi di **TrackPage & AdminPage** (belum menyentuh token/state) dan **satu CTA mati di Cart**.

**Catatan penting (temuan dokumen):** beberapa token yang tertulis di `DESIGN-SYSTEM.md` ternyata **belum ada di `tailwind.config.js`** (`shadow-elev1/2`, `text-caption`, `text-price`) → dokumen lebih maju dari kode (lihat M1, M2, R5). Ini temuan jujur; perlu disinkronkan.

---

## 2. Tabel Temuan

### 🔴 Tinggi

| # | File:baris | Masalah | Bukti (kutipan) | Rujukan DS | Saran perbaikan |
|---|---|---|---|---|---|
| **T1** | `routes/CartPage.tsx:126` | Tombol **Checkout** tidak punya `onClick`/navigasi — CTA utama mati | `<Button block size="lg">Checkout</Button>` | UX-FLOWS §2 (aksi utama Checkout) | Bungkus `Link to="/checkout"` **atau** `onClick={() => navigate('/checkout')}`; sediakan `CheckoutPage` (issue #11) |
| **T2** | `routes/TrackPage.tsx:22` | `text-neutral-400` (#A3A3A3) di atas putih = **≈2.5:1** → gagal WCAG AA untuk teks | `<p className="mt-3 text-xs text-neutral-400">` | DS §1.2 (teks ≥4.5:1) | Ganti ke `text-text-muted` (#6B6257, 5.98:1 ✔) |
| **T3** | `routes/TrackPage.tsx:11,14,18,22` | Seluruh halaman memakai warna **non-token** (`text-neutral-*`), bukan token design system | `<p className="text-sm text-neutral-500">Status: …` | DS §1.1 (warna dari token) | Ganti `text-neutral-500/400` → `text-text-muted`; jadikan token satu-satunya sumber warna |
| **T4** | `routes/TrackPage.tsx:9–26` | Tidak ada **state** loading (skeleton) / error / empty; status tidak diumumkan ke screen reader (`aria-live` hilang) | `{state.status ?? 'memuat…'}` (teks, bukan skeleton); tak ada `aria-live` | UX-FLOWS §5 (state + `aria-live`); DS §7.6 | Tambah skeleton timeline, `ErrorState` + retry, dan `aria-live="polite"` pada blok status |
| **T5** | `routes/HomePage.tsx:26–30`, `routes/CartPage.tsx:39–42` | `<Link>` membungkus `<Button>` → menghasilkan `<a><button>` (nested interactive, HTML invalid, 2 tab-stop) | `<Link to="/menu" className="mt-5 inline-block"><Button variant="secondary" size="lg">Lihat Menu</Button></Link>` | DS §7.4 (fokus/urutan Tab) | Pakai satu elemen: `<Button as={Link} to="/menu">` **atau** `<Link className="…btn…">`; jangan sarangkan tombol dalam tautan |

### 🟡 Sedang

| # | File:baris | Masalah | Bukti (kutipan) | Rujukan DS | Saran perbaikan |
|---|---|---|---|---|---|
| **M1** | `components/ui/Card.tsx:22,24`; `components/layout/Shell.tsx:49`; `components/ui/BottomSheet.tsx:118` | Shadow **hardcode**; token `shadow-elev1/elev2` (DS §4) **tidak ada** di `tailwind.config.js` | `shadow-[0_1px_2px_rgba(0,0,0,0.06)]`; `shadow-[0_-4px_16px_rgba(0,0,0,0.10)]` | DS §4 (shadow-elev1/elev2) | Tambah `boxShadow: { elev1, elev2, hover }` di config, lalu pakai `shadow-elev1` — **doc/code mismatch** |
| **M2** | `tailwind.config.js:32–38` | Token `text-caption` & `text-price` (DS §2) **tidak didefinisikan**; halaman memakai default Tailwind (`text-2xl/xl/lg/xs`) | `fontSize: { display, h1, h2, h3, body }` (tanpa `caption`/`price`) | DS §2 (skala tipografi) | Definisikan `caption` & `price`; ganti `text-2xl`→`text-h1` dst. — **doc/code mismatch** |
| **M3** | `routes/MenuPage.tsx:47`; `components/domain/OptionChipGroup.tsx:46`; `routes/ProductDetailPage.tsx:153`; `components/layout/Shell.tsx:57` | Spacing **bukan kelipatan 4pt** | `px-3 py-2.5` (10px); `px-3 py-1.5` (6px); `px-1.5` (6px) | DS §3 (spacing 4pt) | Ganti ke skala 4pt: `py-3`(12) / `py-2`(8); hindari nilai `.5` |
| **M4** | `routes/CartPage.tsx:81–103` | Fulfillment pakai `role="radio"` tetapi container `<fieldset>` **tanpa `role="radiogroup"`** — tidak konsisten dgn `OptionChipGroup` | `<div className="flex flex-wrap gap-2">` (tanpa role) berisi `<button role="radio" aria-checked=…>` | DS §7.3; bandingkan `OptionChipGroup.tsx:32` | Tambah `role="radiogroup"` + `aria-label="Metode pengambilan"` pada pembungkus |
| **M5** | `routes/MenuPage.tsx:56–76` | Pola ARIA **tab tidak lengkap**: `role="tab"` tanpa `aria-controls`, tanpa `role="tabpanel"`, tanpa navigasi panah | `<div … role="tablist" aria-label="Kategori menu">` → `<button role="tab" aria-selected=…>` | DS §7.4 | Lengkapi pola tab (tabpanel + `aria-controls` + arrow keys) **atau** turunkan ke tombol filter biasa |
| **M6** | `routes/ProductDetailPage.tsx:137–168`; `routes/CartPage.tsx:81–103`; `routes/MenuPage.tsx:56–76` | **Duplikasi pola chip** (3 implementasi hampir identik: varian, fulfillment, kategori) | `'inline-flex min-h-[44px] … rounded-pill border px-3 py-1.5 …'` (di-copy di 3 file) | DS §5.14 (`OptionChipGroup`) & prinsip "variasi lewat props, bukan fork" | Ekstrak satu `Chip`/`SegmentedControl` reusable; pakai di ketiganya |
| **M7** | `routes/AdminPage.tsx:13` | Loading pakai **teks**, tanpa skeleton/retry/empty; halaman masih placeholder (bukan order queue) | `{isLoading && <p className="text-sm text-neutral-500">Memuat…</p>}` | DS §5.7 (Skeleton) & §5.9 (ErrorState); UX-FLOWS §6 | Tambah `Skeleton`, `ErrorState`+retry; ganti ke `text-text-muted`; bangun order queue (Sprint 4) |
| **M8** | `routes/HomePage.tsx:57–62` | Tidak ada **empty state** bila `featured` kosong (grid render kosong tanpa pesan) | `featured.map((p) => <ProductCard …/>)` (tanpa cabang `length === 0`) | DS §5.8 (EmptyState) | Tambah `EmptyState` "Belum ada rekomendasi" |
| **M9** | `components/layout/Shell.tsx:7–8` + `App.tsx:52–53` | Nav `/orders` & `/profile` **mengarah ke redirect** (bukan halaman) → tautan menyesatkan | `{ to: '/orders', label: 'Pesanan' }` … `<Route path="/orders" element={<Navigate to="/menu" replace />} />` | UX-FLOWS §1; DS §7.4 | Sembunyikan nav sampai halaman ada (Sprint 3) **atau** tampilkan "segera hadir" |

### 🟢 Rendah

| # | File:baris | Masalah | Bukti (kutipan) | Rujukan DS | Saran perbaikan |
|---|---|---|---|---|---|
| **R1** | `tailwind.config.js:13,17` | Dua nilai hover berbeda: `brand-hover` **#5A3E2B** vs `brand-600` **#5C402E**; DS §1.1 memetakan keduanya ke satu nilai | `hover: '#5A3E2B'` … `600: '#5C402E'` | DS §1.1 | Satukan (mis. tombol pakai `brand-hover`) atau pisahkan perannya di DS |
| **R2** | `routes/ProductDetailPage.tsx:219` | Gambar galeri tanpa `loading="lazy"` (kartu produk sudah punya) | `<img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />` | DS §5.12 (pola lazy) | Tambah `loading="lazy" decoding="async"` |
| **R3** | `routes/HomePage.tsx:23` | `text-brand-100` dipakai sebagai **warna teks**; token ini diperuntukkan latar/border | `<p className="mt-2 max-w-xl text-brand-100">` | DS §1.1 (brand-100 = border/latar) | Pakai `text-brand-fg`/`text-white` (kontras 5.89:1 ✔ sama, tapi semantik benar) |
| **R4** | `components/layout/Shell.tsx:49` | Shadow CartFAB `0 4px 16px rgba(0,0,0,0.18)` ≠ token `elev2` (`0 -4px 16px …0.10`) | `shadow-[0_4px_16px_rgba(0,0,0,0.18)]` | DS §4 (elev2) | Tambah token `elev-fab` atau pakai `elev2` |
| **R5** | `DESIGN-SYSTEM.md` §5.6 vs `BottomSheet.tsx` | DS menyebut "desktop (≥lg) = **Modal terpusat**", kode hanya punya `BottomSheet` | `BottomSheet` tanpa varian modal | DS §5.6 | ✅ **Diputuskan PO:** tandai **belum diimplementasi (backlog)** di DS §5.6 — sudah diperbarui |
| **R6** | `routes/ProductDetailPage.tsx:66–72` | Skeleton **inline** (duplikasi) padahal ada `ProductCardSkeleton` | `<div className="h-64 w-full rounded-card bg-brand-100" />` | DS §5.7 | Ekstrak `ProductDetailSkeleton` reusable |
| **R7** | `components/ui/BottomSheet.tsx:135` | Drag handle memakai warna **non-token** `bg-neutral-300` | `<span className="h-1 w-9 rounded-full bg-neutral-300" …>` | DS §1.1 | Ganti ke token (mis. `bg-border`) |
| **R8** | `components/domain/States.tsx:46` | Tombol "Coba lagi" memakai `size="sm"` (**36px < 44px**) — di bawah target sentuh untuk aksi pemulihan | `<Button variant="secondary" size="sm">Coba lagi</Button>` | **DS §5.9** (menyebut `sm`) **vs DS §7.2** (semua kontrol ≥44px) | ✅ **Diputuskan PO: §7.2 menang** → naikkan ke `size="md"` (44px). Kontradiksi DS §5.9 sudah diperbaiki |

---

## 3. Peta Kepatuhan per Halaman

| Halaman | Status | Alasan |
|---|---|---|
| `HomePage.tsx` | ⚠️ **Sebagian** | Struktur & token baik, ada skeleton + `ErrorState`. Gagal: `<Link><Button>` (T5), tanpa empty state (M8), tipografi default (M2), `brand-100` sbg teks (R3) |
| `MenuPage.tsx` | ✅ **Patuh** (minor) | Label `sr-only` ✔, tab ≥44px ✔, skeleton/empty/error lengkap ✔. Minor: spacing 10px (M3), ARIA tab tak lengkap (M5) |
| `ProductDetailPage.tsx` | ⚠️ **Sebagian** | Kuat: skeleton, error, `OptionChipGroup`, `StickyPriceFooter`, `BottomSheet`, validasi harga real-time ✔. Gagal: duplikasi chip varian (M6), skeleton inline (R6), img tanpa lazy (R2) |
| `CartPage.tsx` | ❌ **Menyimpang** | **CTA Checkout mati** (T1), `<Link><Button>` (T5), fulfillment tanpa `radiogroup` (M4), spacing (M3) |
| `TrackPage.tsx` | ❌ **Menyimpang** | Warna non-token (T3), kontras gagal (T2), tanpa state + `aria-live` (T4); belum pakai `StatusTimeline` |
| `AdminPage.tsx` | ❌ **Menyimpang** | Masih placeholder; loading teks tanpa skeleton/retry (M7), warna non-token; bukan order queue (Sprint 4) |

### Komponen

| Komponen | Status | Catatan |
|---|---|---|
| `Button.tsx` | ✅ Patuh | Varian/state lengkap; radius `rounded-lg` & `sm` 36px **sesuai DS §4/§5.1** |
| `Card.tsx` | ✅ Patuh | Shadow hardcode (M1) |
| `BottomSheet.tsx` | ✅ Patuh | Focus-trap/Esc/aria-modal/safe-area ✔; handle non-token (R7) |
| `ProductCard.tsx` (+Skeleton) | ✅ Patuh | `alt`, lazy, badge "Habis" ✔ |
| `OptionChipGroup.tsx` | ✅ Patuh | `role`, `aria-checked`, ikon ✓, ≥44px ✔; spacing 6px (M3) |
| `PriceText.tsx` | ✅ Patuh | `tabular-nums` + format terpusat ✔ |
| `QuantityStepper.tsx` | ✅ Patuh | 44×44px, `aria-label`, `aria-live` ✔ |
| `States.tsx` | ⚠️ Sebagian | `role="alert"` ✔; tombol `sm` 36px (R8) |
| `StickyPriceFooter.tsx` | ✅ Patuh | Safe-area, alasan `role="alert"` ✔ |
| `Shell.tsx` | ✅ Patuh | Skip-link, nav ≥44px, FAB 56px ✔; shadow FAB (R4) |

---

## 4. Rekomendasi Prioritas

### 🔥 Harus dikerjakan @frontend-engineer di **#11** (Sprint 2 — Cart/Checkout/Pembayaran)
1. **T1** — perbaiki CTA Checkout mati di `CartPage` (blokir alur belanja).
2. **T5** — hilangkan `<Link><Button>` (Home & Cart) → satu elemen interaktif.
3. **M4** — tambah `role="radiogroup"` pada fulfillment (a11y cepat, berisiko rendah).
4. **M1 + M2** — tambah token `boxShadow` & `fontSize.caption/price` di `tailwind.config.js`, lalu pakai (menutup celah dokumen↔kode sebelum komponen #11/#12 menumpuk).
5. **M6** — ekstrak satu komponen chip sebelum 3 duplikasi menyebar lebih jauh.
6. **M3** — rapikan spacing ke grid 4pt di file yang disentuh #11.

### 🌤️ Menyusul (Sprint 3–4, sesuai jadwal fitur)
- **T2, T3, T4** + `StatusTimeline` → bersama **Tracking real-time (#12, Sprint 3)**.
- **M7 + order queue** → bersama **Admin (#13, Sprint 4)**.
- **M5** — lengkapi ARIA tab saat Menu dirapikan.
- **M8, M9** — empty state Home & nav placeholder (kecil, bisa kapan saja).

### 🧹 Backlog kebersihan (kapan saja)
- **R1–R8** — satukan hover token, lazy galeri, semantik `brand-100`, token FAB, tandai modal desktop, ekstrak skeleton, token handle sheet, naikkan tombol "Coba lagi".

### 📄 Keputusan PO atas temuan dokumen (sudah final)
- **M1/M2 (doc↔code):** **kode menyesuaikan dokumen** — token `boxShadow` (`elev1/elev2/hover`) & `fontSize.caption/price` ditambahkan di `tailwind.config.js` sebagai bagian **#11**. Dokumen = kontrak yang benar.
- **R5 (modal desktop):** ditandai **belum diimplementasi (backlog)** di DS §5.6 — sudah diperbarui.
- **R8 (DS §5.9 vs §7.2):** **§7.2 menang** — tombol "Coba lagi" naik ke `size="md"` (44px); kontradiksi di DS §5.9 sudah diperbaiki.
- **Catatan:** perubahan DS di atas sudah diterapkan di `docs/DESIGN-SYSTEM.md` pada PR ini (§5.6 & §5.9).

---

## 5. Catatan Positif (yang sudah baik)

1. **Fondasi token bersih** — `tailwind.config.js` + `index.css` memakai brand `#6F4E37`, Inter, `tabular-nums`, `:focus-visible` global, dan `prefers-reduced-motion` ✔.
2. **Aksesibilitas di banyak tempat sudah benar**: `sr-only` label pencarian (`MenuPage:37`), skip-link "Lompat ke konten utama" (`App.tsx:34`), `aria-label` pada CartFAB (`Shell.tsx:48`), `role="radiogroup"`+`aria-label` di `OptionChipGroup:32`, `role="alert"` di `States:38` & `StickyPriceFooter:43`.
3. **Target sentuh 44px konsisten** di nav (`Shell:27`), chip kategori (`MenuPage:67`), chip opsi (`OptionChipGroup:46`), stepper (`QuantityStepper:28,40`), fulfillment (`CartPage:92`).
4. **Status tidak hanya warna**: chip terpilih pakai ikon ✓ (`OptionChipGroup:54-58`), badge "Habis" bertekstur (`ProductCard:38-42`) — sesuai WCAG 1.4.1.
5. **State loading/empty/error lengkap** di `MenuPage` (skeleton + empty + error) dan `ProductDetailPage` (skeleton + error) — pola yang benar, tinggal ditiru TrackPage/AdminPage.
6. **BottomSheet berkualitas**: focus-trap, `Esc`, `aria-modal`, body-scroll lock, fokus kembali ke pemicu, safe-area (`BottomSheet:33-52,106-117`) — implementasi a11y yang matang.
7. **Harga satu sumber**: Cart & PDP memakai `computeTotals`/`selectionUnitPrice` dari `lib/pricing.ts` — tidak ada perhitungan liar.
8. **Route-level code splitting** + fallback skeleton (`App.tsx:10-28`) — bagus untuk performa awal.

---

## 6. Catatan Metodologi & Koreksi Diri

- **Semua temuan berasal dari kode nyata** (bukan tebakan). Bila ada keraguan, ditandai eksplisit (mis. kontras `text-neutral-400` = "≈2.5:1" dihitung, bukan diklaim presisi).
- **Koreksi yang saya buang sebelum publikasi:** draf awal memuat temuan *"radius tombol `rounded-lg` 8px ≠ 12px"*. Setelah membaca ulang `DESIGN-SYSTEM.md` §4, **DS sendiri menyatakan `rounded-lg` (8px) untuk tombol** → kode **patuh**, temuan itu **tidak valid** dan dihapus. Pelajaran: **audit wajib membaca dokumen rujukan, bukan asumsi.**
- **Temuan dokumen (M1, M2, R5, R8)** membuktikan `DESIGN-SYSTEM.md` (baru di-merge) sudah **sedikit lebih maju dari kode** atau punya **pertentangan internal** — perlu disinkronkan, bukan berarti kode salah.
- **Tindak lanjut (revisi v1.1, keputusan PO):** M1/M2 → kode menyesuaikan dokumen (token ditambah di #11); R5 → ditandai backlog di DS §5.6; R8 → DS §5.9 diperbaiki (`sm`→`md`, §7.2 menang). Perubahan diterapkan di `docs/DESIGN-SYSTEM.md` pada PR yang sama.

---

*UI Audit v1.0 — 22 temuan (5 tinggi / 9 sedang / 8 rendah). Semua temuan menyertakan `file:baris` + kutipan kode nyata. Laporan ini tidak mengubah kode; perbaikan diserahkan ke @frontend-engineer.*
