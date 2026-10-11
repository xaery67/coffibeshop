# 🧭 UX Flows & Wireframe — Cart · Checkout · Pembayaran · Tracking · Admin

> **Versi:** v1.0 · **Tanggal:** 2026-10-12 · **Pemilik:** UI/UX Designer (@ui-ux-designer)
> **Status:** Siap implementasi (handoff Sprint 2/3/4)
> **Referensi:** `docs/DESIGN-SYSTEM.md`, `docs/PRD-FRONTEND-UX.md`, `docs/PRD-FRONTEND.md`,
> `apps/web/src/lib/pricing.ts`, `packages/shared/src/enums.ts`.
> **Wireframe = teks/ASCII** (tanpa aset biner). Nama komponen mengikuti kode di repo.

**Status order kanonik** (`packages/shared/src/enums.ts`):
`PENDING → PAID → CONFIRMED → BEING_PREPARED → READY → COMPLETED` · jalur batal: `CANCELLED`.
**Status pembayaran:** `pending · paid · failed · expired · refunded`.
**Fulfillment** (`Fulfillment` di `cart.store.ts`): `pickup · dine_in · delivery` (takeaway = pickup).
**Metode bayar** (Midtrans): `qris · gopay · ovo · dana · virtual_account · credit_card` (+ lainnya dari enum).

---

## 1. Ringkasan Alur (Customer)

```
Home ──> Menu ──> Product Detail (kustomisasi) ──> [Cart] ──> Checkout (≤5) ──> Pembayaran ──> Tracking ──> Review
                                                     │                                              ▲
                                                     └── Reorder (Sprint 3, 1-klik) ───────────────┘
```

| Layar | Route | Sprint | Dokumen ini |
|---|---|---|---|
| Cart | `/cart` | 2 | §2 |
| Checkout | `/checkout` | 2 | §3 |
| Pembayaran | `/payment/:orderId` | 2 | §4 |
| Tracking | `/track/:token` | 3 | §5 |
| Admin order queue | `/admin/orders` | 4 | §6 |

---

## 2. Cart (`/cart`)

**Tujuan:** tinjau item, ubah kuantitas, pilih fulfillment, lihat total — sebelum checkout.

```
┌──────────────────────────────────────┐
│ ←  Keranjang                          │
├──────────────────────────────────────┤
│ ┌──┐ Kopi Susu Oat · Large           │
│ │img│ Susu Oat · Less sugar          │  ← ringkasan varian+opsi (text-muted)
│ └──┘ (−) 2 (+)        Rp 62.000      │  ← QuantityStepper (tanpa "Apply")
│                              [Hapus]  │
│ ┌──┐ Croissant ×1     Rp 22.000      │
├──────────────────────────────────────┤
│ Metode pengambilan                    │  ← fieldset "Metode pengambilan"
│ [Ambil di outlet] [Dine-in] [Delivery]│  ← role="radio", aria-checked
├──────────────────────────────────────┤
│ (delivery) 🛵 Alamat: Jl. ... (Ubah)  │  ← muncul HANYA bila Delivery
├──────────────────────────────────────┤
│ Subtotal              Rp 84.000      │  ← CartSummary (aria-live=polite)
│ Pajak                 Rp  9.240      │
│ Ongkir                Rp 10.000      │  ← hanya bila Delivery
│ ────────────────────────────────────  │
│ Total                 Rp 103.240     │  ← tabular-nums, font-bold text-brand
├──────────────────────────────────────┤
│           [ Checkout ]                │  ← Button primary, block, min-h 44px
└──────────────────────────────────────┘
```

- **Elemen:** daftar item (gambar, nama, varian/opsi, catatan), `QuantityStepper`, tombol Hapus, pemilih fulfillment, ringkasan harga.
- **Aksi utama:** **Checkout** (tombol primary sticky di bawah).
- **State:**
  - *Loading:* skeleton baris item.
  - *Empty:* `EmptyState` "Keranjang masih kosong" + CTA "Lihat Menu".
  - *Error:* `ErrorState` + "Coba lagi".
  - *Edge:* item stok habis / harga berubah → banner `warning-fg` "Harga diperbarui" + tandai baris.
- **Aturan harga:** memakai `computeTotals` (`pricing.ts`); urutan **Subtotal → Voucher → Poin → Pajak → Ongkir**; ongkir = `shipping_flat_fee` hanya saat Delivery.
- **A11y:** ringkasan `aria-live="polite"`; stepper punya `aria-label` per tombol; pemilih fulfillment `role="radio"` + `aria-checked`; target sentuh ≥ 44px; fokus terlihat.

---

## 3. Checkout (`/checkout`) — **≤ 5 langkah**

