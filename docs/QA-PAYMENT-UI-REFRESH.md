# Laporan QA — Bug "UI tidak ter-update setelah pembayaran"

**Tanggal:** 2026-10-15
**Pelapor:** user (setelah review pada alur pembayaran)
**Pelaksana QA:** @QA (API testing)
**Status:** ✅ FIXED & TERVERIFIKASI

---

## 1. Deskripsi bug (sebagaimana dilaporkan)

> Setelah sukses melakukan pembayaran, pada UI yang tidak hot reload, saat cek
> status pembayaran hanya muncul notifikasi "pesanan terkonfirmasi".

Artinya: **toast muncul, tetapi UI tidak berubah** (badge tetap "Menunggu
pembayaran…"). Pengguna harus reload manual agar melihat status baru.

---

## 2. Akar masalah (root cause)

Bug punya **dua lapis** yang saling melengkapi:

### Lapis A — Backend: event SSE disiarkan ke key yang salah
- Klien guest (`PaymentPage`/`TrackPage`) membuka
  `GET /orders/track/{tracking_token}/events` → terdaftar di map SSE dengan
  key = **`tracking_token`**.
- Klien member membuka `GET /orders/{order_id}/events` → key = **`order_id`**.
- Backend memanggil `publishOrderEvent(order.id, …)` — **hanya ke `order_id`**.
- Akibatnya stream guest **tidak pernah** menerima `status_change`
  (koneksi SSE "hidup" tapi bisu → UI macet).

### Lapis B — Frontend: tombol "Cek status pembayaran" hanya memunculkan toast
- `checkStatus()` memanggil `POST /payments/:orderId/verify`, lalu **hanya**
  `setToast(...)`.
- State yang menentukan tampilan (`tracking.status`) tidak pernah disegarkan →
  UI tetap menampilkan "Menunggu pembayaran" walau backend sudah bilang `paid`.

---

## 3. Reproduksi (sebelum fix) — TERBUKTI

Skrip: `.tmp/functest/qa_sse_bug.py` (API murni, tanpa browser)

```
stream GUEST (key=token)     menerima status_change: 0   ← BUG
stream MEMBER (key=order_id) menerima status_change: 1
HASIL: 4 PASS / 1 FAIL
```

Kesimpulan: event sampai ke subscriber `order_id`, **tidak** ke subscriber
`tracking_token`. Persis sesuai gejala yang dilaporkan.

---

## 4. Perbaikan

| Lapis | File | Perubahan |
|-------|------|-----------|
| BE | `sse.controller.ts` | Fungsi baru `publishOrderStatus(order, payload)` → siarkan ke `order_id` **dan** `tracking_token` |
| BE | `order.service.ts` | `updateStatus()` & `cancel()` memakai `publishOrderStatus` |
| BE | `payment.service.ts` | `processSuccessfulPayment()` memakai `publishOrderStatus` |
| FE | `useOrderTracking.ts` | Tambah `refresh()` di `TrackState` — paksa muat ulang status segera |
| FE | `PaymentPage.tsx` | `checkStatus()` memanggil `await refresh()` setelah verify |

---

## 5. Verifikasi (sesudah fix)

### 5.1 API — SSE fan-out (skrip `qa_sse_bug.py`)
```
stream GUEST (key=token)     menerima status_change: 1   ← FIXED
stream MEMBER (key=order_id) menerima status_change: 1
HASIL: 5 PASS / 0 FAIL
```

### 5.2 Unit/regresi
- **API:** 422 lulus | 20 skipped (442 total) — termasuk 2 test regresi baru
  (`publish event ke order_id DAN tracking_token`, `tanpa tracking_token tetap aman`).
- **Web:** 229 lulus (24 files) — termasuk `PaymentPage.test.ts` (2 test):
  - verify `paid` → UI berubah ke **"Pembayaran berhasil"** (bukan hanya toast)
  - verify `pending` → UI tetap "Menunggu pembayaran…"
- **Typecheck** API + web: 0 error.

### 5.3 Uji negatif (membuktikan test benar-benar menangkap bug)
Dengan `await refresh()` dinonaktifkan sementara → test PaymentPage **GAGAL**
(`expected ... to contain 'Pembayaran berhasil'`). Setelah dipulihkan → lulus.

### 5.4 E2E browser (live)
1. Buka `/payment/{id}` → badge **"Menunggu pembayaran"**, indikator **● Live**.
2. Tandai order `PAID` dari luar (simulasi settlement).
3. **Tanpa reload**, badge otomatis berubah → **"Pembayaran berhasil"** + tombol
   "Lacak Pesanan". ✅
4. Log network saat klik "Cek status pembayaran":
   ```
   POST /api/v1/payments/{id}/verify
   GET  /api/v1/orders/track/{token}     ← refresh() (dulu TIDAK ada)
   ```

### 5.5 Tidak ada regresi
- `verify_register_outlet.sh`: **18 PASS / 0 FAIL**
- Order tetap muncul di antrian dashboard admin setelah PAID.

---

## 6. Kesimpulan

Bug "UI tidak ter-update setelah pembayaran" **berhasil direproduksi, diperbaiki,
dan diverifikasi** pada dua lapis (SSE key mismatch + UI tidak refresh).
Tersedia **test regresi** di API & web yang gagal bila perbaikan dicabut.
