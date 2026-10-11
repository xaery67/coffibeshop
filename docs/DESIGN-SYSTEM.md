# 🎨 Design System — CoffeeShop Online

> **Versi:** v1.0 · **Tanggal:** 2026-10-12 · **Pemilik:** UI/UX Designer (@ui-ux-designer)
> **Status:** Siap implementasi (handoff Sprint 2/3)
> **Sumber kebenaran token:** dokumen ini (menggantikan placeholder). Selaras dengan `apps/web/tailwind.config.js` & `apps/web/src/styles/index.css`.
> **Referensi:** `docs/PRD-FRONTEND-UX.md`, `docs/PRD-FRONTEND.md` §6, `docs/SPRINT-PLAN.md`.

Dokumen ini adalah **satu sumber kebenaran** untuk token & komponen dasar. Aturan emas:
**variasi visual lewat token/props, bukan fork komponen.** Setiap nilai token di sini
sudah/akan tersedia sebagai *CSS variable* + *Tailwind preset* sehingga frontend cukup
memakai nama token, bukan hex mentah.

---

## 0. Prinsip Desain

1. **Mobile-first** — pelanggan memesan dari HP; layout 1 kolom, aksi utama di *thumb zone*.
2. **Cepat (< 90 detik)** — sedikit ketukan, tanpa form berlebih, guest-first.
3. **Transparan** — harga & status selalu terlihat dan diperbarui real-time.
4. **Konsisten** — warna/ukuran/jarak hanya dari token; komponen dipakai ulang lintas layar.
5. **Aksesibel (WCAG 2.1 AA)** — kontras, target sentuh, fokus, label (lihat §7).

**Brand:** Coffee Brown `#6F4E37` · **Font:** Inter · **Grid jarak:** kelipatan 4pt.

---

## 1. Token Warna

### 1.1 Palet & penggunaan

| Token (Tailwind) | CSS Variable | Nilai | Penggunaan |
|---|---|---|---|
| `brand` (DEFAULT/500) | `--color-primary` | `#6F4E37` | CTA utama, ikon aktif, teks judul, brand |
| `brand-fg` | `--color-primary-fg` | `#FFFFFF` | Teks/ikon di atas latar `brand` |
| `brand-hover` / `brand-600` | `--color-primary-hover` | `#5A3E2B` | State hover tombol primary |
| `brand-700` | — | `#493326` | State active/pressed |
| `brand-100` | — | `#EDE3DA` | Border halus, latar chip/badge lembut |
| `brand-50` | `--color-bg-subtle` | `#F7F4F0` (Cream) | Latar section alternatif, latar hover lembut |
| `secondary` | `--color-secondary` | `#C8A27A` (Latte) | **Latar/fill saja** (kontras < 3:1) |
| `secondary-fg` | — | `#3A2A18` | Teks di atas latar `secondary` |
| `accent` | `--color-accent` | `#E8B44F` (Caramel) | **Latar/fill saja** (highlight promo) |
| `accent-fg` | — | `#3A2A18` | Teks di atas latar `accent` |
| `success` | `--color-success` | `#2E7D32` | Status sukses/PAID/COMPLETED, toast sukses |
| `success-fg` | — | `#FFFFFF` | Teks di atas `success` |
| `warning` | `--color-warning` | `#ED8B00` | **Latar/fill saja** (low-stock, PENDING) |
| `warning-fg` | `--color-warning-fg` | `#8A4B00` | **Teks** warna peringatan (kontras lolos) |
| `error` | `--color-error` | `#C62828` | Gagal bayar, CANCELLED, aksi hapus |
| `error-fg` | — | `#FFFFFF` | Teks di atas `error` |
| `info` | `--color-info` | `#1565C0` | Info netral, banner, tautan |
| `info-fg` | — | `#FFFFFF` | Teks di atas `info` |
| `text` | `--color-text` | `#1F1B16` | Teks utama |
| `text-muted` | `--color-text-muted` | `#6B6257` | Teks sekunder, meta, caption |
| `border` | `--color-border` | `#E5DED6` | Garis, divider, border input |
| `bg` | `--color-bg` | `#FFFFFF` | Latar utama |
| `focus` | `--color-focus` | `#1565C0` | Focus ring (WCAG 2.4.7) |