**Tujuan:** menyelesaikan data pemesanan & pembayaran dengan friksi minimum.

### 3.1 Bukti jumlah langkah

| # | Langkah | Isi | Wajib? |
|---|---|---|---|
| 1 | **Fulfillment** | Pilih `pickup` / `dine_in` / `delivery` (default dari Cart) | Ya |
| 2 | **Waktu & Outlet** | Outlet + waktu (ASAP / jadwal). Bila Delivery → **alamat + ongkir** | Ya |
| 3 | **Kontak** | **Guest Checkout (menonjol)** atau Login; nama + WhatsApp (+ email opsional) | Ya |
| 4 | **Pembayaran** | Pilih metode (QRIS/GoPay/OVO/DANA/VA/kartu) | Ya |
| 5 | **Konfirmasi** | Ringkasan akhir + tombol "Buat Pesanan" | Ya |

> **Total = 5 langkah** ✅ memenuhi AC **"checkout ≤ 5 langkah dari cart"** (PRD-FRONTEND AC-02).
> Field alamat **tidak menambah langkah** — hanya muncul di dalam Step 2 bila mode Delivery.
> Tidak ada langkah terpisah untuk voucher/poin (di Cart atau accordion opsional di Step 5).

### 3.2 Wireframe

```
┌──────────────────────────────────────┐
│ ←  Checkout                           │
│ ①─②─③─④─⑤   Langkah 3 dari 5          │  ← CheckoutStepper (progress + label)
├──────────────────────────────────────┤
│ Step 3 · Kontak                       │
│ ┌──────────────────────────────────┐ │
│ │      LANJUT SEBAGAI TAMU          │ │  ← GuestCheckoutButton = AKSI PRIMER
│ └──────────────────────────────────┘ │
│ Sudah punya akun? Masuk               │  ← LoginPrompt (sekunder, teks link)
│                                       │
│ Nama *                                │  ← label eksplisit + tanda *
│ [________________________________]    │
│ Nomor WhatsApp *                      │  ← inputmode="tel" autocomplete="tel"
│ [________________________________]    │
│ Email (opsional)                      │  ← ditandai "opsional" eksplisit
│ [________________________________]    │
├──────────────────────────────────────┤
│ ▾ Ringkasan pesanan (3 item)          │  ← collapsible di mobile
│   Subtotal · Pajak · Total            │
├──────────────────────────────────────┤
│        [ Lanjut ke Pembayaran ]        │  ← sticky, min-h 44px
└──────────────────────────────────────┘
```

**Step 2 (Waktu & Outlet) — dua mode:**

```
Mode Pickup/Dine-in                Mode Delivery
┌────────────────────────┐         ┌────────────────────────┐
│ Outlet: [Kemang ▾]     │         │ Alamat pengiriman      │
│ Waktu: (•)ASAP ( )Jadwal│         │ [Jl. ...  (Ubah)      ]│
│         [ jam: --:-- ] │         │ Catatan kurir (ops.)   │
└────────────────────────┘         │ Ongkir: Rp 10.000      │
                                    └────────────────────────┘
```

- **Elemen:** `CheckoutStepper` (①–⑤), konten step, ringkasan pesanan sticky/collapsible, tombol navigasi (Kembali/Lanjut).
- **Aksi utama:** "Lanjut" tiap step; "Buat Pesanan · Rp XX" di Step 5.
- **State:**
  - *Loading:* tombol `loading` + spinner; step berikutnya menunggu validasi.
  - *Empty/Invalid:* field wajib kosong → error inline (`aria-describedby`), tombol Lanjut disabled.
  - *Error:* kegagalan simpan draft → `Toast error` + tetap di step.
- **Best practice (wajib):** Guest Checkout **paling menonjol** (bukan tersembunyi di balik login); required/optional ditandai teks + atribut; **tanpa tombol "Apply"**; satu selector fulfillment.
- **A11y:** `CheckoutStepper` `aria-current="step"`; error field `aria-invalid` + `aria-describedby`; fokus dipindah ke field pertama yang error saat submit gagal; heading per step.

---

## 4. Halaman Pembayaran (`/payment/:orderId`)

**Tujuan:** menyelesaikan pembayaran & menampilkan status jelas (menunggu / sukses / gagal).

### 4.1 Menunggu (pending)

