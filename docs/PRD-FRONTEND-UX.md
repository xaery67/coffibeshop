# PRD-FRONTEND-UX — CoffeeShop Online

> **Peran dokumen:** SUPPORT untuk `PRD-FRONTEND.md` (LEAD: Frontend Engineer).
> **Penulis:** UI/UX Designer. **Versi:** v1.1 · **Status:** Disinkronkan dengan design system (12 Okt 2026).
> **Sumber:** `README.md`, `prd-planning-coffeeshop.md` (§3 Analisis UX, §4 Persona/User Journey), `diagrams/use-case-diagram.md`, `diagrams/process-flow-diagram.md`, `ux-research-findings.md`.
> **Sumber kebenaran terkait:** **token & komponen → `docs/DESIGN-SYSTEM.md`** (di-merge PR #43, `d34e2737`) · **wireframe layar → `docs/UX-FLOWS.md`** · **temuan kepatuhan → `docs/UI-AUDIT.md`** (PR #44, `10e04c00`).
> **Alignment:** Component Tree & route pada `PRD-FRONTEND.md` §2 (route, nama komponen, dan status order memakai penamaan yang sama).

---

## 0. Ringkasan & Ruang Lingkup

Dokumen ini melengkapi PRD-FRONTEND dari sisi **pengalaman pengguna**: user flow, wireframe deskriptif per layar, design tokens, best practices riset yang wajib diadopsi, serta catatan accessibility & mobile-first. Tidak mendefinisikan ulang arsitektur/state (lihat PRD-FRONTEND), tetapi memastikan setiap layar yang dibangun konsisten secara UX dan visual.

**Prinsip desain yang menyatukan seluruh keputusan:**
1. **Pesan dalam < 90 detik** dari buka app (AC keseluruhan PRD §7).
2. **Guest-first** — jangan paksa login; guest checkout adalah jalur utama, bukan sekunder.
3. **Satu layar untuk satu keputusan** — kustomisasi, fulfillment, dan pembayaran masing-masing diselesaikan tanpa berpindah-pindah konteks.
4. **Transparansi harga & status** — harga total dan status order selalu terlihat, diperbarui real-time.
5. **Mobile-first, thumb-friendly** — semua aksi utama berada dalam jangkauan jempol.

---

## 1. User Flow Utama

### 1.1 Customer — Happy Path (buka app → review)

Selaras dengan User Journey PRD §4.3 dan `process-flow-diagram.md` §1.

```
[Buka App/PWA]
   └─> Home (Rekomendasi + Reorder + Promo)         → UC1 Lihat Menu
        ├─> (opsi cepat) "Order Again" 1-klik ──┐
        └─> Menu/Catalog (search, filter, kategori) → UC2 Cari Produk
             └─> Product Detail
                  ├─ Kustomisasi (bottom sheet, 1 layar) → UC4
                  └─> Tambah ke Keranjang               → UC3
                       └─> Cart
                            ├─ Fulfillment (Dine-in/Takeaway/Pickup/Delivery)
                            ├─ Voucher / Poin (opsional)
                            └─> Checkout (stepper ≤ 5 langkah)
                                 ├─ Step1 Fulfillment
                                 ├─ Step2 Waktu & Outlet
                                 ├─ Step3 Kontak  ← Guest Checkout (menonjol) → UC5
                                 ├─ Step4 Metode Pembayaran → UC7
                                 └─ Step5 Konfirmasi
                                      └─> Payment (QRIS/e-wallet/VA/kartu)
                                           ├─ Sukses → status PAID
                                           └─ Gagal  → Retry (ganti metode, tanpa order baru)
                                                └─> Order Tracking (timeline real-time) → UC8
                                                     └─> Status READY → Notifikasi Pickup → UC14
                                                          └─> Ambil pesanan → COMPLETED
                                                               └─> Review & Rating → UC13
```

**Cabang penting (dari process-flow):**
- **Belum login** di checkout → tawarkan *Guest Checkout* atau *Login/Register* (`UC5`/`UC6`), **guest tampil lebih menonjol**.
- **Tidak perlu kustomisasi** → produk langsung masuk cart (1 tap add).
- **Pembayaran gagal** → kembali ke pemilihan metode, **tanpa** membuat order baru; order tetap `PENDING` sampai timeout.
- **No-show** (tidak diambil dalam 15 menit) → staff menghubungi pelanggan → `CANCELLED/NO-SHOW` (ditangani sisi admin).

### 1.2 Member — Jalur Retensi (login → loyalty → reorder)

```
Home (greeting nama + kartu loyalty)
   ├─> Order History (12 bulan) → Reorder 1-klik (semua kustomisasi terisi) → UC10
   ├─> Profile/Loyalty: lihat poin, progress tier → UC11
   ├─> Redeem poin → voucher (extend dari loyalty) → UC12
   └─> Notifikasi status & promo → UC14
```

### 1.3 Owner/Staff — Back Office (dashboard → order queue → laporan)

Selaras dengan `process-flow-diagram.md` §2 dan §4.

```
Login (RBAC)
   ├─> Admin Dashboard: KPI hari ini, grafik penjualan, produk terlaris, low-stock → UC25
   ├─> Order Queue (realtime):
   │     Pesanan baru → Konfirmasi (CONFIRMED) → Cetak Kitchen Ticket → UC15/UC18
   │        └─> BEING_PREPARED → READY → COMPLETED (atau CANCELLED + alasan) → UC16/UC17
   ├─> Menu Management: CRUD produk/varian/harga/visibility → UC19/UC20
   └─> Reports: penjualan, P&L, pajak; Export Excel/CSV (otomatis tgl 1) → UC26/UC27
```

**Status pesanan kanonik** (dipakai konsisten di Customer Tracking & Admin Queue):
`PENDING → PAID → CONFIRMED → BEING_PREPARED → READY → COMPLETED` · jalur batal: `CANCELLED`.

---

## 2. Wireframe / Sketch Deskriptif per Layar Utama

> Format: **text wireframe** (mobile-first, 1 kolom). Setiap blok menyebut nama komponen dari Component Tree PRD-FRONTEND agar implementasi 1:1. `[FAB]` = floating action button, `(sticky)` = menempel saat scroll.

### 2.1 Home / Rekomendasi
```
┌──────────────────────────────┐
│ Halo, Maya 👋        🔔  🛒³  │  GreetingBar · notif · CartFAB(badge)
│ 📍 Outlet Kemang · Buka 08–22 │  OutletSelectorBanner
├──────────────────────────────┤
│ [ Pesan lagi: Kopi Susu ×1 ]  │  OrderAgainRail (F-006, 1-klik)
├──────────────────────────────┤
│ ◀  Promo: Diskon 20% ...  ▶   │  PromoBannerCarousel (F-018)
├──────────────────────────────┤
│ Hot  Cold  Non-Coffee  Food   │  CategoryShortcutGrid
├──────────────────────────────┤
│ Rekomendasi untukmu           │  RecommendationSection
│ ┌────────┐ ┌────────┐         │
│ │ foto   │ │ foto   │         │  ProductCard × n (badge Best Seller)
│ │ Nama   │ │ Nama   │         │
│ │ Rp 25k │ │ Rp 30k │  [+]    │
│ └────────┘ └────────┘         │
├──────────────────────────────┤
│ ⭐ Poin 320 · Silver → Gold   │  LoyaltyTeaserCard (member)
└──────────────────────────────┘
│ Home   Menu   Orders   Profile│  BottomNav (4 tab) + CartFAB
```
- **Tujuan:** jalur tercepat ke pesan ulang & penemuan produk (≤ 3 ketukan, F-001).
- **CTA utama:** kartu produk & OrderAgain. Guest melihat `GreetingBar` "Halo!" dan tidak melihat kartu loyalty (diganti banner "Masuk untuk kumpulkan poin").

### 2.2 Menu / Catalog
```
┌──────────────────────────────┐
│ 🔍 Cari kopi, makanan...      │  SearchBar (autocomplete, debounce 250ms)
├──────────────────────────────┤
│ Hot │Cold│Non-Coffee│Food│Merc│  CategoryTabs (scrollable)
│ [Filter ▾]      [Urutkan ▾]   │  FilterSheet · SortDropdown
├──────────────────────────────┤
│ ┌────────┐ ┌────────┐         │  ProductGrid (virtualized >60)
│ │ produk │ │ produk │         │  2 kolom mobile → 3–4 tablet/desktop
│ └────────┘ └────────┘         │
│ ┌────────┐ ┌────────┐         │
│ └────────┘ └────────┘         │
├──────────────────────────────┤
│        [ 🛒 3 ]               │  CartFAB
└──────────────────────────────┘
```
- **Filter** (vegan, gluten-free, bestseller, rentang harga) dibuka sebagai `BottomSheet`.
- **EmptyState** saat hasil kosong: ilustrasi + saran reset filter.

### 2.3 Product Detail / Kustomisasi
```
┌──────────────────────────────┐
│ ←  [ Galeri Foto Produk ]     │  ProductGallery (blur placeholder)
│ Nama Produk          ⭐4.8    │  ProductHeader
│ Rp 25.000 (harga dasar)       │
│ ▸ Nutrisi & Alergen           │  NutritionAllergenAccordion (opsional)
├──────────────────────────────┤
│ Ukuran                        │  VariantSelector (single)
│ ( )S (•)M ( )L  +Rp5k         │
│ Jenis Susu                    │  OptionGroup (single)
│ ( )Full (•)Oat +Rp6k ( )Soy   │
│ Level Gula / Es / Sirup       │  OptionGroup (single)
│ Topping                       │  ToppingSelector (multi, max)
│ [ ] Extra Shot +Rp8k          │
│ Catatan untuk barista         │  NoteField
│ [__________________________]  │
├──────────────────────────────┤
│ Tambah · Rp 31.000     (sticky)│ StickyPriceFooter (harga real-time)
└──────────────────────────────┘
```
- **Mobile:** seluruh form kustomisasi dirender dalam **BottomSheet satu layar** (best practice §3.2 poin 4); `StickyPriceFooter` = aksi utama.
- **Harga real-time** mengikuti Pricing Engine (PRD-FRONTEND §3.3). Opsi tak tersedia → *disabled* + alasan (tooltip), bukan error setelah submit (F-002).

### 2.4 Cart
```
┌──────────────────────────────┐
│ ← Keranjang                   │
│ [Dine-in][Takeaway][Pickup]   │  FulfillmentTabs (satu selector, F-003)
│ [Delivery]                    │   4 tipe; Delivery → blok alamat di bawah
│ 📍 Outlet Kemang · siap 12 mnt │  OutletPickupInfo (mode non-delivery)
│ 🛵 Alamat: Jl. ... (Ubah)     │  DeliveryAddressCard (mode delivery) ← AddressBook
│    Ongkir: Rp 10.000 · 30 mnt │   estimasi + ongkir (server)
├──────────────────────────────┤
│ ┌──┐ Kopi Susu Oat · L       │  CartItemRow
│ │img│ Susu Oat, Less sugar    │   ItemMeta
│ └──┘  (−) 2 (+)   Rp 62.000   │   QtyStepper inline (TANPA "Apply")
│                    🗑️ (swipe)  │   SwipeToDelete
│ ┌──┐ Croissant ×1    Rp 22.000│
├──────────────────────────────┤
│ Punya kode promo? [______][+] │  VoucherInput
│ Tukar poin: 320 pts (slider)  │  PointsRedeemer
├──────────────────────────────┤
│ Subtotal           Rp 84.000  │  CartSummary
│ Diskon            −Rp 10.000  │
│ Pajak (11%)         Rp 8.140  │
│ Biaya kirim         Rp 0      │
│ ─────────────────────────────  │
│ Grand Total        Rp 82.140  │  (aria-live untuk update total)
├──────────────────────────────┤
│   Checkout · Rp 82.140 (sticky)│ CheckoutCTA
└──────────────────────────────┘
```
- **Qty inline stepper** — hindari tombol "Apply" (best practice §3.3).
- **EmptyCartState** + CTA "Lihat Menu".
- Cart tersimpan saat user keluar app (F-003, AC-04).
- **Fulfillment = satu selector 4 tipe** (best practice §3.3). Mode **Delivery** menampilkan `DeliveryAddressCard` (dari `AddressBook`) + ongkir/estimasi dari server; mode Pickup/Dine-in/Takeaway menampilkan `OutletPickupInfo`. Ongkir hanya muncul sebagai baris `CartSummary` saat mode Delivery (default `Rp 0`).
- **⚠️ Tindak lanjut audit (`UI-AUDIT.md` #44):** `CheckoutCTA` di kode **mati** (tanpa navigasi) → temuan **T1** (wajib dibetulkan di #11); selector fulfillment belum punya `role="radiogroup"` → **M4**; spacing `py-2.5`(10px) bukan 4pt → **M3**; `<Link><Button>` "Lihat Menu" → **T5**. Semua ini **temuan kode**, bukan perubahan desain.

### 2.5 Checkout (≤ 5 langkah)
```
┌──────────────────────────────┐
│ ← Checkout                    │
│ ①─②─③─④─⑤   Langkah 3 dari 5 │  CheckoutStepper (progress indicator)
├──────────────────────────────┤
│ Step3 · Kontak                │
│ ┌──────────────────────────┐  │
│ │  LANJUT SEBAGAI TAMU      │  │  GuestCheckoutButton ← AKSI PRIMER
│ └──────────────────────────┘  │
│ Sudah punya akun? Masuk       │  LoginPrompt (sekunder)
│ Nama*        [_____________]  │  ContactForm (required* eksplisit)
│ WhatsApp*    [_____________]  │   inputmode=tel
│ Email (ops.) [_____________]  │
├──────────────────────────────┤
│ Ringkasan pesanan         ▾   │  OrderSummarySidebar (mobile collapsible)
├──────────────────────────────┤
│      Lanjut ke Pembayaran     │  (sticky)
└──────────────────────────────┘
```
- Langkah: **1 Fulfillment → 2 Waktu/Outlet → 3 Kontak → 4 Pembayaran → 5 Konfirmasi**.
- **Guest Checkout paling menonjol** (best practice §3.3; 62% situs salah).
- Required/optional ditandai teks + atribut (bukan warna saja).
- **Step2 (Waktu/Outlet)** adaptif: mode Pickup/Dine-in/Takeaway → pilih outlet + ASAP/jadwal; mode **Delivery** → pilih/isi `DeliveryAddressCard` + estimasi ongkir. Field alamat muncul **hanya** untuk Delivery (tidak menambah langkah → tetap ≤ 5).
- **⚠️ Tindak lanjut audit (`UI-AUDIT.md` #44):** `GuestCheckoutButton` sebagai tombol primer sudah sesuai; tapi pola `<Link><Button>` (**T5**) dan tipografi default (`text-2xl/xl` alih-alih token `text-h1` dkk, **M2**) perlu dibetulkan saat #11. `CheckoutStepper` "Langkah 3 dari 5" wajib `aria-live`/`aria-current` saat berpindah step.

### 2.6 Payment
```
┌──────────────────────────────┐
│ ← Pembayaran                  │
│ Order #CS-1042 · Rp 82.140    │  OrderBrief
│ ⏳ Selesaikan dalam 14:59     │  countdown expired
├──────────────────────────────┤
│ QRIS                          │  PaymentMethodDetail
│ ┌──────────┐                  │
│ │  [QR]    │  Scan & bayar    │
│ └──────────┘                  │
│ atau VA: 8808 xxxx xxxx  [⧉]  │  CopyToClipboard
│ [ Buka GoPay / OVO ]          │  OpenWalletDeepLink
├──────────────────────────────┤
│ Status: Menunggu pembayaran…  │  PaymentStatusPoller (polling+WS)
└──────────────────────────────┘
   ResultStates: Pending · Success · Failed · Expired
   RetryPaymentCTA → ganti metode (tanpa order baru)
```
- Sukses → langsung ke **Order Tracking**. Gagal/expired → tombol **Coba lagi / ganti metode**, bukan membuat order baru.
- **Saved payment = Phase 2** (keputusan PO 11 Okt 2026): MVP tidak menyimpan metode. Slot `PaymentMethods` disiapkan di Profile agar mudah diaktifkan; saat aktif, tampil sebagai opsi 1-tap di layar ini.

### 2.7 Order Tracking
```
┌──────────────────────────────┐
│ ← Pesanan #CS-1042            │
│ ⏱️ Siap ± 12 menit            │  EtaBadge
│ ● PENDING   ✓                 │  OrderStatusTimeline
│ ● PAID      ✓                 │   (7 status kanonik)
│ ● CONFIRMED ✓                 │
│ ◉ BEING_PREPARED  ← sekarang  │
│ ○ READY                       │
│ ○ COMPLETED                   │
├──────────────────────────────┤
│ 📍 Outlet Kemang [ Lihat map ]│  OutletPickupCard
│ ▸ Ringkasan item (3 item)     │  OrderItemsSummary
│ 🔔 Notifikasi WA/Push  [on]   │  NotificationToggle
├──────────────────────────────┤
│ (muncul saat COMPLETED)       │  ReviewPrompt → UC13
│ ⭐⭐⭐⭐⭐ Tulis ulasan         │
└──────────────────────────────┘
```
- `LiveStatusBanner` update real-time (WebSocket, < 5 detik, F-005).
- Guest tracking via token (`?guest=1`) — tanpa login.

### 2.8 Admin Dashboard & Order Queue
```
┌────────────────────────────────────────────┐
│ ☰  CoffeeShop Admin      [Outlet ▾]  👤     │  AdminShell (Sidebar/Topbar)
├───────────┬────────────────────────────────┤
│ Dashboard │  KPI: Revenue · Orders · Avg   │  KpiCards
│ Menu      │       Ticket · Low-Stock       │
│ Orders    │  ┌ Grafik 7/30 hari ──────────┐ │  SalesChart
│ Reports   │  └────────────────────────────┘ │
│           │  Produk Terlaris (tabel)        │  TopProductsTable
│           │  ⚠️ Low stock: Susu Oat (5)     │  LowStockAlertList
├───────────┴────────────────────────────────┤
│ Order Queue:  [Baru][Diproses][Siap][Selesai]│ QueueColumns
│ ┌── #CS-1042 · 2 mnt ───────────────┐       │ OrderTicketCard (timer)
│ │ 1× Kopi Susu Oat L, 1× Croissant  │       │
│ │ [Konfirmasi][Cetak Tiket]         │       │ StatusActionBar + Print
│ └───────────────────────────────────┘       │
└────────────────────────────────────────────┘
```
- Pesanan baru muncul < 3 detik (F-011). Cancel/refund wajib **alasan**.
- Tabel → kartu di layar kecil (responsive §7.2).

---

## 3. Design System Tokens — **RUJUKAN (bukan sumber kebenaran)**

> ⚠️ **Perubahan penting (12 Okt 2026):** §3 dokumen ini **DULU** mendefinisikan token sendiri → risiko **dua sumber kebenaran** dengan `DESIGN-SYSTEM.md` yang bikin #11 salah. Sekarang **sumber kebenaran token & komponen = `docs/DESIGN-SYSTEM.md`** (di-merge PR #43, `d34e2737`). Bagian di bawah hanya **ringkasan + daftar selisih** yang wajib dibaca FE sebelum implementasi.
>
> **Aturan:** bila ada konflik antara dokumen ini dan `DESIGN-SYSTEM.md` → **`DESIGN-SYSTEM.md` menang**. Selisih di bawah sudah **diperbaiki** di dokumen ini (v1.1).

### 3.1 Warna

**Sumber kebenaran:** `DESIGN-SYSTEM.md` §1.1 (palet lengkap + CSS variable) & §1.2 (hasil uji kontras).

Palet inti (sama dengan DS): `brand #6F4E37` · `brand-hover/-600 #5A3E2B` · `brand-700 #493326` · `brand-100 #EDE3DA` · `brand-50 #F7F4F0` · `secondary #C8A27A` · `accent #E8B44F` · `success #2E7D32` · `warning #ED8B00` · `warning-fg #8A4B00` · `error #C62828` · `info/focus #1565C0` · `text #1F1B16` · `text-muted #6B6257` · `border #E5DED6` · `bg #FFFFFF`.

**Aturan kontras (dari DS §1.2, WAJIB):**
- ❌ **fill-only** (gagal kontras): `warning #ED8B00` (**2.53:1**), `secondary #C8A27A` (**2.36:1**), `accent #E8B44F` (**1.90:1**) — **jangan** dipakai sebagai warna teks/ikon tunggal.
- ✔ Lolos: `brand #6F4E37` (**7.44:1**), `text-muted #6B6257` (**5.98:1**), `success #2E7D32` (**5.13:1**), `error #C62828` (**5.62:1**), `info/focus #1565C0` (**5.75:1**), `warning-fg #8A4B00` (**6.80:1**).
- **Pasangan `-fg` wajib** untuk setiap latar: `brand-fg`/`secondary-fg`/`accent-fg`/`success-fg`/`warning-fg`/`error-fg`/`info-fg` (DS §1.1). `--color-focus` + ring `2px`, `outline-offset: 2px`, `:focus-visible`.

**Selisih vs versi lama §3.1 (sudah diperbaiki):** tabel lama **tidak** memuat `brand-700 #493326`, `brand-100 #EDE3DA`, dan **semua pasangan `-fg`** (`secondary-fg`/`accent-fg #3A2A18`, dll.) serta `--color-focus` — hanya disebut di prosa. Kini didelegasikan ke DS §1.1.

### 3.2 Tipografi

**Sumber kebenaran:** `DESIGN-SYSTEM.md` §2. Font: `Inter`, base 16px.

| Token DS | Size / LH | Weight | Pemakaian |
|---|---|---|---|
| `text-display` | 28/34 | 700 | Judul hero |
| `text-h1` | 24/30 | 700 | Judul layar |
| `text-h2` | 20/26 | 600 | Section |
| `text-h3` | 16/22 | 600 | Judul kartu |
| `text-body` | 14/20 | 400 | Teks isi (default) |
| `text-sm` | 14/20 | 400 | Teks kecil (Tailwind default) |
| `text-caption` | 12/16 | 400 | Caption, disclaimer |
| `text-price` | 16/20 | 700 · tabular-nums | Harga |

> **⚠️ Selisih token (DIPERBAIKI):** versi lama §3.2 menulis **`text-sm = 12/16`**. Itu **salah** — `text-sm` di DS = **14/20**; yang 12/16 adalah **`text-caption`**. Versi lama **tidak punya** `text-caption` sama sekali. Jika FE memakai `text-sm` mengharap 12px, teks akan 14px. **Pakai `text-caption` untuk 12/16.**
> **Wajib:** semua harga `tabular-nums` (`text-price`); **font input ≥ 16px** (cegah auto-zoom iOS).

### 3.3 Spacing (skala 4pt)

**Sumber kebenaran:** `DESIGN-SYSTEM.md` §3. `space-1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 8=32 · 10=40 · 12=48 · 16=64`.
Aturan layout: padding layar **16px**; gap grid produk **12px**; jarak section **24–32px**.

> **Selisih (DIPERBAIKI):** versi lama berhenti di `space-10=40`; DS menambah **`space-12=48`** & **`space-16=64`**. Nilai `.5` (mis. `py-2.5`=10px) **tidak** kelipatan 4pt → dihindari (temuan audit **M3**).

### 3.4 Radius, Shadow, Elevasi, Motion

**Sumber kebenaran:** `DESIGN-SYSTEM.md` §4 & §6.

| Token DS | Nilai | Pemakaian |
|---|---|---|
| `rounded-sm` | 8px | chip kecil, badge |
| `rounded-lg` | **8px** | **tombol**, input |
| `rounded-card` | **12px** | kartu, panel, sheet item |
| `rounded-xl` | 16px | modal besar |
| `rounded-pill` | 999px | badge, chip filter |

`shadow-elev1` `0 1px 2px rgba(0,0,0,.06)` (kartu) · `shadow-elev2` `0 -4px 16px rgba(0,0,0,.10)` (sheet/sticky) · `shadow-hover` `0 4px 16px rgba(0,0,0,.08)` (kartu interaktif).
Elevasi z: konten `0` → sticky/header `10` → sheet/overlay `50` → toast `60`. Motion: `fast 150ms` · `base 250ms`; hormati `prefers-reduced-motion`.

> **⚠️ Selisih radius (DIPERBAIKI):** versi lama menulis **"Tombol & card = `md` (12px)"**. **Salah untuk tombol** — DS §4 menetapkan **tombol = `rounded-lg` (8px)**, sedangkan **kartu = `rounded-card` (12px)**. (Ini juga yang saya koreksi di audit §6: kode `Button` sudah benar 8px.) Selain itu nama token lama (`sm/md/lg`) berbeda dari DS (`rounded-sm/rounded-lg/rounded-card/rounded-xl`); versi lama juga **tak menyebut `shadow-hover`**.

### 3.5 Komponen Inti

**Sumber kebenaran:** `DESIGN-SYSTEM.md` §5 (komponen dasar, lengkap dengan API & state) & §8 (handoff API + contoh Tailwind). Komponen yang **sudah ada** (`✅`) vs **perlu dibuat** (`🆕`) ada di DS §5/§8.1.

> **⚠️ Selisih (DIPERBAIKI):** versi lama §3.5 menyebut **"Button — Tinggi ≥ 44px"**. DS §5.1 menetapkan **`sm`=36px** (aksi sekunder padat), **`md`=44px**, `lg`=48px. Jadi klaim "semua tombol ≥44px" **tidak akurat** — `sm` memang 36px dan itu sah (DS §7.2). Komponen **`Chip`** di tabel lama kini jadi **`OptionChipGroup`** (DS §5.14) + `SegmentedControl`/chip reusable (temuan audit **M6**).

### 3.6 Ringkasan Selisih Token (lama §3 → `DESIGN-SYSTEM.md`)

| # | Item | Nilai lama (PRD §3) | Nilai benar (`DESIGN-SYSTEM.md`) | Tingkat | Status |
|---|---|---|---|---|---|
| D1 | `text-sm` | 12/16 | **14/20** (12/16 = `text-caption`) | 🔴 tinggi | ✅ diperbaiki |
| D2 | Radius tombol | "tombol = md (12px)" | **tombol = `rounded-lg` 8px** | 🔴 tinggi | ✅ diperbaiki |
| D3 | Token `text-caption` | tidak ada | 12/16 · 400 | 🟡 sedang | ✅ ditambahkan (rujukan) |
| D4 | Pasangan `-fg` + `--color-focus` | hanya prosa | tabel eksplisit DS §1.1 | 🟡 sedang | ✅ didelegasikan |
| D5 | `brand-700 #493326`, `brand-100 #EDE3DA` | tidak ada | ada di DS §1.1 | 🟢 rendah | ✅ didelegasikan |
| D6 | `shadow-hover` | tidak ada | `0 4px 16px rgba(0,0,0,.08)` | 🟢 rendah | ✅ didelegasikan |
| D7 | `space-12/16` (48/64) | berhenti di 40 | 48 & 64 | 🟢 rendah | ✅ didelegasikan |
| D8 | Nama token radius (`sm/md/lg`) | beda dari DS | `rounded-sm/lg/card/xl/pill` | 🟢 rendah | ✅ didelegasikan |
| D9 | Klaim "Button ≥44px" | semua ≥44 | `sm`=36 · `md`=44 · `lg`=48 | 🟢 rendah | ✅ diperbaiki |

> Semua selisih **token** di atas sudah **dihapus dari PRD** (kini hanya merujuk DS). Tidak ada perubahan nilai token di DS itu sendiri dari tugas ini.

---

## 4. Best Practices Wajib (dari Riset)

Berdasarkan `prd-planning-coffeeshop.md` §3.2–3.3 (benchmark app rating tertinggi + Baymard/NNg). **Wajib** diverifikasi di tiap layar terkait:

| # | Best Practice | Penerapan UX | Layar | AC terkait |
|---|---|---|---|---|
| 1 | **Guest checkout menonjol** | "Lanjut sebagai Tamu" = tombol primer; login = sekunder | Checkout Step3 | AC-01 |
| 2 | **Hindari tombol "Apply"** untuk kuantitas | `QtyStepper` inline mengubah qty & harga langsung | Cart, PDP | AC-07 |
| 3 | **One-page checkout** (min. langkah) | Stepper ≤ 5 langkah, ringkasan selalu terlihat | Checkout | AC-02 |
| 4 | **Progress indicator** | `CheckoutStepper` "Langkah 3 dari 5" | Checkout | AC-02 |
| 5 | **Saved payment methods** | Simpan metode (token) untuk member; 1-tap bayar — **MVP: tidak disimpan; aktif Phase 2** (keputusan PO) | Payment, Profile | — |
| 6 | **Reorder cepat** | Tombol "Order Again" di Home + riwayat | Home, Orders | AC-10 |
| 7 | **Menu visual** | Foto besar, kategori jelas, badge best seller | Menu, Home | AC-05 |
| 8 | **Kustomisasi satu layar** | Bottom sheet, bukan multi-halaman | PDP | — |
| 9 | **Fulfillment satu selector** | Dine-in/Takeaway/Pickup/Delivery di satu tempat | Cart, Checkout | — |
| 10 | **Required/optional eksplisit** | Tanda teks + atribut, bukan warna saja | Checkout | AC-13 |
| 11 | **Status transparan** | Timeline real-time + notifikasi | Tracking | AC-09 |
| 12 | **Password creation longgar** | Hindari aturan ketat saat register (19% abandonment) | Register | — |
| 13 | **Onboarding singkat** | Login opsional; jelajah & pesan tanpa akun | Global | AC-03 |
| 14 | **Personalization** | Rekomendasi dari riwayat + "sering dibeli bersama" | Home, PDP | — |

---

## 5. Catatan Accessibility & Mobile-First

### 5.1 Accessibility — target **WCAG 2.1 AA** (selaras PRD-FRONTEND §7.1)
- **Kontras:** teks ≥ 4.5:1; elemen UI/ikon ≥ 3:1.
- **Keyboard & screen reader:** semua aksi terjangkau keyboard; `BottomSheet`/`Dialog` menangkap fokus, `Esc` menutup, fokus kembali ke pemicu.
- **Target sentuh** ≥ **44×44 px**, jarak antar kontrol memadai.
- **Label eksplisit:** field *required* ditandai teks + `required`/`aria-required`; error terhubung via `aria-describedby`.
- **Live region** (`aria-live="polite"`) untuk update total cart & status order.
- **Jangan andalkan warna** untuk status — sertakan ikon/label (mis. timeline, badge stok).
- **Form:** `inputmode`/`autocomplete` tepat (`tel`, `numeric`, `email`), submit jelas, **tanpa CAPTCHA** di jalur guest.
- **Alt text** untuk semua foto produk; ikon dekoratif `aria-hidden`.
- Uji dengan **axe + screen reader** (NVDA/VoiceOver) di CI.

### 5.2 Mobile-First (selaras PRD-FRONTEND §7.2)
- **Breakpoint:** `sm 640 · md 768 · lg 1024 · xl 1280`.
- **Customer:** 1 kolom, `BottomNav` + sticky CTA; grid produk **2 kolom** (mobile) → 3–4 (tablet/desktop).
- **Admin:** sidebar collapsible; tabel → kartu di layar kecil.
- **Safe area** (notch): `env(safe-area-inset-*)` untuk bottom nav & sticky CTA.
- **PWA** `display: standalone`; uji iOS Safari & Android Chrome.
- **Thumb zone:** aksi utama (Tambah/Checkout/Bayar) di sepertiga bawah layar.
- **Performa terasa cepat:** skeleton, lazy image (blur placeholder), optimistic add-to-cart.

---

## 6. Koordinasi dengan Frontend Engineer (Konsistensi Component Tree)

Deliverable ini **memakai penamaan & route yang sama** dengan `PRD-FRONTEND.md` §2 agar tidak ada divergensi:

| Aspek | Sumber kebenaran | Catatan UX |
|---|---|---|
| Route & shell | PRD-FRONTEND §2.2 (CustomerShell/AdminShell) | Wireframe mengikuti shell yang sama |
| Nama komponen | PRD-FRONTEND §2.3–2.4 | Wireframe menyebut komponen by name (mis. `StickyPriceFooter`, `QtyStepper`) |
| Design tokens | **`DESIGN-SYSTEM.md` §1–§4** (sumber kebenaran tunggal) | Dokumen ini §3 = **rujukan + daftar selisih**; FE menambahkan pasangan `-fg`, `--color-focus`, aturan kontras, input ≥ 16px |
| Kontrak `PricingEngine` | PRD-FRONTEND §6.4 | Satu modul `packages/core/pricing`; urutan **Subtotal → Voucher → Poin → Pajak → Ongkir**; golden test `Rp 82.140` (§2.4) |
| Spesifikasi `BottomSheet` | PRD-FRONTEND §6.5 | Snap 25/60/92%, drag handle ≥ 44px, focus-trap, safe-area |
| Status order | process-flow §5 + PRD-FRONTEND §2.3-G | 7 status kanonik dipakai di Tracking & Admin Queue |
| Best practices | **Dokumen ini §4** | Dipetakan ke AC-01…AC-13 (PRD-FRONTEND §8) |
| A11y & responsive | **Dokumen ini §5** | Melengkapi PRD-FRONTEND §7 |

**Status item koordinasi (per 11 Okt 2026):**

| Item | Status |
|---|---|
| Alignment Component Tree / route / 7 status order | ✅ Sinkron |
| **Sumber kebenaran token** | ✅ **Dipindah ke `DESIGN-SYSTEM.md`** (PR #43) — dokumen ini §3 kini **rujukan**, bukan sumber kedua (v1.1, 12 Okt) |
| Design tokens §3 sebagai sumber kebenaran | ⚠️ **DIUBAH** — token kini di `DESIGN-SYSTEM.md` §1–§4; §3 dokumen ini = ringkasan + daftar selisih |
| Revisi kontras token (`warning`/`secondary`/`accent` fill-only) + `-fg` + `--color-focus` | ✅ Diadopsi ke §3.1 dokumen ini & DS §1 |
| Kontrak `PricingEngine` (§6.4) | ✅ Dikunci (selaras §2.4) |
| Spesifikasi `BottomSheet` (§6.5) | ✅ Disepakati |
| SavedPayment = Phase 2 | ✅ Dikunci PO |
| **Divergensi Delivery** (Cart/Checkout wireframe) | ✅ **Diselesaikan** — tab Delivery + `DeliveryAddressCard` + ongkir ditambahkan (§2.4, §2.5) |
| **Sinkronisasi §3 dengan DS** (tugas 12 Okt) | ✅ **Selesai** — 9 selisih token didokumentasikan & diperbaiki (lihat §3.6) |

**Item yang masih perlu konfirmasi ke PO:**
1. Nama & logo brand final untuk token warna (sementara: placeholder "CoffeeShop" + `--brand-primary #6F4E37`).
2. Aset foto produk (rasio & kualitas) untuk kartu & galeri — *dependency konten*, bukan blocker desain.
3. `ux-research-findings.md` belum ditemukan di folder `coffeeshop-plan/` — best practices §4 disusun dari PRD §3.2–3.3; mohon sediakan file asli bila ada tambahan temuan.

**Log Koordinasi:**

| Tanggal | Dari/Ke | Hasil |
|---|---|---|
| 11 Okt 2026 | @frontend-engineer | Tokens §3 diterima sebagai sumber kebenaran + tambahan wajib (`-fg`, `--color-focus`, kontras, tabular-nums, input ≥16px) → diadopsi ke §3. |
| 11 Okt 2026 | @frontend-engineer | Divergensi **Delivery** dilaporkan → UX menambahkan tab Delivery + `DeliveryAddressCard` + ongkir di §2.4/§2.5. **Resolved.** |
| 11 Okt 2026 | @kantal (PO) | `SavedPayment` dikunci **Phase 2** → §2.6 & §4 diperbarui. |
| 12 Okt 2026 | @kantal (PO) | Temuan risiko **dua sumber kebenaran**: `PRD-FRONTEND-UX.md` §3 tidak merujuk `DESIGN-SYSTEM.md`. Tugas sinkronisasi → §3 jadi **rujukan**, §2.4/§2.5 diselaraskan dgn audit, 9 selisih token dilaporkan (§3.6). **Selesai.** |
| 12 Okt 2026 | @ui-ux-designer | `DESIGN-SYSTEM.md` di-merge (PR #43) & `UI-AUDIT.md` di-merge (PR #44, `10e04c00`) → §3 didelegasikan ke DS, temuan audit dirujuk di §2.4/§2.5. |

---

## 7. Traceability Ringkas (Use Case → Layar)

| Use Case | Layar / Flow |
|---|---|
| UC1 Lihat Menu · UC2 Cari Produk | §2.1 Home, §2.2 Menu |
| UC3 Tambah Keranjang · UC4 Kustomisasi | §2.3 PDP, §2.4 Cart |
| UC5 Guest Checkout · UC6 Login/Register | §2.5 Checkout Step3 |
| UC7 Pembayaran Online | §2.6 Payment |
| UC8 Lacak Pesanan · UC14 Notifikasi | §2.7 Tracking |
| UC9 Riwayat · UC10 Reorder · UC11/UC12 Loyalty | Home OrderAgain, Profile/Loyalty |
| UC13 Review | §2.7 ReviewPrompt |
| UC15–UC18 Order Management (Staff) | §2.8 Order Queue |
| UC19–UC28 Manajemen & Laporan (Owner) | §2.8 Dashboard, Reports |

---

*Disusun oleh UI/UX Designer sebagai SUPPORT untuk `PRD-FRONTEND.md` — siap direview Product Owner & Frontend Engineer.*
