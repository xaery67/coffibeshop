# PRD-FRONTEND-UX — CoffeeShop Online

> **Peran dokumen:** SUPPORT untuk `PRD-FRONTEND.md` (LEAD: Frontend Engineer).
> **Penulis:** UI/UX Designer. **Status:** Draft untuk review PO & Frontend Engineer.
> **Sumber:** `README.md`, `prd-planning-coffeeshop.md` (§3 Analisis UX, §4 Persona/User Journey), `diagrams/use-case-diagram.md`, `diagrams/process-flow-diagram.md`, `ux-research-findings.md`.
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

## 3. Design System Tokens

Diekspor sebagai **CSS variables + Tailwind preset** (`packages/ui`), dipakai bersama Customer & Admin (PRD-FRONTEND §6.1). Nilai di bawah adalah **usulan awal** untuk disepakati (dependensi "token visual final" di PRD-FRONTEND §9).

### 3.1 Warna
| Token | Nilai | Pemakaian |
|---|---|---|
| `--color-primary` | `#6F4E37` (Coffee Brown) | CTA utama, brand |
| `--color-primary-hover` | `#5A3E2B` | hover/pressed |
| `--color-secondary` | `#C8A27A` (Latte) | aksen, badge lembut |
| `--color-accent` | `#E8B44F` (Caramel) | highlight promo |
| `--color-bg` | `#FFFFFF` | latar utama |
| `--color-bg-subtle` | `#F7F4F0` (Cream) | section alt, card |
| `--color-text` | `#1F1B16` | teks utama (kontras ≥ 4.5:1) |
| `--color-text-muted` | `#6B6257` | teks sekunder |
| `--color-border` | `#E5DED6` | garis, divider |
| `--color-success` | `#2E7D32` | status PAID/COMPLETED, sukses (fill) |
| `--color-warning` | `#ED8B00` | low-stock, pending (**fill saja**) |
| `--color-error` | `#C62828` | gagal bayar, cancel (fill) |
| `--color-info` | `#1565C0` | info netral (fill) |

**Kontras (hasil hitung WCAG dari review implementasi FE — WAJIB):**
- ❌ `--color-warning #ED8B00` = **2.53:1** — gagal sebagai teks (≥ 4.5:1) maupun elemen UI (≥ 3:1).
- ❌ `--color-secondary #C8A27A` = **2.36:1** — gagal.
- ❌ `--color-accent #E8B44F` = **1.90:1** — gagal.
- Ketiganya **hanya boleh jadi latar/fill**, bukan warna teks. Untuk pemakaian teks, sediakan varian gelap: `--color-warning-fg #8A4B00` (**6.80:1** ✔) + turunan gelap untuk `secondary`/`accent`.
- **Pasangan `-fg` eksplisit** untuk setiap token yang dipakai sebagai latar (`--color-primary-fg`, `--color-success-fg`, `--color-error-fg`, `--color-info-fg`, …) — mencegah teks gelap di atas latar gelap.
- ✔ Lolos & aman: `--color-primary #6F4E37` (teks putih) = **7.44:1**; `--color-text-muted #6B6257` = **5.98:1**; `success`, `error`, `info`, `text` juga lolos.
- **`--color-focus`** (mis. `#1565C0`) + focus ring `2px solid`, `outline-offset: 2px`, `:focus-visible` — wajib untuk navigasi keyboard (WCAG 2.4.7), kontras ring ≥ 3:1 dan tidak terpotong.

> Semua pasangan teks/latar diuji ≥ **4.5:1** (teks) dan ≥ **3:1** (elemen UI). Status **tidak boleh** hanya dibedakan warna — selalu + ikon/label (WCAG AA).

### 3.2 Tipografi
- **Font:** `Inter` (UI) + `Plus Jakarta Sans` (display/heading opsional). Fallback sistem.
- **Skala mobile** (rem, base 16px):

| Token | Size / Line-height | Pemakaian |
|---|---|---|
| `text-display` | 28/34 · 700 | Judul hero |
| `text-h1` | 24/30 · 700 | Judul layar |
| `text-h2` | 20/26 · 600 | Section |
| `text-h3` | 16/22 · 600 | Judul kartu |
| `text-body` | 14/20 · 400 | Teks utama |
| `text-sm` | 12/16 · 400 | Meta, caption |
| `text-price` | 16/20 · 700 (tabular) | Harga (angka rata) |