```
┌──────────────────────────────────────┐
│ ←  Pembayaran                         │
│ Pesanan #CS-1042 · Rp 103.240         │  ← OrderBrief
│ ⏳ Selesaikan dalam 14:59             │  ← countdown (expired)
├──────────────────────────────────────┤
│ Metode: QRIS                          │
│ ┌──────────┐                          │
│ │  [ QR ]  │  Scan dengan aplikasi    │  ← PaymentMethodDetail
│ └──────────┘  apa pun                 │
│                                       │
│ atau VA: 8808 xxxx xxxx        [⧉]    │  ← CopyToClipboard (aria-label)
│                                       │
│ [ Buka GoPay / OVO / DANA ]           │  ← deep link e-wallet
├──────────────────────────────────────┤
│ ● Menunggu pembayaran…                │  ← aria-live="polite" (polling/SSE)
│ Ganti metode                          │  ← kembali ke pilih metode (tanpa order baru)
└──────────────────────────────────────┘
```

### 4.2 Sukses

```
┌──────────────────────────────────────┐
│              ✅                       │
│      Pembayaran berhasil              │
│   Pesanan #CS-1042 · Rp 103.240       │
│                                       │
│   Estimasi siap: ± 12 menit           │
│                                       │
│   [ Lacak Pesanan ]   [ Ke Home ]     │  ← CTA → /track/:token
└──────────────────────────────────────┘
```

### 4.3 Gagal / Kedaluwarsa

```
┌──────────────────────────────────────┐
│              ⚠️                       │
│      Pembayaran gagal / kedaluwarsa   │
│   Pesanan #CS-1042 belum dibayar      │
│                                       │
│   [ Coba lagi ]   [ Ganti metode ]    │  ← TIDAK membuat order baru
└──────────────────────────────────────┘
```

- **Elemen:** ringkasan order, detail metode (QR/VA/deep link), tombol salin, indikator status, CTA hasil.
- **Aksi utama:** selesaikan pembayaran; jika gagal → **Coba lagi / Ganti metode** (order tetap `PENDING`, bukan order baru).
- **State:** `pending · paid · failed · expired` (`PaymentStatus`). Polling/SSE; jika `expired` → tampilkan countdown habis + tombol ulangi.
- **Aturan:** sukses → order `PAID` → lanjut ke Tracking. Tidak menyimpan kartu (**SavedPayment = Phase 2**).
- **A11y:** status `aria-live="polite"`; tombol salin punya `aria-label`; QR punya teks alternatif VA (jangan andalkan gambar saja); kontras teks status lolos.

---

## 5. Tracking Real-time (`/track/:token`) — Sprint 3

**Tujuan:** pelanggan (termasuk guest via token) melihat status pesanan secara real-time.

```
┌──────────────────────────────────────┐
│ ←  Pesanan #CS-1042                   │
│ ⏱️ Estimasi siap ± 12 menit           │  ← EtaBadge
│                                       │
│ ● PENDING            ✓                │  ← StatusTimeline (7 status)
│ ● PAID               ✓                │
│ ● CONFIRMED          ✓                │
│ ◉ BEING_PREPARED     ← sekarang       │  ← langkah aktif
│ ○ READY                               │
│ ○ COMPLETED                           │
│                                       │
│ ● Live (SSE)  ← indikator koneksi     │  ← "Menyambung…" bila putus
├──────────────────────────────────────┤
│ 📍 Outlet Kemang      [ Lihat map ]   │  ← OutletPickupCard
│ ▸ Ringkasan item (3)                  │  ← OrderItemsSummary
│ 🔔 Notifikasi WA/Push         [ on ]  │  ← NotificationToggle
├──────────────────────────────────────┤
│ (muncul saat COMPLETED)               │
│ ⭐⭐⭐⭐⭐  Tulis ulasan               │  ← ReviewPrompt
└──────────────────────────────────────┘
```

- **Elemen:** timeline 7 status, ETA, kartu outlet, ringkasan item, toggle notifikasi, prompt review.
- **Aksi utama:** pantau status; saat `COMPLETED` → beri review; (Sprint 3) **Reorder** 1-klik.
- **State:**
  - *Loading:* skeleton timeline + "Menyambung…".
  - *Live:* indikator `● Live (SSE)`.
  - *Error/koneksi putus:* banner `warning-fg` "Koneksi terputus — menyambung ulang…" + auto-retry; fallback polling.
  - *CANCELLED:* timeline berhenti + pesan alasan + CTA "Hubungi outlet".
- **Real-time:** SSE (`useOrderTracking`, `sse_heartbeat_interval_ms`), fallback `tracking_poll_interval_ms`; update < 5 detik (AC-09).
- **A11y:** perubahan status diumumkan `aria-live="polite"`; status **tidak hanya warna** — ada ikon ✓/○ + label; kontras status lolos; timeline bisa dibaca screen reader sebagai daftar berurut.

---

## 6. Admin Order Queue (`/admin/orders`) — Sprint 4