> **Aturan `-fg`:** setiap token yang dipakai sebagai **latar** punya pasangan `-fg` eksplisit
> untuk teks di atasnya. Jangan pernah menaruh teks gelap tanpa `-fg` yang kontras.

### 1.2 Hasil uji kontras (WCAG 2.1)

Rasio dihitung terhadap **putih `#FFFFFF`** (kecuali dicatat lain). Ambang: teks **≥ 4.5:1**, elemen UI/ikon **≥ 3:1**.

| Warna | Rasio vs putih | Lolos sebagai teks? | Lolos elemen UI? | Catatan |
|---|---|---|---|---|
| `brand #6F4E37` | **7.44:1** | ✔ | ✔ | teks putih di atasnya juga 7.44:1 |
| `text-muted #6B6257` | **5.98:1** | ✔ | ✔ | |
| `success #2E7D32` | **5.13:1** | ✔ | ✔ | teks putih di atasnya 5.13:1 |
| `error #C62828` | **5.62:1** | ✔ | ✔ | teks putih di atasnya 5.62:1 |
| `info #1565C0` | **5.75:1** | ✔ | ✔ | juga `--color-focus` |
| `warning-fg #8A4B00` | **6.80:1** | ✔ | ✔ | **pakai ini untuk teks peringatan** |
| `warning #ED8B00` | **2.53:1** | ✖ | ✖ | **fill saja** |
| `secondary #C8A27A` | **2.36:1** | ✖ | ✖ | **fill saja** |
| `accent #E8B44F` | **1.90:1** | ✖ | ✖ | **fill saja** |

> ⚠️ `warning`, `secondary`, `accent` **tidak boleh** menjadi warna teks atau ikon tunggal
> yang menyampaikan makna. Status selalu disertai **ikon + label**, bukan warna saja (WCAG 1.4.1).

---

## 2. Tipografi

**Font:** `Inter` (fallback `system-ui, sans-serif`). Base 16px (`html { -webkit-text-size-adjust: 100% }`).

| Token | Ukuran / Line-height | Weight | Penggunaan |
|---|---|---|---|
| `text-display` | 28px / 34px | 700 | Judul hero / splash |
| `text-h1` | 24px / 30px | 700 | Judul layar (mis. "Keranjang") |
| `text-h2` | 20px / 26px | 600 | Judul section |
| `text-h3` | 16px / 22px | 600 | Judul kartu |
| `text-body` | 14px / 20px | 400 | Teks isi (default) |
| `text-sm` | 14px / 20px | 400 | Teks kecil / meta (Tailwind default) |
| `text-caption` | 12px / 16px | 400 | Caption, keterangan, disclaimer |
| `text-price` | 16px / 20px | 700 · **tabular-nums** | Harga (angka rata, tidak "goyang") |

**Aturan:**
- Semua elemen harga memakai `tabular-nums` (class `.tabular-nums` sudah ada di `index.css`).
- Ukuran font **input ≥ 16px** di mobile (mencegah auto-zoom iOS Safari) — sudah di-set global.
- Maksimal 2–3 tingkat heading per layar agar hierarki jelas.

---

## 3. Spacing (Skala 4pt)

Semua jarak kelipatan **4px**. Tailwind default sudah 4px/unit (`p-4` = 16px); token eksplisit:

| Token | Nilai | Penggunaan umum |
|---|---|---|
| `space-1` | 4px | jarak ikon–teks |
| `space-2` | 8px | gap antar elemen dalam kartu |
| `space-3` | 12px | gap antar kartu / grid |
| `space-4` | 16px | **padding layar** (default), padding kartu |
| `space-5` | 20px | padding kartu KPI |
| `space-6` | 24px | jarak antar section |
| `space-8` | 32px | pemisah section besar |
| `space-10` | 40px | hero / header |
| `space-12` | 48px | |
| `space-16` | 64px | |