> **Wajib (review FE):** `text-price` memakai `font-variant-numeric: tabular-nums` agar angka harga rata & tidak "goyang". **Ukuran font input ≥ 16px** di mobile untuk mencegah auto-zoom iOS Safari saat fokus.

### 3.3 Spacing (skala 4pt)
`space-1=4 · space-2=8 · space-3=12 · space-4=16 · space-5=20 · space-6=24 · space-8=32 · space-10=40`
- Padding layar: **16px**. Gap antar kartu: **12px**. Section vertikal: **24–32px**.

### 3.4 Radius, Elevation, Motion
- **Radius:** `sm=8 · md=12 · lg=16 · pill=999` (badge/chip). Tombol & card = `md`.
- **Shadow:** `elev-1` (card) `0 1px 2px rgba(0,0,0,.06)`; `elev-2` (bottom sheet/sticky) `0 -4px 16px rgba(0,0,0,.10)`.
- **Motion:** durasi `fast=150ms · base=250ms`; easing `standard`. Hormati `prefers-reduced-motion`.

### 3.5 Komponen Inti
| Komponen | Varian / State | Catatan |
|---|---|---|
| **Button** | primary · secondary · ghost · danger; sm/md/lg; loading · disabled | Tinggi ≥ 44px (touch target). Aksi primer 1 per layar. |
| **Card** | product · order · kpi; default/hover/selected | Radius md, elev-1, gambar rasio 1:1 / 4:3. |
| **BottomSheet** | filter · kustomisasi · cart item | Radix Dialog + Framer Motion; drag-to-close, focus-trap, `Esc`. |
| **Stepper** | checkout (5 langkah) · qty inline | Checkout: progress indicator + label langkah. Qty: tombol −/+ inline, **tanpa "Apply"**. |
| **Badge** | best seller · promo · status (success/warning/error/info) | Status pakai ikon + teks, bukan warna saja. |
| **Chip** | option value (label + Δharga), filter, kategori | Selected state jelas (border + check). |
| **Toast** | success · error · info | `aria-live=polite`; posisi atas/bawah tidak menutup CTA. |
| **Skeleton** | product card · list · kpi | Cegah layout shift (CLS). |

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
| Design tokens | **Dokumen ini §3** (sumber kebenaran, disepakati FE) | FE menambahkan: pasangan `-fg`, `--color-focus`, aturan kontras, input ≥ 16px |
| Kontrak `PricingEngine` | PRD-FRONTEND §6.4 | Satu modul `packages/core/pricing`; urutan **Subtotal → Voucher → Poin → Pajak → Ongkir**; golden test `Rp 82.140` (§2.4) |
| Spesifikasi `BottomSheet` | PRD-FRONTEND §6.5 | Snap 25/60/92%, drag handle ≥ 44px, focus-trap, safe-area |
| Status order | process-flow §5 + PRD-FRONTEND §2.3-G | 7 status kanonik dipakai di Tracking & Admin Queue |
| Best practices | **Dokumen ini §4** | Dipetakan ke AC-01…AC-13 (PRD-FRONTEND §8) |
| A11y & responsive | **Dokumen ini §5** | Melengkapi PRD-FRONTEND §7 |

**Status item koordinasi (per 11 Okt 2026):**

| Item | Status |
|---|---|
| Alignment Component Tree / route / 7 status order | ✅ Sinkron |
| Design tokens §3 sebagai sumber kebenaran | ✅ Disepakati (tercatat di PRD-FRONTEND §6.1) |
| Revisi kontras token (`warning`/`secondary`/`accent` fill-only) + `-fg` + `--color-focus` | ✅ Diadopsi ke §3.1 dokumen ini |
| Kontrak `PricingEngine` (§6.4) | ✅ Dikunci (selaras §2.4) |
| Spesifikasi `BottomSheet` (§6.5) | ✅ Disepakati |
| SavedPayment = Phase 2 | ✅ Dikunci PO |
| **Divergensi Delivery** (Cart/Checkout wireframe) | ✅ **Diselesaikan** — tab Delivery + `DeliveryAddressCard` + ongkir ditambahkan (§2.4, §2.5) |

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