**Tujuan:** staff mengelola antrian pesanan & memperbarui status (konfirmasi → siap → selesai).

```
┌────────────────────────────────────────────────────────┐
│ ☰  Admin · Order Queue            [Outlet ▾]   👤       │  ← AdminShell
├──────────┬─────────────────────────────────────────────┤
│ Dashboard│  [Baru 3][Diproses 2][Siap 1][Selesai]       │  ← QueueColumns / tabs
│ Menu     │  ┌── #CS-1042 · ⏱ 2 mnt ────────────────┐   │
│ Orders   │  │ 1× Kopi Susu Oat L, 1× Croissant      │   │  ← OrderTicketCard (timer)
│ Reports  │  │ Ambil di outlet · Rp 103.240          │   │
│          │  │ [Konfirmasi] [Cetak Tiket]            │   │  ← StatusActionBar
│          │  └───────────────────────────────────────┘   │
│          │  ┌── #CS-1043 · ⏱ 5 mnt ────────────────┐   │
│          │  │ 2× Americano · Delivery               │   │
│          │  │ [Mulai Siapkan] [Batalkan + alasan]   │   │
│          │  └───────────────────────────────────────┘   │
└──────────┴─────────────────────────────────────────────┘
```

- **Elemen:** kolom/tab status (Baru/Diproses/Siap/Selesai), kartu tiket (nomor, item, timer, channel), tombol aksi status, tombol cetak kitchen ticket.
- **Aksi utama:** **Konfirmasi** (`CONFIRMED`) → **Mulai Siapkan** (`BEING_PREPARED`) → **Siap** (`READY`) → **Selesai** (`COMPLETED`); **Batalkan** wajib + alasan → `CANCELLED`.
- **State:**
  - *Loading:* skeleton kolom.
  - *Empty:* `EmptyState` "Belum ada pesanan baru".
  - *Error:* `ErrorState` + retry; banner bila koneksi real-time putus.
  - *Realtime:* pesanan baru muncul < 3 detik (AC-11); kartu baru disorot + bunyi opsional.
- **A11y:** tabel/kolom responsif (di layar kecil → kartu); aksi punya label teks (bukan ikon saja); dialog batal = `role="dialog"` + focus-trap; timer tidak hanya visual (ada teks menit).

---

## 7. Aturan Lintas-Layar

| Aspek | Aturan |
|---|---|
| **Harga** | Selalu lewat `formatIDR`/`PriceText` + `tabular-nums`; hitung via `computeTotals` (satu sumber). |
| **Fulfillment** | Satu selector (`pickup`/`dine_in`/`delivery`) di Cart & Checkout; konsisten. |
| **Kuantitas** | `QuantityStepper` inline — **tanpa tombol "Apply"**. |
| **Guest** | Guest checkout & tracking via token **tanpa login**; login selalu opsional. |
| **Target sentuh** | Semua aksi utama ≥ 44×44px. |
| **Fokus** | Ring `focus` 2px + offset 2px; urutan Tab logis. |
| **Status** | Ikon + teks, bukan warna saja. |
| **Loading** | Skeleton (cegah CLS); error → `ErrorState` + retry. |
| **Bahasa** | `lang="id"`, istilah teknis boleh Inggris. |

---

## 8. Handoff Komponen (untuk @frontend-engineer)

| Layar | Komponen utama | Status | Catatan |
|---|---|---|---|
| Cart | `CartPage`, `QuantityStepper`, `EmptyState`, `Button`, `PriceText` | sebagian ✅ | tambah panel alamat utk Delivery |
| Checkout | `CheckoutStepper` 🆕, `Input` 🆕, `GuestCheckoutButton` 🆕, `Toast` 🆕 | 🆕 | ≤ 5 langkah (§3.1) |
| Pembayaran | `PaymentMethodDetail`, `CopyToClipboard`, `ResultStates`, `Badge` 🆕 | 🆕 | state pending/paid/failed/expired |
| Tracking | `StatusTimeline`, `EtaBadge`, `OrderItemsSummary`, `NotificationToggle` | 🆕 | SSE + fallback polling |
| Admin | `QueueColumns`, `OrderTicketCard`, `StatusActionBar`, `ConfirmDialog` | 🆕 | realtime < 3s; cancel + alasan |

Detail token, varian, dan contoh class ada di **`docs/DESIGN-SYSTEM.md` §5 & §8**.

---

*UX Flows v1.0 — wireframe teks siap dipakai. Perubahan alur/langkah checkout harus lewat review UI/UX
agar tetap ≤ 5 langkah dan konsisten dengan `docs/DESIGN-SYSTEM.md`.*