**Aturan layout:** padding horizontal layar = **16px**; gap grid produk = **12px**;
jarak antar section = **24–32px**.

---

## 4. Radius, Shadow & Elevasi

| Token | Nilai | Penggunaan |
|---|---|---|
| `rounded-sm` | 8px | chip kecil, badge |
| `rounded-lg` | 8px | tombol, input (Tailwind default 0.5rem) |
| `rounded-card` | **12px** | kartu, panel, sheet item |
| `rounded-xl` | 16px | modal besar |
| `rounded-pill` | 999px | badge, chip filter, tombol pil |

| Token | Nilai | Penggunaan |
|---|---|---|
| `shadow-elev1` | `0 1px 2px rgba(0,0,0,0.06)` | kartu default |
| `shadow-elev2` | `0 -4px 16px rgba(0,0,0,0.10)` | bottom sheet, sticky footer |
| `shadow-hover` | `0 4px 16px rgba(0,0,0,0.08)` | kartu interaktif saat hover |

**Elevasi (urutan z):** konten `0` → sticky bar/header `10` → bottom sheet/overlay `50` → toast `60`.

---

## 5. Komponen Dasar

> Legenda status: ✅ **sudah ada di repo** (jangan diubah strukturnya, cukup pakai) · 🆕 **perlu dibuat** oleh @frontend-engineer.

### 5.1 Button ✅ `src/components/ui/Button.tsx`

Varian: `primary` · `secondary` · `ghost` · `danger` — Ukuran: `sm` · `md` · `lg` — State: default/hover/active/disabled/loading.

| Variant | Latar | Teks | Hover | Active |
|---|---|---|---|---|
| `primary` | `brand` | `brand-fg` | `brand-600` | `brand-700` |
| `secondary` | `brand-100` | `brand-700` | `brand-50` | — |
| `ghost` | transparan | `brand` | `brand-50` | — |
| `danger` | `error` | putih | brightness 95% | — |

| Size | Tinggi min | Padding-x | Font |
|---|---|---|---|
| `sm` | 36px | 12px | `text-sm` |
| `md` (default) | **44px** | 16px | `text-sm` |
| `lg` | 48px | 24px | `text-base` |

**State wajib:** `disabled:opacity-50 disabled:cursor-not-allowed`; `loading` menampilkan spinner
(`aria-busy="true"`, tombol disabled); `block` → `w-full`. **Target sentuh ≥ 44px** (kecuali `sm` 36px yang hanya untuk aksi sekunder di dalam baris padat).

### 5.2 Input & Form 🆕

- Tinggi kontrol **≥ 44px**; radius `rounded-lg`; border `border`; font **≥ 16px**.
- State: default / hover (border `brand-500/50`) / focus (ring `focus` 2px, offset 2px) / error (border `error`, pesan `text-error` + `aria-describedby`) / disabled (`opacity-50`).
- Label **selalu** ada di atas field; field wajib ditandai teks `*` **dan** atribut `required`/`aria-required` (bukan hanya warna).
- `inputmode`/`autocomplete` tepat: `tel` (WhatsApp), `numeric` (kuantitas/VA), `email`.
- Teks bantuan opsional di bawah field (`text-caption text-muted`).

### 5.3 Card ✅ `src/components/ui/Card.tsx`

Varian: `product` · `order` · `kpi`. Radius `rounded-card`, `shadow-elev1`, border `brand-100`.
`interactive` → tambah transisi + `shadow-hover` + border `brand-500/40` saat hover/focus-within.
Rasio gambar produk **1:1** (grid) atau **4:3** (kartu lebar).

### 5.4 Badge 🆕

Pil kecil (`rounded-pill`, `px-2 py-0.5`, `text-caption font-semibold`). Varian:

| Varian | Latar | Teks | Contoh |
|---|---|---|---|
| `bestseller` | `accent` | `accent-fg` | "Best Seller" |
| `promo` | `brand` | `brand-fg` | "Diskon 20%" |
| `success` | `success/10` | `success` | "PAID", "Siap" |
| `warning` | `warning/15` | `warning-fg` | "Menunggu" |
| `error` | `error/10` | `error` | "Gagal" |
| `neutral` | `brand-50` | `text-muted` | "Draft" |

> Badge status **wajib** disertai ikon/label; jangan mengandalkan warna saja.

### 5.5 Toast 🆕

Notifikasi mengambang (`shadow-elev2`, `rounded-card`), posisi **atas** atau **bawah** —
**tidak boleh** menutupi CTA utama. Varian `success` / `error` / `info`.
`role="status"` + `aria-live="polite"`; auto-dismiss 4s (error 6s) + tombol tutup.
Ikon + teks; animasi menghormati `prefers-reduced-motion`.

### 5.6 Modal / BottomSheet ✅ `src/components/ui/BottomSheet.tsx`

- **Mobile = BottomSheet**; **desktop (≥ lg) = Modal terpusat** (konten sama). *Status: varian **desktop-modal belum diimplementasi** (backlog) — kode saat ini hanya `BottomSheet`; lihat audit UI §R5.*
- Snap: **peek 25% · half 60% · full 92%** (default kustomisasi = `full`).
- Drag handle area ≥ 44px (`aria-label="Geser untuk menutup"`), tutup bila geser > 30% tinggi.
- Focus-trap, `Esc` menutup, `aria-modal="true"`, body scroll lock, fokus kembali ke pemicu, safe-area.
- Footer sticky opsional (mis. `StickyPriceFooter`).

### 5.7 Skeleton Loading 🆕

Placeholder abu (`bg-brand-100/60`, `animate-pulse`, `rounded-card`) meniru bentuk konten
(kartu produk, baris list, KPI). Tujuan: **mencegah layout shift (CLS)**. Tidak untuk loading > 10s (pakai `ErrorState` + retry).

### 5.8 Empty State ✅ `src/components/domain/States.tsx`

Ikon/ilustrasi (`aria-hidden`) + judul + deskripsi + CTA. Dipakai di Cart kosong, riwayat kosong, hasil pencarian kosong.

### 5.9 Error State ✅ `src/components/domain/States.tsx`

`role="alert"`, ikon ⚠️, pesan, tombol "Coba lagi" (`secondary`, **`md` = 44px**). Standar untuk semua fetch gagal.

> **Keputusan (PO, #44):** tombol pemulihan adalah **aksi utama** di layar error → wajib **≥44px (§7.2)**. `sm` (36px) hanya untuk aksi sekunder padat, **bukan** aksi recovery. Sebelumnya §5.9 menulis `sm` → **kontradiksi dengan §7.2**, sudah diperbaiki di sini.

### 5.10 QuantityStepper ✅ `src/components/domain/QuantityStepper.tsx`

Tombol −/+ inline (**tanpa tombol "Apply"**), target sentuh 44×44px, nilai `tabular-nums` +
`aria-live="polite"`, label `aria-label` per tombol ("Kurangi"/"Tambah"). Disabled di batas min/max.

### 5.11 PriceText ✅ `src/components/domain/PriceText.tsx`

Format Rupiah terpusat (`formatIDR`: `84000 → "Rp 84.000"`), `tabular-nums`. **Selalu** pakai ini, jangan format manual.

**Props:** `value: number`, `size?: 'sm'|'md'|'lg'`, `className?`. Kelas dasar: `tabular-nums font-bold text-brand`.

### 5.12 ProductCard ✅ `src/components/domain/ProductCard.tsx`

Kartu produk untuk **Home, Menu, Rekomendasi** (dipakai #11). Seluruh kartu = tautan ke PDP.

**Props:** `product: ProductDTO`.

- Struktur: `Card interactive` → `Link to={/product/:id}` (`aria-label="Lihat detail {nama}"`) → gambar rasio **4:3** (`object-cover`, `loading="lazy"`, `decoding="async"`, `alt={product.name}`) → judul `text-h3 line-clamp-1` → deskripsi `line-clamp-2 text-muted` → footer `PriceText` + badge **"Habis"** bila `!is_available`.
- Bila tanpa gambar: placeholder ☕ (`aria-hidden`). Badge "Habis" = `bg-error/10 text-error` (ikon/teks, bukan warna saja).
- **A11y:** satu tautan fokus per kartu; `alt` = nama produk; `focus-visible` ring pada Link.

### 5.13 ProductCardSkeleton ✅ `src/components/domain/ProductCard.tsx`

Placeholder bentuk kartu produk (`aspect-[4/3]` + 3 bar) dengan `animate-pulse`, `aria-hidden="true"`.
Cegah layout shift saat grid produk memuat. Render `count` sesuai jumlah kolom.

### 5.14 OptionChipGroup ✅ `src/components/domain/OptionChipGroup.tsx`

Pemilih opsi pada **PDP** (dipakai #11). Mendukung `single` (radio) & `multiple` (checkbox), menghormati `min_select`/`max_select`.

**Props:** `option: OptionDTO`, `selectedIds: string[]`, `onToggle: (valueId: string) => void`.

- Struktur: `<fieldset>` + `<legend>` (nama opsi + " (wajib)" bila `is_required`; "maks N" bila multiple) → container `role="radiogroup"|"group"` → chip `role="radio"|"checkbox"` + `aria-checked`.
- Chip: `min-h-[44px]`, `rounded-pill`, selected = `border-brand bg-brand-50 text-brand` **+ ikon ✓** (bukan warna saja — WCAG 1.4.1); menampilkan `+{formatIDR(price_adjustment)}` bila ada biaya tambahan.
- Saat mencapai `max_select` (multiple): chip yang belum terpilih `disabled` + `aria-disabled` + `opacity-50`.
- **A11y:** setiap chip ≥ 44px, fokus ring, label grup via `legend`/`aria-label`.

### 5.15 StickyPriceFooter ✅ `src/components/domain/StickyPriceFooter.tsx`

Footer harga real-time + tombol aksi utama di **PDP** (dipakai #11). Harga **wajib** dari PricingEngine (satu sumber).

**Props:** `unitPrice: number`, `onAdd: () => void`, `disabled?: boolean`, `disabledReason?: string`, `addLabel?: string`.

- `sticky bottom-0`, `bg-white/95 backdrop-blur`, border atas `brand-100`, safe-area (`env(safe-area-inset-bottom)`).
- Menampilkan `PriceText size="lg"` + `Button block size="lg"` ("Tambah · Rp XX").
- Bila `disabled`: tombol nonaktif + alasan `role="alert"` `text-warning-fg` (`aria-describedby`) — kombinasi opsi tak tersedia dijelaskan, bukan error setelah submit.

---

## 6. Ikon & Motion

- **Ikon:** set konsisten (mis. Lucide/Phosphor), stroke 2px, ukuran 16/20/24px. Ikon fungsional selalu punya `aria-label` atau teks pendamping; ikon dekoratif `aria-hidden`.
- **Durasi motion:** `fast 150ms` · `base 250ms` · easing `ease`/`ease-out`.
- **Wajib** menghormati `prefers-reduced-motion: reduce` (sudah di-handle global di `index.css` → animasi/transisi ~0ms).

---

## 7. Spesifikasi Aksesibilitas (WCAG 2.1 AA)

### 7.1 Kontras
- Teks ≥ **4.5:1**; elemen UI/ikon ≥ **3:1**; focus ring ≥ **3:1** terhadap latar sekitar.
- Uji utama: **Coffee Brown `#6F4E37` di atas putih = 7.44:1 ✔** dan **teks putih di atas `#6F4E37` = 7.44:1 ✔**.
- Token gagal (`warning`/`secondary`/`accent`) = fill saja; teks pakai `warning-fg` dsb (§1.2).
- **Jangan** membedakan makna hanya dengan warna (WCAG 1.4.1) — tambah ikon/teks.

### 7.2 Target sentuh
- Semua kontrol interaktif **≥ 44×44px** (WCAG 2.5.5); jarak antar kontrol ≥ 8px.
- Tombol `sm` (36px) hanya untuk aksi sekunder dalam baris padat, bukan aksi utama.

### 7.3 Label form
- Setiap field punya `<label>` terasosiasi (atau `aria-label`). Wajib ditandai `*` + atribut.
- Error field: `aria-invalid="true"` + `aria-describedby` menunjuk pesan error.
- Pesan error menyebut cara perbaikan ("Nomor WhatsApp harus 10–13 digit"), bukan sekadar "salah".

### 7.4 Fokus terlihat
- `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }` (sudah di `index.css`).
- Fokus **tidak boleh** terpotong oleh `overflow:hidden`; pastikan offset cukup.
- Urutan Tab logis mengikuti alur visual; tidak ada *focus trap* kecuali di dalam sheet/modal.

### 7.5 Bottom sheet & screen reader
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (judul) atau `aria-label`.
- Saat buka: fokus pindah ke elemen fokus pertama di dalam sheet; Tab/Shift+Tab **terkunci** di dalam.
- `Esc` menutup; setelah tutup fokus **kembali** ke tombol pemicu (WCAG 2.4.3).
- Body scroll dikunci; konten sheet `overflow-y:auto` + `overscroll-behavior:contain`.
- Perubahan status penting (mis. total harga) diumumkan via `aria-live="polite"`.

### 7.6 Lain-lain
- Bahasa halaman `lang="id"`; heading berjenjang (`h1`→`h2`, tanpa lompat).
- Gambar produk punya `alt` deskriptif; tombol ikon punya `aria-label`.
- Tidak ada CAPTCHA di jalur guest checkout.
- Uji: **axe-core** otomatis di CI + manual NVDA/VoiceOver.

---

## 8. Spesifikasi Implementasi (Handoff ke @frontend-engineer)

> Bagian ini kontrak untuk issue #11/#12/#13. **Nama & props mengikuti kode yang sudah ada**;
> jangan mengubah API komponen yang sudah dipakai tanpa koordinasi.

### 8.1 Ringkasan API komponen

| Komponen | Status | Props utama |
|---|---|---|
| `Button` | ✅ | `variant?: 'primary'\|'secondary'\|'ghost'\|'danger'`, `size?: 'sm'\|'md'\|'lg'`, `loading?`, `block?`, `disabled?`, `children` |
| `Card` | ✅ | `variant?: 'product'\|'order'\|'kpi'`, `interactive?`, `children` |
| `BottomSheet` | ✅ | `open`, `onClose`, `snap?: 'peek'\|'half'\|'full'`, `title?`, `footer?`, `children` |
| `QuantityStepper` | ✅ | `value`, `min?`, `max?`, `onChange(next)`, `label?` |
| `PriceText` / `formatIDR` | ✅ | `value: number` (integer Rupiah); `PriceText`: `value`, `size?: 'sm'\|'md'\|'lg'`, `className?` |
| `ProductCard` | ✅ | `product: ProductDTO` |
| `ProductCardSkeleton` | ✅ | — (bentuk kartu produk) |
| `OptionChipGroup` | ✅ | `option: OptionDTO`, `selectedIds: string[]`, `onToggle(valueId)` |
| `StickyPriceFooter` | ✅ | `unitPrice`, `onAdd()`, `disabled?`, `disabledReason?`, `addLabel?` |
| `EmptyState` | ✅ | `icon?`, `title`, `description?`, `action?` |
| `ErrorState` | ✅ | `message?`, `onRetry?` |
| `Input` | 🆕 | `label`, `error?`, `required?`, `hint?`, `inputMode?`, `...inputProps` |
| `Badge` | 🆕 | `variant: 'bestseller'\|'promo'\|'success'\|'warning'\|'error'\|'neutral'`, `children` |
| `Toast` | 🆕 | `variant: 'success'\|'error'\|'info'`, `message`, `onClose`, `duration?` |
| `Skeleton` | 🆕 | `variant: 'product'\|'row'\|'kpi'`, `count?` |

### 8.2 Contoh struktur Tailwind class

**Tombol primary (block):**
```html
<button class="inline-flex items-center justify-center gap-2 rounded-lg font-semibold
               transition min-h-[44px] px-4 text-sm w-full
               bg-brand text-brand-fg hover:bg-brand-600 active:bg-brand-700
               focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
               focus-visible:outline-[var(--color-focus)]
               disabled:cursor-not-allowed disabled:opacity-50">
  Checkout
</button>
```

**Kartu ringkasan harga (aria-live):**
```html
<div class="space-y-1 rounded-card border border-brand-100 bg-white p-4 text-sm tabular-nums" aria-live="polite">
  <div class="flex justify-between"><span>Subtotal</span><span>Rp 84.000</span></div>
  <div class="flex justify-between"><span>Pajak</span><span>Rp 9.240</span></div>
  <div class="flex justify-between border-t border-brand-100 pt-1 font-bold text-brand">
    <span>Total</span><span>Rp 93.240</span>
  </div>
</div>
```

**Chip filter (selected):**
```html
<button role="radio" aria-checked="true"
  class="min-h-[44px] rounded-pill border px-4 text-sm transition
         focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
         focus-visible:outline-[var(--color-focus)]
         border-brand bg-brand-50 font-semibold text-brand">Delivery</button>
```

**Badge status:**
```html
<span class="inline-flex items-center gap-1 rounded-pill bg-success/10 px-2 py-0.5 text-caption font-semibold text-success">
  <svg aria-hidden="true" class="h-3 w-3">…</svg> Siap diambil
</span>
```

**Skeleton kartu produk:**
```html
<div class="rounded-card border border-brand-100 bg-white p-4" aria-hidden="true">
  <div class="aspect-square w-full animate-pulse rounded-lg bg-brand-100/60"></div>
  <div class="mt-3 h-4 w-3/4 animate-pulse rounded bg-brand-100/60"></div>
  <div class="mt-2 h-4 w-1/3 animate-pulse rounded bg-brand-100/60"></div>
</div>
```

### 8.3 Aturan wajib implementasi
1. **Jangan hardcode hex** — pakai token Tailwind (`bg-brand`, `text-text-muted`) atau CSS var.
2. Semua **harga** lewat `formatIDR`/`PriceText` + class `tabular-nums`.
3. Semua **tombol** min `min-h-[44px]` (kecuali `sm` sekunder) + `:focus-visible` ring.
4. Semua **fetch** punya 3 state: `Skeleton` → konten / `EmptyState` / `ErrorState` (+retry).
5. **Status** selalu ikon + teks, tidak warna saja.
6. **BottomSheet** hanya untuk alur mobile; sediakan padanan modal di desktop.
7. Setiap komponen baru: **Storybook story + test a11y (axe)**.

### 8.4 Checklist serah-terima per komponen
- [ ] Nama & props sesuai §8.1
- [ ] Semua state: default/hover/focus/active/disabled/loading (bila relevan)
- [ ] Kontras lolos (§1.2) & target sentuh ≥ 44px
- [ ] Keyboard & screen reader OK
- [ ] Contoh Tailwind class tersedia (§8.2)
- [ ] Story + test a11y hijau di CI

---

*Design System v1.0 — siap dipakai Sprint 2/3. Perubahan token harus lewat review UI/UX agar
Tailwind config, CSS variables, dan dokumen ini tetap sinkron.*
