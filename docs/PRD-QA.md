# PRD-QA — Quality Assurance & Test Plan (Backend & Frontend)

> **Proyek**: CoffeeShop Online — Platform pesanan online coffeeshop + otomatisasi administrasi bulanan
> **Dokumen pendukung**: `README.md`, `prd-planning-coffeeshop.md`, `database-design.md`,
> `diagrams/use-case-diagram.md`, `diagrams/process-flow-diagram.md`, `diagrams/entity-relationship-diagram.md`
> **Cakupan dokumen ini**: SUPPORT untuk **kedua PRD (Backend & Frontend)** — test plan, acceptance criteria, traceability, strategi pengujian, dan gate rilis.
> **Versi**: 1.3 · **Tanggal**: 11 Oktober 2026 · **Status**: Draft untuk review PO
> **Peran**: Senior AI QA Engineer
> **Revisi 1.3 (sinkron PRD-BACKEND-DEVOPS v1.1, ADR-009)**: **gate operasional realtime** — TC-REALTIME-INFRA-01…06 (SSE idle >120s, buffering off, over-limit 503, rolling deploy, heartbeat 15s, fallback polling) + gate rilis operasional di 6.3. Detail di **Bagian 9 (Changelog)**.
> **Revisi 1.2 (sinkron PRD-BACKEND v1.3 & PRD-FRONTEND v1.3)**: endpoint baru MVP — reorder (ADR-010), cart merge (ADR-011), customer cancel, CRUD addresses (Delivery MVP), Realtime SSE + fallback polling + staff WS. **Delivery = MVP**, **F-006 Reorder = MVP**.
> **Revisi 1.1 (sinkron dengan PRD-BACKEND.md)**: keputusan PO atas 5 pertanyaan terbuka FE (§11) — (a) cart guest hybrid localStorage+Redis (`X-Guest-Id`, merge idempotent), (b) endpoint `GET /config`, (c) guest tracking via `tracking_token`, (d) ongkir flat MVP, (e) saved payment/tokenisasi kartu = Phase 2.

---

## 0. Ringkasan Eksekutif

Dokumen ini menerjemahkan PRD produk menjadi artefak pengujian yang dapat dieksekusi. Fokus MVP ada pada **9 fitur prioritas** (F-001, F-002, F-003, F-004, F-005, **F-006**, F-009, F-011, F-014) yang mencakup alur pelanggan (menu → kustomisasi → keranjang → checkout → bayar → lacak → reorder) dan alur back-office (kelola menu → kelola pesanan → laporan penjualan). **Revisi v1.2** menambahkan cakupan endpoint baru MVP: **Reorder (ADR-010)**, **Cart Merge (ADR-011)**, **Customer Cancel**, **CRUD Addresses (Delivery MVP)**, dan **Realtime SSE + fallback polling + staff WS**.

**Prinsip pengujian yang dipakai:**
1. **Shift-left** — test case diturunkan langsung dari acceptance criteria PRD sebelum kode ditulis.
2. **Risk-based** — alur pembayaran, harga, dan stok (uang & data) mendapat cakupan paling dalam.
3. **Traceability end-to-end** — setiap UC1–UC28 dapat dilacak ke fitur dan test case.
4. **Measurable** — setiap target performa dinyatakan sebagai angka dengan kondisi uji jelas.

**Angka kunci yang diuji (dari PRD):** checkout ≤ 90s (dari buka aplikasi), pembayaran < 10s, update status pesanan < 5s, pencarian/filter < 1s (katalog < 500 item), pesanan baru muncul di dashboard < 3s, perubahan menu terefleksi < 1 menit, uptime > 99.5%.

---

## 1. Lingkup Pengujian

### 1.1 In-Scope (MVP — Phase 1)

| Fitur | Nama | Layer utama | Prioritas risiko |
|-------|------|-------------|------------------|
| F-001 | Menu Digital & Pencarian | Frontend + API | Sedang |
| F-002 | Kustomisasi Pesanan | Frontend + API + Harga | **Tinggi** |
| F-003 | Keranjang & Checkout | Frontend + API + Session | **Tinggi** |
| F-004 | Pembayaran Online | API + Integrasi Gateway | **Kritis** |
| F-005 | Pelacakan Pesanan | API + Realtime + Notifikasi | **Tinggi** |
| **F-006** | **Riwayat Pesanan & Reorder** | API + Frontend | Sedang |
| F-009 | Manajemen Menu (Back Office) | Backend + Admin UI | Sedang |
| F-011 | Manajemen Pesanan (Back Office) | Backend + Admin UI + Realtime | **Tinggi** |
| F-014 | Laporan Penjualan Harian/Bulanan | Backend + Agregasi | Sedang |

> **Revisi v1.2:** **Delivery = MVP** (sebelumnya Phase 2) → `CRUD /auth/me/addresses` + snapshot address saat checkout; **F-006 (Reorder) = MVP** (ADR-010); **Realtime SSE** (`GET /orders/{id}/events`, `/orders/track/{token}/events`) + fallback polling 3s + staff WS `wss://api/orders/queue/ws`.

### 1.2 Out-of-Scope (MVP ini)
F-007, F-008, F-010, F-012, F-013, F-015, F-016, F-017, F-018, F-019, F-020 → Phase 2/3. **`slug` produk → Phase 2** (FE pakai `/product/:id`). Namun **UC terkait tetap dimasukkan ke matriks traceability** sebagai *deferred* agar tidak hilang.

### 1.3 Prinsip lingkungan
- **Frontend**: PWA/Web responsive (Chrome, Safari, mobile viewport 360–414px).
- **Backend**: REST API + PostgreSQL (Supabase) + Redis cache + Queue.
- **Payment**: sandbox gateway (Midtrans + Xendit) dengan simulasi sukses/gagal/timeout.
- **Waktu**: uji cron 00:01 memakai *clock mock* / `pg_cron` di environment staging.

---

## 2. Test Plan per Fitur MVP

> Format setiap test case: **ID · Skenario · Prasyarat · Langkah · Expected Result**. Tag: `[HP]` happy path, `[EC]` edge case, `[NC]` negative case.

### F-001 — Menu Digital & Pencarian

**AC PRD**: temukan produk ≤ 3 ketukan; filter & pencarian < 1s untuk katalog < 500 item.

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-F001-01 | HP | Tampil menu default | Buka Home → lihat daftar menu | Produk tampil dengan foto, nama, harga, kategori, badge; hanya produk `is_available=true` & `is_active=true`. |
| TC-F001-02 | HP | Filter kategori | Pilih kategori "Cold Coffee" | Hanya produk kategori tsb yang tampil; jumlah badge kategori sesuai. |
| TC-F001-03 | HP | Pencarian autocomplete | Ketik "lat" di search | Muncul saran (Latte, ...) dalam < 1s; hasil relevan. |
| TC-F001-04 | HP | Temukan produk ≤ 3 ketukan | Dari Home, ketuk kategori → produk | Produk detail tercapai dalam ≤ 3 tap. |
| TC-F001-05 | EC | Pencarian tanpa hasil | Ketik "xyzabc" | Empty state jelas + saran kategori populer (bukan error). |
| TC-F001-06 | EC | Pencarian katalog maksimum | Katalog 500 item, cari string umum | Respons < 1s; tidak ada timeout. |
| TC-F001-07 | EC | Produk habis stok | Buka produk `stock_quantity=0` | Label "Habis"; tombol Add to Cart disabled. |
| TC-F001-08 | NC | Produk di-nonaktifkan saat dibuka | Manager toggle `is_active=false` lalu refresh customer | Produk hilang / 404 ramah; tidak bisa ditambah ke cart. |
| TC-F001-09 | NC | Injeksi pada query search | Cari `' OR 1=1 --` / `<script>` | Input disanitasi; tidak ada SQLi/XSS; hasil kosong aman. |
| TC-F001-10 | EC | Koneksi lambat | Throttle 3G | Skeleton loading muncul; gambar lazy-load; tidak blank. |

### F-002 — Kustomisasi Pesanan

**AC PRD**: setiap kustomisasi menghitung harga tambahan **real-time**; kombinasi tidak tersedia → pesan jelas.

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-F002-01 | HP | Pilih ukuran | Pilih Small→Large | Harga berubah sesuai `price_adjustment` varian, instan (tanpa submit). |
| TC-F002-02 | HP | Pilih jenis susu | Pilih Oat Milk | Harga tambah sesuai adjustment Oat; label tampil di ringkasan. |
| TC-F002-03 | HP | Tambah topping multiple | Centang Extra Shot + Whip Cream | Kedua adjustment dijumlahkan; `max_select` tidak terlampaui. |
| TC-F002-04 | HP | Real-time price formula | Kombinasi varian+opsi+qty=2 | `subtotal = (base + Σadj_varian + Σadj_opsi) × qty` akurat hingga 2 desimal. |
| TC-F002-05 | EC | Opsi wajib belum dipilih | `is_required=true` belum dipilih, klik Add | Tombol Add disabled / validasi minta pilih opsi wajib. |
| TC-F002-06 | EC | Batas max_select | Opsi max_select=2, pilih 3 | Opsi ke-3 diblokir dengan pesan "maksimum 2". |
| TC-F002-07 | EC | Catatan khusus panjang | Isi note 250 char | Tersimpan & tampil di barista ticket tanpa terpotong aneh. |
| TC-F002-08 | EC | Harga adjustment nol/negatif | Opsi `price_adjustment=0` | Harga tidak berubah; tidak error. |
| TC-F002-09 | NC | Kombinasi tidak tersedia | Pilih kombinasi yang di-flag unavailable | Pesan jelas "Kombinasi tidak tersedia", harga tidak dihitung. |
| TC-F002-10 | NC | Manipulasi harga di client | Ubah `unit_price` via devtools saat Add | Server menghitung ulang; client tidak dipercaya; harga server menang. |
| TC-F002-11 | EC | Perubahan harga master saat modal terbuka | Manager ubah base_price saat customer buka modal | Harga ter-refresh saat add / notifikasi harga berubah. |

### F-003 — Keranjang & Checkout

**AC PRD**: checkout ≤ 5 langkah dari keranjang; sistem menyimpan keranjang jika user keluar.
**Keputusan PO (a, b, d)**: cart guest **HYBRID** — localStorage (cache offline) + **Redis** keyed `session_id`/`guestId` (header **`X-Guest-Id`**); **Redis = source of truth saat checkout**; merge guest→member **idempotent** per `guestId`. Ongkir **flat** dari `GET /config` (`shipping_flat_fee`).

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-F003-01 | HP | Tambah item ke cart | Add produk default | Item muncul; badge cart bertambah; subtotal benar. |
| TC-F003-02 | HP | Edit kuantitas | Ubah qty 1→3 | Subtotal & grand total update instan (tanpa tombol "Apply"). |
| TC-F003-03 | HP | Hapus item | Tap hapus item | Item hilang; total dihitung ulang; cart kosong → empty state. |
| TC-F003-04 | HP | Checkout ≤ 5 langkah | Cart → fulfillment → ringkasan → bayar | Selesai ≤ 5 langkah; progress indicator tampil. |
| TC-F003-05 | HP | Guest checkout (hybrid cart) | Guest (X-Guest-Id) pilih fulfillment → bayar | Tidak dipaksa registrasi; checkout baca cart dari **Redis** (source of truth), bukan localStorage; order dibuat dgn `session_id`/`guestId`. |
| TC-F003-06 | HP | Pilih fulfillment | Pilih Pickup + waktu | Opsi Dine-in/Takeaway/Pickup/Delivery tersedia; pickup_time tersimpan. |
| TC-F003-07 | HP | Terapkan voucher | Input kode valid | Diskon dihitung sesuai `discount_type` & `max_discount`. |
| TC-F003-08 | EC | Cart persist saat keluar app (offline cache) | Tutup & buka kembali app (guest, localStorage ada) | Isi cart tetap tampil dari localStorage; setelah online tersinkron ke Redis. |
| TC-F003-09 | EC | Voucher tidak valid | Input kode acak | Pesan "Kode tidak valid"; checkout tetap bisa lanjut tanpa voucher. |
| TC-F003-10 | EC | Min purchase belum terpenuhi | Voucher min_purchase 50k, cart 30k | Pesan "Min. belanja tidak terpenuhi"; diskon tidak diterapkan. |
| TC-F003-11 | EC | Voucher kadaluarsa / kuota habis | Pakai voucher end_date lampau / used_count=usage_limit | Pesan spesifik ("Sudah kadaluarsa" / "Kuota habis"). |
| TC-F003-12 | EC | Dua tab / device, cart sama (X-Guest-Id) | Guest buka 2 tab dengan `X-Guest-Id` sama | Cart dari Redis konsisten; tidak ada duplikasi item. |
| TC-F003-13 | NC | Item habis saat checkout | Stok varian jadi 0 setelah add, sebelum bayar | Checkout lock stok gagal dengan pesan stok berubah; tawarkan hapus/ubah item. |
| TC-F003-14 | NC | Qty melebihi stok | Set qty > stock_quantity | Validasi "stok tidak cukup"; tidak bisa lanjut. |
| TC-F003-15 | NC | Qty negatif / nol / non-integer | Input qty `-1`, `0`, `abc` | Ditolak; nilai tidak valid tidak masuk cart. |
| TC-F003-16 | EC | Harga berubah antara add & checkout | Manager ubah harga saat cart aktif | Sistem re-validate harga; tampilkan perubahan ke user sebelum bayar. |
| TC-F003-17 | HP | Merge guest→member idempotent | Guest login saat cart berisi item | Item guest di-merge ke akun member **sekali** (idempotent per `guestId`); login ulang tidak menggandakan item. |
| TC-F003-18 | EC | Redis source of truth vs localStorage divergen | Ubah cart di localStorage secara manual, lalu checkout | Checkout memakai **Redis**; manipulasi localStorage tidak memengaruhi total/order. |
| TC-F003-19 | NC | Redis cart hilang / TTL expired | Redis key `guestId` dihapus/expired saat checkout | Fallback aman: rebuild cart dari localStorage atau minta ulang; tidak ada order kosong/salah. |
| TC-F003-20 | EC | Lock stok pakai Redis saat checkout | 2 checkout paralel untuk stok varian terakhir (1) | Hanya 1 order sukses dapat stok; yang kedua gagal "stok tidak cukup" (lock Redis efektif). |
| TC-F003-21 | HP | Ongkir flat dari `GET /config` | Delivery order di kota berbeda | `total = subtotal + tax + shipping_flat_fee − diskon`; flat fee sama untuk semua jarak (MVP). |
| TC-F003-22 | EC | Pricing pakai tax dari `GET /config` | Ubah `tax_rate` di config | Total dihitung ulang memakai tax_rate server; client tidak menghitung sendiri. |
| TC-F003-23 | HP | Endpoint merge eksplisit | `POST /orders/cart/merge { guest_id }` (header `X-Guest-Id`) | Response `cart_merged:true`; cart guest ter-merge tepat sekali; auto-merge juga ter-trigger saat login. |
| TC-F003-24 | NC | Merge guest_id milik orang lain | `POST /orders/cart/merge` dengan `guest_id` bukan milik pemanggil | Ditolak; tidak bisa menyerap cart guest lain. |
| TC-F003-25 | EC | Merge saat cart member kosong/berisi | Merge ke member yang sudah punya item | Item digabung (produk+kustomisasi sama → qty diakumulasi, bukan duplikat). |

### F-004 — Pembayaran Online

**AC PRD**: pembayaran < 10s; notifikasi sukses/gagal real-time.
**Keputusan PO (e)**: pembayaran kartu **sekali** (one-time) = MVP; **saved payment / tokenisasi kartu = Phase 2 ⏭️**. Webhook idempoten **by `transaction_id`**; dual gateway **Midtrans + Xendit**.

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-F004-01 | HP | Bayar QRIS sukses | Checkout → QRIS → simulasi sukses | Order `pending`→`paid`; notifikasi sukses real-time; < 10s. |
| TC-F004-02 | HP | Bayar E-wallet (GoPay/OVO/DANA) | Pilih e-wallet → sukses | Sama seperti QRIS; `payment_method` tercatat benar. |
| TC-F004-03 | HP | Bayar Virtual Account | Pilih VA BCA → sukses | VA number tampil; setelah bayar status `paid`. |
| TC-F004-04 | HP | Bayar Kartu (Visa/Master/JCB) sekali | Input kartu sandbox → sukses (tanpa menyimpan kartu) | 3DS (jika ada) selesai; status `paid`; **tidak ada** data kartu yang disimpan. |
| TC-F004-05 | HP | Idempotency webhook by `transaction_id` | Gateway kirim callback sukses 2x (transaction_id sama) | Hanya 1 payment `success`; tidak ada double charge/double order. |
| TC-F004-06 | EC | Pembayaran gagal | Simulasi gagal | Order tetap `pending`; pesan gagal; user bisa coba metode lain. |
| TC-F004-07 | EC | Timeout pembayaran | Diamkan VA/QR sampai expired | Status payment `expired`; order `cancelled` (atau bisa retry sesuai aturan). |
| TC-F004-08 | EC | Refund | Cancel order yang sudah `paid` | Payment `refunded`; saldo/point di-rollback; notifikasi ke user. |
| TC-F004-09 | EC | Partial/duplicate amount | Webhook amount ≠ order amount | Transaksi ditolak & di-flag; tidak mengubah status ke `paid`. |
| TC-F004-10 | NC | Webhook signature invalid | Kirim callback tanpa signature benar | Ditolak 401; status tidak berubah; tercatat di log keamanan. |
| TC-F004-11 | NC | Retry setelah gagal | Gagal → pilih metode lain → sukses | Hanya satu payment success final; riwayat percobaan tercatat. |
| TC-F004-12 | EC | Jaringan putus di tengah bayar | Putuskan koneksi saat proses | UI menampilkan status "memproses"; reconcile saat koneksi kembali. |
| TC-F004-13 | EC | Dual gateway fallback (Midtrans↔Xendit) | Midtrans error/timeout → fallback Xendit | Order tetap dapat dibayar via gateway kedua; `transaction_id` & method tercatat benar. |
| TC-F004-14 | ⏭️ | Saved payment / tokenisasi kartu (Phase 2) | Simpan kartu untuk pembayaran berikutnya | **Deferred** — diuji saat Phase 2 (butuh PCI/tokenisasi gateway). |

### F-005 — Pelacakan Pesanan (Order Tracking)

**AC PRD**: status diperbarui < 5s setelah perubahan di POS.
**Keputusan PO (c)**: guest tracking memakai **`tracking_token`** + endpoint publik **`GET /orders/track/{token}`** (tanpa JWT). Token hanya berlaku untuk order terkait (anti-IDOR).

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-F005-01 | HP | Lihat status real-time | Buka halaman tracking order | Status saat ini tampil + estimasi waktu siap. |
| TC-F005-02 | HP | Transisi status lengkap | PAID→CONFIRMED→BEING_PREPARED→READY→COMPLETED | Tiap perubahan muncul < 5s; timeline akurat. |
| TC-F005-03 | HP | Notifikasi saat status berubah | Staff ubah status | Push/SMS/WA terkirim sesuai preferensi user. |
| TC-F005-04 | EC | Status CANCELLED | Staff cancel dengan alasan | User melihat status + alasan; notifikasi terkirim. |
| TC-F005-05 | EC | Refresh saat offline | Buka tracking tanpa jaringan | Menampilkan status terakhir + banner offline, bukan blank. |
| TC-F005-06 | HP | Guest tracking via `tracking_token` | Guest akses `GET /orders/track/{token}` | Bisa lacak tanpa login/JWT; hanya menampilkan order milik token tsb. |
| TC-F005-07 | NC | Transisi status ilegal | Paksa `PENDING`→`COMPLETED` langsung | Ditolak sesuai state machine; log error; status tetap valid. |
| TC-F005-08 | NC | Tracking tanpa token / token invalid | Akses `GET /orders/track/{token}` tanpa/ dengan token salah | 401/403; tidak ada kebocoran data. |
| TC-F005-09 | NC | Anti-IDOR tracking token | Pakai `tracking_token` order A untuk membaca order B | Ditolak; token terikat 1 order saja; tidak ada kebocoran. |
| TC-F005-10 | EC | Token expired / order tidak ada | Akses token kadaluarsa / order dihapus | 404/410 dengan pesan ramah; tidak mengungkap data internal. |
| TC-F005-11 | HP | SSE delivery status | Member buka `GET /orders/{id}/events` (SSE) | Event `status_change` diterima **< 5s** setelah staff update; koneksi tetap terbuka; heartbeat 15s. |
| TC-F005-12 | HP | SSE guest via token | Guest buka `GET /orders/track/{token}/events` | Event `status_change` diterima tanpa JWT; hanya event order milik token tsb. |
| TC-F005-13 | EC | Fallback polling saat SSE gagal | Blokir/matikan SSE | Client otomatis fallback **polling 3s** (`/config.tracking_poll_interval_ms`); status tetap ter-update. |
| TC-F005-14 | NC | Anti-IDOR SSE guest | Guest token order A berlangganan `.../track/{tokenB}/events` | Ditolak (401/403); tidak ada event order B yang bocor. |
| TC-F005-15 | EC | SSE reconnect | Putus koneksi SSE lalu pulih | Client reconnect (Last-Event-ID / resume); tidak kehilangan event penting; tanpa duplikasi tampilan. |
| TC-F005-16 | HP | Staff realtime queue via WS | Staff buka `wss://api/orders/queue/ws` | Pesanan baru/update muncul real-time < 3s; hanya order outlet staff. |

### F-006 — Riwayat Pesanan & Reorder (MVP — ADR-010)

**AC PRD**: riwayat tersedia 12 bulan terakhir; reorder memuat ulang semua kustomisasi sebelumnya.
**Keputusan PO v1.2**: F-006 naik dari Phase 2 → **MVP**; endpoint baru `POST /orders/{id}/reorder` → `{ items: CartItemDTO[] }`.

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-F006-01 | HP | Lihat riwayat pesanan | Member buka riwayat | Daftar order 12 bulan terakhir tampil (tanggal, status, total). |
| TC-F006-02 | HP | Reorder memuat kustomisasi | `POST /orders/{id}/reorder` | `{ items: CartItemDTO[] }` memuat ulang produk + varian + opsi + qty persis order lama. |
| TC-F006-03 | HP | Reorder → cart → checkout | Reorder lalu checkout | Item masuk cart; bisa lanjut checkout normal. |
| TC-F006-04 | EC | Produk reorder sudah tidak tersedia | Produk lama `is_active=false`/habis | Item tidak tersedia ditandai; user diberi opsi hapus/ganti; reorder tetap jalan untuk item valid. |
| TC-F006-05 | EC | Harga berubah sejak order lama | Harga produk naik/turun | CartItemDTO memakai **harga saat ini** (re-validate), bukan harga snapshot lama; tampilkan perbedaan. |
| TC-F006-06 | NC | Reorder order milik user lain | `POST /orders/{id}/reorder` id order orang lain | 403/404 (anti-IDOR); tidak ada data bocor. |
| TC-F006-07 | NC | Reorder order yang belum selesai/dibatalkan | Reorder order status PENDING/CANCELLED | Sesuai aturan backend (ditolak atau diizinkan dengan pesan); tidak ada state korup. |
| TC-F006-08 | EC | Riwayat > 12 bulan | Order lebih lama dari 12 bulan | Tidak tampil / dipaginasi keluar sesuai AC (12 bulan terakhir). |

### F-003b — Addresses (Delivery = MVP)

**Keputusan PO v1.2**: Delivery **naik ke MVP** → CRUD `/auth/me/addresses` wajib; checkout delivery menyimpan **snapshot address** di order.

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-ADDR-01 | HP | Create address | `POST /auth/me/addresses` (label, full_address, lat/lng) | Address tersimpan & tampil di daftar milik user. |
| TC-ADDR-02 | HP | Update / delete address | `PUT`/`DELETE /auth/me/addresses/{id}` | Perubahan/penghapusan berhasil; hanya milik sendiri. |
| TC-ADDR-03 | HP | `is_default` exclusivity | Set address B sebagai default | Hanya **satu** address `is_default=true`; address A otomatis di-unset. |
| TC-ADDR-04 | HP | Checkout delivery pakai address | Checkout fulfillment Delivery + pilih address | Order menyimpan **snapshot address** (label/alamat/koordinat) agar historis tetap akurat bila address diubah/dihapus. |
| TC-ADDR-05 | NC | Checkout delivery tanpa address | Delivery dipilih tanpa address | Validasi memblokir checkout; minta isi/pilih address. |
| TC-ADDR-06 | NC | Akses address milik user lain | `GET/PUT/DELETE` id address user lain | 403/404 (anti-IDOR). |
| TC-ADDR-07 | EC | Hapus address yang jadi default | Delete address `is_default=true` | Ditangani aman (promote address lain atau default kosong); tidak error. |
| TC-ADDR-08 | NC | Data address invalid | full_address kosong / lat-lng di luar rentang | Validasi menolak; tidak tersimpan. |

### F-005b — Pembatalan Pesanan oleh Customer (Customer Cancel)

**Keputusan PO v1.2**: endpoint `POST /orders/{id}/cancel { reason }`. **Customer** hanya boleh cancel status **PENDING/PAID**; setelah **CONFIRMED** hanya **staff**; **refund otomatis** bila sudah bayar. Wajib audit log.

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-CANCEL-01 | HP | Customer cancel PENDING | `POST /orders/{id}/cancel { reason }` saat PENDING | Order → CANCELLED; alasan tersimpan; tercatat di `order_status_logs` (audit). |
| TC-CANCEL-02 | HP | Customer cancel PAID → refund otomatis | Cancel order PAID | Order → CANCELLED; **refund otomatis** ter-trigger; `payments.status=refunded`; notifikasi ke user. |
| TC-CANCEL-03 | NC | Customer cancel setelah CONFIRMED | Cancel saat status CONFIRMED | **Ditolak** (403/409); hanya staff yang boleh cancel; pesan jelas. |
| TC-CANCEL-04 | NC | Cancel order ilegal (COMPLETED/CANCELLED) | Cancel saat COMPLETED / sudah CANCELLED | Ditolak sesuai state machine; tidak ada perubahan status. |
| TC-CANCEL-05 | NC | Cancel order milik orang lain | `POST /orders/{id}/cancel` id order orang lain | 403/404 (anti-IDOR). |
| TC-CANCEL-06 | EC | Cancel tanpa reason | Kirim cancel tanpa `reason` | Sesuai kontrak (reason wajib → 422, atau default terisi); tercatat. |
| TC-CANCEL-07 | EC | Staff cancel PAID → refund | Staff cancel order PAID/CONFIRMED + alasan | Status CANCELLED; refund bila `paid`; audit log lengkap. |
| TC-CANCEL-08 | NC | Double cancel | Panggil cancel 2x | Percobaan kedua idempotent/ditolak; tidak ada refund ganda. |

### F-005c — Realtime Infrastruktur (SSE/WS Operasional — ADR-009)

**Sumber**: PRD-BACKEND-DEVOPS v1.1 §1.6–§1.9. Kelas bug khas SSE di produksi: stream putus saat idle, event tertahan buffering, OOM saat koneksi membludak, terputus saat deploy. **Wajib diuji sebelum go-live.**
**Target**: 1.000 SSE simultan + WS staff (<50/outlet); heartbeat `event: ping` 15s; latency status change < 5s (p95).

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-REALTIME-INFRA-01 | HP | SSE survive idle > 120s | Buka SSE, diamkan > 120s tanpa event | Koneksi **tetap hidup** (ALB/Kong idle_timeout ≥ 120s); heartbeat `ping` tiap 15s diterima; tidak terputus di ~60s. |
| TC-REALTIME-INFRA-02 | HP | Buffering off → event < 5s | Staff update status; ukur latensi event di klien | Event `status_change` diterima **< 5s** (p95); header `X-Accel-Buffering: no`, `proxy_buffering off`, gzip off untuk `text/event-stream`; tidak ada penundaan. |
| TC-REALTIME-INFRA-03 | NC | Over-limit → HTTP 503 (bukan crash) | Buka koneksi SSE > `SSE_MAX_CONNECTIONS_PER_POD` (mis. 600) | Koneksi berlebih ditolak **HTTP 503** dengan pesan jelas; pod **tidak OOM/crash**; koneksi existing tetap stabil. |
| TC-REALTIME-INFRA-04 | EC | Rolling deploy tidak memutus SSE | Trigger rolling deploy saat SSE aktif | SSE existing tidak terputus paksa (`terminationGracePeriodSeconds: 60` + preStop `sleep 10`); klien menerima event penutup + `retry:` lalu reconnect terkendali. |
| TC-REALTIME-INFRA-05 | HP | Heartbeat `ping` 15s | Amati stream idle | Event `event: ping` terkirim tiap **15s** (SSE_HEARTBEAT_INTERVAL_MS=15000); menjaga koneksi di semua hop (Cloudflare ~100s). |
| TC-REALTIME-INFRA-06 | EC | Fallback polling saat SSE gagal | Paksa SSE gagal (503/jaringan) | Klien fallback polling **3s** (`/config.tracking_poll_interval_ms`); endpoint tracking dilayani dari **Redis cache** (bukan query PG); rate limit 40 req/min/IP dipatuhi; status tetap segar. |
| TC-REALTIME-INFRA-07 | EC | WS staff upgrade + fan-out | Staff connect `wss://.../queue/ws?outlet_id=` | Upgrade `Connection: Upgrade` berhasil di semua hop; fan-out via Redis pub/sub **tanpa sticky session**; pesanan baru < 3s; `WS_MAX_CONNECTIONS_PER_POD` dipatuhi. |
| TC-REALTIME-INFRA-08 | EC | HPA metric sse_active_connections | Naikkan beban SSE mendekati target 400/pod | HPA scale-out memakai custom metric `sse_active_connections`; `maxReplicas` 6; tidak ada penolakan 503 prematur. |
| TC-REALTIME-INFRA-09 | NC | Cap koneksi WS per pod | Buka WS > `WS_MAX_CONNECTIONS_PER_POD` (200) | Koneksi berlebih ditolak terkontrol (bukan crash); koneksi existing stabil. |

### F-009 — Manajemen Menu (Back Office)

**AC PRD**: perubahan harga/menu terefleksi di aplikasi customer < 1 menit.

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-F009-01 | HP | Create produk | Manager buat produk baru + varian + opsi | Produk tampil di customer < 1 menit (cache invalidate). |
| TC-F009-02 | HP | Update harga | Ubah base_price | Harga baru terefleksi < 1 menit; cart lama re-validate. |
| TC-F009-03 | HP | Update stok varian | Set stock_quantity | Ketersediaan & label "Habis" update sesuai. |
| TC-F009-04 | HP | Toggle visibility | `is_active=false` | Produk hilang dari katalog customer. |
| TC-F009-05 | HP | Upload foto produk | Upload image | Foto tampil; ukuran dioptimasi; object storage OK. |
| TC-F009-06 | EC | Harga dinamis / happy hour | Set harga promo terjadwal | Harga promo aktif tepat waktu, kembali normal setelahnya. |
| TC-F009-07 | EC | Hapus produk yang punya order historis | Delete produk | Soft-delete / tidak merusak order historis (snapshot tetap). |
| TC-F009-08 | NC | Input harga invalid | base_price negatif / non-numeric | Validasi menolak; tidak tersimpan. |
| TC-F009-09 | NC | Upload file non-image | Upload .exe/.pdf sebagai foto | Ditolak dengan pesan tipe file; tidak tersimpan. |
| TC-F009-10 | NC | Staff (bukan manager) akses kelola menu | Login sebagai kasir → buka menu admin | 403 / menu tidak tersedia (RBAC). |

### F-011 — Manajemen Pesanan (Back Office)

**AC PRD**: pesanan baru muncul di dashboard < 3s.

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-F011-01 | HP | Pesanan baru masuk antrian | Customer bayar | Pesanan muncul di dashboard kasir < 3s. |
| TC-F011-02 | HP | Konfirmasi pesanan | Staff konfirmasi | Status PAID→CONFIRMED; tercatat di `order_status_logs`. |
| TC-F011-03 | HP | Update status berurutan | CONFIRMED→BEING_PREPARED→READY→COMPLETED | Tiap update sukses; customer ter-notifikasi. |
| TC-F011-04 | HP | Filter channel | Filter online/in-store/third-party | Daftar terfilter benar. |
| TC-F011-05 | HP | Cetak kitchen ticket | Klik print | Ticket tercetak dengan item + kustomisasi benar. |
| TC-F011-06 | EC | Cancel/refund dengan alasan | Cancel order + alasan | Status CANCELLED; alasan tercatat; refund ter-trigger bila `paid`. |
| TC-F011-07 | EC | Banyak pesanan bersamaan | 20 pesanan masuk serentak | Semua tampil; tidak ada yang hilang/duplikat; urutan benar. |
| TC-F011-08 | EC | No-show timeout 15 menit | Order READY, pelanggan tidak datang | Staff dapat hubungi pelanggan → CANCELLED/NO-SHOW. |
| TC-F011-09 | NC | Update status ilegal | Lompati state (READY→PAID) | Ditolak; konsisten dengan state machine. |
| TC-F011-10 | NC | Kasir ubah pesanan outlet lain | Staff outlet A akses order outlet B | Ditolak / tidak tampil (scope outlet). |
| TC-F011-11 | EC | Print gagal (printer offline) | Matikan printer saat print | Fallback (queue/reprint); error jelas; order tidak stuck. |

### F-014 — Laporan Penjualan Harian/Bulanan

**AC PRD**: laporan otomatis tersedia setiap hari pukul 00:01; laporan bulanan tanggal 1.

| ID | Tipe | Skenario | Langkah | Expected Result |
|----|------|----------|---------|-----------------|
| TC-F014-01 | HP | Agregasi harian | Jalankan cron 00:01 | `daily_sales` terisi: total_orders, revenue, tax, discount, profit. |
| TC-F014-02 | HP | Dashboard filter periode | Pilih tanggal/outlet/kategori | Angka sesuai data transaksi. |
| TC-F014-03 | HP | Akurasi revenue | Bandingkan sum orders vs daily_sales | Selisih = 0 (hanya status `paid`/`completed`). |
| TC-F014-04 | EC | Hari tanpa transaksi | Tanggal tanpa order | Baris tetap ada dengan nilai 0 / ditandai jelas. |
| TC-F014-05 | EC | Idempotensi cron | Jalankan cron 2x untuk tanggal sama | Tidak ada duplikasi (ON CONFLICT upsert). |
| TC-F014-06 | EC | Agregasi bulanan | Akhir bulan | Monthly report: gross profit = revenue − COGS; net = gross − expenses. |
| TC-F014-07 | NC | Timezone boundary | Transaksi 23:59 vs 00:00 | Masuk ke hari yang benar (zona Asia/Jakarta). |
| TC-F014-08 | NC | Akses laporan tanpa izin | Kasir buka laporan keuangan | Ditolak (RBAC: hanya Manager/Owner). |

---

## 3. Acceptance Criteria Terukur (Given-When-Then) — Alur Kritis

### AC-1 · Tambah ke Cart (UC3)
```
Scenario: Menambahkan produk ke keranjang
  Given pelanggan berada di halaman detail produk "Caffè Latte"
    And produk is_available = true
  When pelanggan memilih varian "Medium" dan klik "Tambah ke Keranjang"
  Then item muncul di keranjang dengan kuantitas 1
    And badge keranjang bertambah 1
    And subtotal = base_price + price_adjustment varian
    And aksi selesai < 2 detik

Scenario: Produk habis tidak bisa ditambahkan
  Given produk memiliki stock_quantity = 0
  When pelanggan melihat tombol "Tambah ke Keranjang"
  Then tombol disabled dan label "Habis" tampil
    And tidak ada item yang masuk ke keranjang
```

### AC-2 · Kustomisasi Harga Real-Time (UC4)
```
Scenario: Harga berubah real-time saat kustomisasi
  Given pelanggan membuka modal kustomisasi produk dengan base_price = 25000
  When pelanggan memilih varian "Large" (price_adjustment = 5000)
    And menambahkan topping "Extra Shot" (price_adjustment = 8000)
    And menambah susu "Oat Milk" (price_adjustment = 6000)
  Then harga yang tampil = 44000 tanpa menekan tombol submit
    And perubahan tampil < 300 ms setelah pilihan
    And rumus subtotal = (base + Σadj_varian + Σadj_opsi) × qty akurat 2 desimal

Scenario: Kombinasi tidak tersedia
  Given kombinasi varian + opsi ditandai tidak tersedia
  When pelanggan memilih kombinasi tersebut
  Then pesan "Kombinasi tidak tersedia" tampil
    And harga tidak dihitung
    And tombol Tambah ke Keranjang disabled
```

### AC-3 · Guest Checkout — Hybrid Cart (UC5)
```
Scenario: Checkout sebagai tamu tanpa registrasi (Redis source of truth)
  Given guest (header X-Guest-Id) memiliki ≥ 1 item di keranjang Redis
  When pelanggan klik Checkout
    And memilih fulfillment "Pickup" + waktu pickup
    And mengisi kontak minimal (nama + telepon/email)
    And memilih metode pembayaran
  Then checkout membaca cart dari Redis (bukan localStorage)
    And order dibuat dengan customer_id = null dan session_id/guestId terisi
    And tidak ada paksaan registrasi/login
    And checkout selesai ≤ 5 langkah dari keranjang
    And order_number unik di-generate

Scenario: Cart persist untuk guest (offline cache → Redis)
  Given guest memiliki item di keranjang (tersimpan di localStorage + Redis)
  When guest menutup aplikasi lalu membukanya kembali
  Then seluruh item dan kustomisasi tetap tampil (dari localStorage saat offline)
    And setelah online, cart tersinkron ke Redis (source of truth)

Scenario: Merge guest → member idempotent
  Given guest (X-Guest-Id) memiliki item di keranjang
  When guest login/register menjadi member
  Then item guest di-merge ke akun member tepat satu kali per guestId
    And login ulang / refresh tidak menggandakan item
    And konflik item (produk+kustomisasi sama) digabung, bukan diduplikasi
```

### AC-4 · Pembayaran Sukses / Gagal (UC7)
```
Scenario: Pembayaran sukses
  Given order berstatus "pending" dengan total_amount final (dari GET /config)
  When pelanggan menyelesaikan pembayaran (QRIS/E-wallet/VA/Kartu sekali)
    And payment gateway mengirim callback sukses dengan signature valid
  Then order.status berubah menjadi "paid"
    And payments.status = "success" dan paid_at terisi
    And notifikasi sukses terkirim real-time ke pelanggan
    And total waktu proses < 10 detik
    And stok belum dikurangi (deduction hanya saat "completed")

Scenario: Pembayaran gagal
  Given order berstatus "pending"
  When payment gateway mengembalikan status gagal
  Then order.status tetap "pending"
    And payments.status = "failed"
    And pesan gagal tampil dengan opsi coba metode lain
    And tidak ada stok/point yang berubah

Scenario: Webhook idempoten by transaction_id
  Given order "pending" dan callback sukses pertama (transaction_id X) sudah diproses
  When gateway mengirim ulang callback sukses dengan transaction_id X
  Then hanya satu payments record berstatus "success"
    And tidak terjadi double charge atau duplikasi order

Scenario: Total harga mengikuti config server
  Given GET /config mengembalikan { tax_rate, point_value, shipping_flat_fee }
  When pelanggan menyelesaikan ringkasan pesanan (delivery)
  Then total = subtotal + tax(subtotal×tax_rate) + shipping_flat_fee − diskon
    And nilai tax/point/ongkir dihitung server-side (client tidak menghitung sendiri)
```

### AC-5 · Update Status Pesanan (UC15/UC16)
```
Scenario: Update status oleh staff
  Given order berstatus "paid" milik outlet tempat staff bertugas
  When staff mengubah status sesuai state machine
       (paid → confirmed → being_prepared → ready → completed)
  Then order.status ter-update dalam < 5 detik
    And setiap perubahan tercatat di order_status_logs (status, created_by, created_at)
    And pelanggan menerima notifikasi tiap perubahan
    And dashboard & halaman tracking pelanggan menampilkan status baru

Scenario: Transisi status ilegal ditolak
  Given order berstatus "ready"
  When sistem menerima permintaan transisi langsung ke "paid"
  Then permintaan ditolak (state machine tidak mengizinkan)
    And status order tidak berubah
    And error tercatat di log
```

### AC-6 · Stock Deduction (UC22 / F-012 terkait)
```
Scenario: Deduksi stok otomatis saat order completed
  Given produk memiliki BOM (mis. 18g kopi, 150ml susu per unit)
    And inventory_items.current_stock tercatat
  When order berstatus "completed" (transisi dari bukan completed)
  Then inventory_logs dibuat dengan type="out" untuk tiap bahan
    And current_stock berkurang = quantity_used × quantity item
    And tidak ada deduksi ganda pada retry/idempotent update
    And bila current_stock ≤ reorder_point → low-stock alert terkirim

Scenario: Stok tidak boleh minus tanpa kontrol
  Given stok bahan mendekati 0
  When order completed memicu deduksi
  Then sistem mencatat selisih dan menandai alert
    And tidak terjadi nilai stok yang tidak konsisten (audit trail lengkap)
```

### AC-7 · Reorder (UC10 — ADR-010)
```
Scenario: Reorder memuat ulang kustomisasi
  Given member memiliki order "completed" dengan ≥ 1 item ber-kustomisasi
  When member memanggil POST /orders/{id}/reorder
  Then response berisi { items: CartItemDTO[] }
    And setiap item memuat produk + varian + opsi + qty persis order lama
    And harga memakai harga saat ini (re-validate), bukan snapshot lama
    And item yang sudah tidak tersedia ditandai untuk konfirmasi user
    And item valid bisa lanjut ke checkout normal

Scenario: Anti-IDOR reorder
  Given member A mengetahui id order milik member B
  When member A memanggil POST /orders/{id_B}/reorder
  Then permintaan ditolak (403/404)
    And tidak ada data order B yang bocor
```

### AC-8 · Cart Merge (UC6 — ADR-011)
```
Scenario: Auto-merge & eksplisit saat login
  Given guest (header X-Guest-Id) memiliki item di cart Redis
  When guest login ATAU memanggil POST /orders/cart/merge { guest_id }
  Then cart guest di-merge ke cart member tepat satu kali
    And response memuat cart_merged:true
    And item identik (produk+kustomisasi sama) digabung, bukan diduplikasi
    And pemanggilan merge ulang idempotent (tidak menggandakan)

Scenario: Merge guest_id bukan milik pemanggil
  Given pemanggil mengirim guest_id milik guest lain
  When POST /orders/cart/merge dijalankan
  Then permintaan ditolak
    And cart guest lain tidak terserap
```

### AC-9 · Customer Cancel (UC16/UC7 terkait)
```
Scenario: Customer cancel PENDING/PAID
  Given order milik customer berstatus "pending" atau "paid"
  When customer memanggil POST /orders/{id}/cancel { reason }
  Then order.status → "cancelled" dan reason tersimpan
    And bila order sudah "paid" → refund otomatis ter-trigger (payments.status=refunded)
    And perubahan tercatat di order_status_logs (audit) + notifikasi ke user

Scenario: Customer tidak boleh cancel setelah CONFIRMED
  Given order berstatus "confirmed"
  When customer memanggil POST /orders/{id}/cancel
  Then permintaan ditolak (403/409)
    And status order tidak berubah
    And pesan mengarahkan ke staff

Scenario: Cancel idempotent
  Given order sudah "cancelled"
  When cancel dipanggil ulang
  Then tidak ada refund ganda
    And status tetap "cancelled"
```

### AC-10 · Delivery & Address Snapshot (F-003b — Delivery MVP)
```
Scenario: Checkout delivery menyimpan snapshot address
  Given member memiliki address (salah satunya is_default=true)
  When member checkout dengan fulfillment "delivery" + memilih address
  Then order menyimpan snapshot address (label, full_address, koordinat)
    And total = subtotal + tax + shipping_flat_fee − diskon
    And mengubah/menghapus address setelahnya TIDAK mengubah order historis

Scenario: is_default exclusivity
  Given member memiliki address A (default)
  When member menetapkan address B sebagai default
  Then hanya address B yang is_default=true
    And address A otomatis di-unset
```

### AC-11 · Realtime Tracking — SSE + Fallback (F-005 — UC8)
```
Scenario: SSE delivery status < 5s
  Given customer membuka GET /orders/{id}/events (SSE) untuk order aktif
  When staff mengubah status pesanan
  Then event "status_change" diterima < 5 detik
    And koneksi SSE tetap terbuka dengan heartbeat 15s
    And halaman tracking menampilkan status baru

Scenario: Fallback polling saat SSE gagal
  Given koneksi SSE tidak tersedia/gagal
  When client mendeteksi kegagalan SSE
  Then client beralih ke polling setiap 3s (sesuai /config.tracking_poll_interval_ms)
    And status tetap ter-update tanpa aksi user

Scenario: Anti-IDOR SSE guest
  Given guest memegang tracking_token untuk order A
  When guest membuka /orders/track/{tokenB}/events (order B)
  Then permintaan ditolak (401/403)
    And tidak ada event order B yang bocor
```

### AC-12 · Realtime Operasional (Infrastruktur SSE/WS — ADR-009)
```
Scenario: SSE bertahan melewati idle window infrastruktur
  Given klien membuka SSE GET /orders/{id}/events
  When stream dibiarkan idle > 120 detik tanpa event aplikasi
  Then koneksi tetap hidup (ALB/Kong idle_timeout ≥ 120s)
    And event "ping" diterima tiap 15 detik (SSE_HEARTBEAT_INTERVAL_MS=15000)
    And koneksi tidak terputus pada ~60s (default lama)

Scenario: Event tidak tertahan buffering
  Given route /events dengan proxy_buffering off + X-Accel-Buffering: no
  When staff mengubah status pesanan
  Then event "status_change" diterima klien < 5 detik (p95)
    And tidak ada penundaan akibat buffering/gzip di hop mana pun

Scenario: Batas koneksi tidak membuat pod OOM
  Given pod menetapkan SSE_MAX_CONNECTIONS_PER_POD
  When koneksi SSE melebihi batas
  Then koneksi berlebih ditolak HTTP 503 (bukan crash)
    And pod tetap sehat & koneksi existing stabil
    And HPA scale-out via metric sse_active_connections

Scenario: Rolling deploy tidak memutus stream
  Given SSE aktif saat rolling deploy berjalan
  When pod di-drain (terminationGracePeriodSeconds=60 + preStop sleep 10)
  Then klien menerima event penutup + hint retry:
    And klien reconnect terkendali tanpa kehilangan status

Scenario: Fallback polling melindungi saat SSE down
  Given SSE gagal (503/jaringan)
  When klien beralih ke polling 3s
  Then endpoint tracking dilayani dari Redis cache (bukan query PG langsung)
    And rate limit 40 req/min/IP dipatuhi
    And status pesanan tetap segar
```

---

## 4. Matriks Traceability — Use Case (UC1–UC28) → Fitur → Test Case

> Legenda status: ✅ MVP (diuji penuh) · 🟡 Parsial/terdampak (uji terbatas pada interaksi MVP) · ⏭️ Deferred (Phase 2/3 — test case ditandai untuk phase terkait).

| UC | Use Case | Aktor | Fitur | Test Case | Status |
|----|----------|-------|-------|-----------|--------|
| UC1 | Lihat Menu | Guest, Member | F-001 | TC-F001-01, -07, -08, -10 | ✅ |
| UC2 | Cari Produk | Guest, Member | F-001 | TC-F001-03, -05, -06, -09 | ✅ |
| UC3 | Tambah ke Keranjang | Guest, Member | F-003 | TC-F003-01, -13, -14, -15, -18, -20 | ✅ |
| UC4 | Kustomisasi Pesanan | Guest, Member | F-002 | TC-F002-01…-11 | ✅ |
| UC5 | Checkout sebagai Tamu | Guest | F-003 | TC-F003-04, -05, -06, -08, -17, -19, -21 · TC-ADDR-04, -05 (delivery) | ✅ |
| UC6 | Login / Register | Member | F-003 (ADR-011) | TC-F003-17, -23, -24, -25 · AC-8 (merge guest→member) | ✅ |
| UC7 | Pembayaran Online | Guest, Member | F-004 | TC-F004-01…-13 (14 ⏭️ Phase 2) | ✅ |
| UC8 | Lacak Pesanan | Guest, Member | F-005 | TC-F005-01…-16 (SSE, fallback polling, anti-IDOR) · TC-REALTIME-INFRA-01…06 · AC-11, AC-12 | ✅ |
| UC9 | Riwayat Pesanan | Member | F-006 | TC-F006-01, -08 | ✅ |
| UC10 | Reorder | Member | F-006 (ADR-010) | TC-F006-02…-07 · AC-7 | ✅ |
| UC11 | Lihat Poin Loyalty | Member | F-007 | TC-F007-* (Phase 2) | ⏭️ |
| UC12 | Tukar Poin | Member | F-007 | TC-F007-* (Phase 2) | ⏭️ |
| UC13 | Berikan Review | Member | F-020 | TC-F020-* (Phase 2) | ⏭️ |
| UC14 | Terima Notifikasi | Member | F-019 | TC-F005-03 (subset status) | 🟡 |
| UC15 | Konfirmasi Pesanan | Staff | F-011 | TC-F011-02 | ✅ |
| UC16 | Update Status Pesanan | Staff | F-005, F-011 | TC-F011-03, -09 · TC-F005-02, -07, -16 · TC-REALTIME-INFRA-04, -07 · TC-CANCEL-03, -07 | ✅ |
| UC17 | Kelola Pesanan Outlet | Staff | F-011 | TC-F011-01, -04, -07, -10 | ✅ |
| UC18 | Cetak Kitchen Ticket | Staff | F-011 | TC-F011-05, -11 | ✅ |
| UC19 | Kelola Menu | Manager | F-009 | TC-F009-01…-09 | ✅ |
| UC20 | Kelola Kategori | Manager | F-009 | TC-F009-01 (kategori), -04 | 🟡 |
| UC21 | Kelola Outlet | Owner | F-010 | TC-F010-* (Phase 2) | ⏭️ |
| UC22 | Kelola Stok | Manager | F-012 / F-009 | TC-F009-03 · TC-AC6-01, -02 | 🟡 |
| UC23 | Kelola Karyawan | Owner | F-013 | TC-SEC-RBAC-* | 🟡 |
| UC24 | Kelola Voucher | Manager | F-018 | TC-F003-07, -09, -10, -11 | 🟡 |
| UC25 | Lihat Laporan Penjualan | Manager, Owner | F-014 | TC-F014-01…-08 | ✅ |
| UC26 | Lihat Laporan Keuangan | Owner | F-015 | TC-F015-* (Phase 3) | ⏭️ |
| UC27 | Export Data Akuntansi | Owner | F-016 | TC-F016-* (Phase 3) | ⏭️ |
| UC28 | Atur Loyalty Program | Owner | F-007 | TC-F007-* (Phase 3) | ⏭️ |

**Cakupan MVP**: 9 fitur prioritas tercakup penuh (✅) — termasuk **F-006 Reorder (UC9/UC10)** yang naik dari Phase 2 ke MVP (v1.2). UC yang mendukung interaksi MVP ditandai 🟡; sisanya ⏭️ dengan test case placeholder agar traceability tetap utuh saat phase berikutnya.

> **Catatan endpoint MVP v1.2 tanpa UC tersendiri (diuji di luar UC1–UC28):** Customer Cancel `POST /orders/{id}/cancel` → **TC-CANCEL-01…-08 + AC-9** (terkait UC16/UC7); CRUD Addresses `POST/PUT/DELETE /auth/me/addresses` (Delivery MVP) → **TC-ADDR-01…-08 + AC-10** (terkait UC5/UC7); Realtime SSE `GET /orders/{id}/events` & `/orders/track/{token}/events` + staff WS → **TC-F005-11…-16 + AC-11** (terkait UC8/UC16).
>
> **Catatan operasional v1.3 (ADR-009):** gate infrastruktur realtime (idle timeout, buffering, batas koneksi 503, rolling deploy, heartbeat, fallback polling, WS fan-out, HPA) diuji di **TC-REALTIME-INFRA-01…09 + AC-12** — kelas bug produksi SSE/WS, wajib lulus sebelum go-live.

---

## 5. Strategi Pengujian

### 5.1 Piramida & Tools

| Layer | Cakupan | Tools | Target |
|-------|---------|-------|--------|
| **Unit** | Logika harga, kalkulasi voucher, state machine, validasi, agregasi | Jest/Vitest (FE), Pytest/JUnit (BE) | ≥ 80% coverage modul kritis (pricing, payment, order) |
| **Integration** | API ↔ DB (PostgreSQL), trigger, webhook, queue, cache | Supertest/Postman + Testcontainers | Semua endpoint MVP + trigger `deduct_inventory`, `aggregate_daily_sales` |
| **Contract** | API ↔ Payment Gateway | Pact / mock gateway | Semua metode bayar & callback |
| **E2E** | Alur customer & back-office end-to-end | Playwright (web/PWA) | Semua AC kritis (AC-1…AC-12) + smoke suite |
| **Performance** | Latensi & throughput | k6 / Locust + Lighthouse | Lihat 5.2 |
| **Realtime/Infra** | SSE/WS long-lived: idle, buffering, connection cap, rolling deploy, HPA | k6 + SSE client + Kubernetes staging + Kong/ALB config | TC-REALTIME-INFRA-01…09 (gate operasional) |
| **Security** | RBAC, input validation, webhook, PCI | OWASP ZAP, manual, authz tests | Lihat 5.3 |
| **Regression** | Otomatis tiap merge | CI (GitHub Actions) | Smoke E2E < 10 menit |

### 5.2 Performance Test (target terukur dari PRD)

| Skenario | Target | Kondisi uji | Alat |
|----------|--------|-------------|------|
| **Checkout end-to-end** | **< 90 detik** dari buka aplikasi s.d. order dibuat | Mobile viewport, 3G throttling, guest, 1–3 item | k6 + Lighthouse (perceived) |
| **Pembayaran** | **< 10 detik** dari submit s.d. status `paid` | Gateway sandbox, QRIS & e-wallet | k6 / Postman timing |
| **Update status pesanan** | **< 5 detik** dari aksi POS s.d. tampil di customer | Realtime channel aktif | k6 + WS latency |
| **Pencarian/filter menu** | **< 1 detik** (katalog < 500 item) | 500 item, query umum | k6 |
| **Pesanan baru di dashboard** | **< 3 detik** | 20 pesanan/menit | k6 |
| **Refleksi perubahan menu** | **< 1 menit** | Cache invalidation | Manual/otomasi |
| **Concurrent checkout** | 200 VU, error rate < 1% | Beban puncak | k6 |
| **Redis cart read/write** | p95 < 100 ms | Operasi add/update cart guest | k6 |
| **SSE event delivery** | **< 5 detik** | Staff update status → event `status_change` diterima | k6 / SSE client |
| **Fallback polling** | interval 3s, status segar ≤ 3s | SSE dimatikan | E2E / WS |
| **Staff WS queue** | pesanan baru < 3 detik | 20 pesanan/menit | k6 + WS |
| **SSE idle survival** | koneksi hidup > 120s idle | ALB/Kong idle_timeout ≥ 120s; heartbeat 15s | k6 (long-lived) |
| **SSE concurrency** | 1.000 koneksi simultan, 0 OOM | 2 pod × 600; HPA target 400/pod | k6 + K8s HPA |
| **Over-limit rejection** | HTTP 503 (bukan crash) | Koneksi > SSE_MAX_CONNECTIONS_PER_POD | k6 |
| **Uptime** | > 99.5% | Monitoring produksi (exclude maintenance 02:00–04:00 WIB) | Uptime monitor |

### 5.3 Security Test (RBAC & proteksi data)

| ID | Area | Uji | Expected |
|----|------|-----|----------|
| TC-SEC-RBAC-01 | RBAC | Kasir akses kelola menu/outlet | 403 |
| TC-SEC-RBAC-02 | RBAC | Manager akses export akuntansi (Owner-only) | 403 |
| TC-SEC-RBAC-03 | RBAC | Staff akses order outlet lain | Ditolak / kosong |
| TC-SEC-RBAC-04 | RBAC | Customer akses endpoint admin | 403 |
| TC-SEC-05 | AuthN | Akses API tanpa JWT / JWT kadaluarsa | 401 |
| TC-SEC-06 | AuthZ | IDOR: akses order milik user lain | 403/404 |
| TC-SEC-07 | Webhook | Signature invalid / replay | 401 / idempotent |
| TC-SEC-08 | Injection | SQLi/XSS pada search, note, voucher | Disanitasi |
| TC-SEC-09 | Transport | Semua endpoint HTTPS/TLS; HTTP redirect | Enforced |
| TC-SEC-10 | Data | Password ter-hash; tidak ada PII di log | Terverifikasi |
| TC-SEC-11 | PCI | Data kartu tidak disimpan (one-time); ditangani gateway | Sesuai PCI-DSS |
| TC-SEC-12 | Rate limit | Brute force login / spam order | Dibatasi (429) |
| TC-SEC-13 | AuthZ | Tracking token: akses `GET /orders/track/{token}` tanpa/ token salah → 401/403; token order A tidak bisa baca order B | Ditolak (anti-IDOR) |
| TC-SEC-14 | Cart | Spoofing `X-Guest-Id` untuk membaca cart guest lain | Tidak bisa mengakses cart `guestId` milik orang lain; Redis key terisolasi |
| TC-SEC-15 | AuthZ | Reorder order milik user lain (`POST /orders/{id}/reorder`) | 403/404 (anti-IDOR) |
| TC-SEC-16 | AuthZ | Cancel order milik orang lain (`POST /orders/{id}/cancel`) | 403/404 (anti-IDOR) |
| TC-SEC-17 | AuthZ | CRUD address milik user lain | 403/404 |
| TC-SEC-18 | AuthZ | Merge `guest_id` milik guest lain | Ditolak |
| TC-SEC-19 | AuthZ | SSE `/orders/track/{tokenB}/events` lintas order | Ditolak (401/403); tidak ada event bocor |

### 5.4 Strategi Data & Environment
- **Test data**: seed katalog (≥ 50 produk, ≥ 1 dengan stok 0), user tiap role, voucher (valid/expired/kuota habis/min purchase).
- **Test double**: mock payment gateway (sukses/gagal/timeout) + **dual gateway (Midtrans/Xendit)**, clock mock untuk cron 00:01, mock `GET /config`.
- **Environment**: Dev → Staging (mirror produksi) → Produksi (smoke only).
- **Reset**: DB di-reset per suite integration/E2E untuk determinisme; **Redis di-flush** antar suite cart guest.

---

## 6. Definition of Done (DoD) & Gate Rilis MVP

### 6.1 Definition of Done — per User Story / Fitur
Sebuah fitur dinyatakan **Done** bila **semua** terpenuhi:
1. ✅ Semua acceptance criteria (GWT) untuk fitur tersebut **pass** di staging.
2. ✅ Happy path, edge case, dan negative case tercakup (min. 1 negative case per fitur).
3. ✅ Unit test pass dengan coverage modul kritis ≥ 80%.
4. ✅ Integration test untuk endpoint & trigger terkait pass.
5. ✅ E2E otomatis untuk alur kritis pass di CI.
6. ✅ Tidak ada bug **Critical/High** terbuka; bug Medium punya rencana perbaikan.
7. ✅ Performance sesuai target (bila fitur menyentuh alur yang diukur).
8. ✅ RBAC & validasi input terverifikasi.
9. ✅ Traceability diperbarui (UC → fitur → test case).
10. ✅ Dokumentasi API/QA diperbarui; test case di-review PO/QA lead.
11. ✅ **Kontrak backend terverifikasi**: `GET /config` (tax/point/currency/methods/shipping_flat_fee) & `GET /orders/track/{token}` berfungsi; cart hybrid (Redis source of truth + `X-Guest-Id`) & merge guest→member idempotent lulus uji.
12. ✅ **Kontrak endpoint MVP v1.2 lulus**: reorder (`POST /orders/{id}/reorder`), cart merge (`POST /orders/cart/merge`), customer cancel (`POST /orders/{id}/cancel`), CRUD addresses (Delivery), realtime SSE + fallback polling + staff WS.
13. ✅ **Gate operasional realtime v1.3 lulus** (ADR-009): SSE idle >120s, buffering off (<5s), over-limit 503, rolling deploy aman, heartbeat 15s, fallback polling (Redis cache + rate limit), WS fan-out, HPA.

### 6.2 Definition of Done — Backend vs Frontend (dua PRD)

| Aspek | Backend DoD | Frontend DoD |
|-------|-------------|--------------|
| Fungsi | Endpoint mengembalikan skema & status code benar; trigger DB berjalan | UI sesuai desain; state konsisten dengan API |
| Harga/uang | Perhitungan server-side authoritative; snapshot harga benar | Menampilkan harga real-time sesuai server; tidak mempercayai client |
| Error handling | Error terstruktur (400/401/403/404/409/422/500) | Semua error state punya UI (empty/error/loading/offline) |
| Perf | p95 API dalam target; query terindeks | LCP/checkout < target; lazy-load gambar |
| Keamanan | RBAC, validasi, rate limit, webhook signature | Tidak membocorkan token; input disanitasi; HTTPS |
| Observability | Log + audit trail (`order_status_logs`, `inventory_logs`) | Error tracking (Sentry) + analytics event |
| Test | Unit + integration + contract | Unit (komponen) + E2E (Playwright) |

### 6.3 Gate Rilis MVP (Release Readiness Checklist)

**Wajib (blocker — semua harus ✅):**
- [ ] **9 fitur MVP** (F-001, 002, 003, 004, 005, **006**, 009, 011, 014) lulus DoD.
- [ ] Semua **AC kritis** (AC-1 s.d. AC-12) pass otomatis di CI.
- [ ] **0 bug Critical/High** terbuka.
- [ ] Performance gate: checkout < 90s, payment < 10s, status update < 5s, search < 1s, dashboard order < 3s, SSE event < 5s, staff WS < 3s — **semua terpenuhi** di staging beban puncak.
- [ ] Security gate: TC-SEC-* lulus; **0** temuan RBAC/IDOR/injection High (termasuk anti-IDOR tracking token/SSE/reorder/cancel/address & isolasi cart `X-Guest-Id`).
- [ ] Kontrak backend lulus: `GET /config`, `GET /orders/track/{token}`, hybrid cart (Redis source of truth), merge guest→member idempotent, webhook idempoten by `transaction_id` + dual gateway.
- [ ] **Endpoint MVP v1.2 lulus**: reorder, cart merge (`cart_merged:true`), customer cancel (state machine + refund + audit), CRUD addresses (is_default exclusivity + snapshot checkout), realtime SSE + fallback polling 3s + staff WS.
- [ ] **Gate operasional realtime v1.3 lulus (ADR-009)** — TC-REALTIME-INFRA-01…09: SSE survive idle >120s; buffering off → event <5s; over-limit → HTTP 503 (bukan crash); rolling deploy tidak memutus SSE (grace period 60s + preStop); heartbeat `ping` 15s; fallback polling (Redis cache + rate limit 40/min/IP); WS fan-out tanpa sticky session; HPA `sse_active_connections`.
- [ ] **Delivery MVP** terverifikasi: checkout delivery + snapshot address; ongkir flat.
- [ ] E2E smoke suite hijau pada build kandidat rilis.
- [ ] Rollback plan & monitoring (uptime, error rate) siap.
- [ ] UAT sign-off oleh PO.

**Seharusnya (high — boleh rilis dengan mitigasi tercatat):**
- [ ] Coverage unit modul kritis ≥ 80%.
- [ ] Regression suite otomatis < 10 menit.
- [ ] Low-stock alert & laporan harian otomatis terverifikasi.
- [ ] Dokumentasi QA & traceability final.

**Nice-to-have (tidak memblok rilis MVP):**
- [ ] Visual regression testing.
- [ ] Chaos/failover test gateway.
- [ ] Accessibility (WCAG AA) audit penuh.

### 6.4 Kriteria Keluar (Exit Criteria)
MVP dinyatakan siap rilis bila **seluruh item "Wajib"** pada Gate Rilis terpenuhi dan **tidak ada** item "Wajib" yang tertunda tanpa persetujuan tertulis dari PO dan QA Lead.

---

## 7. Risiko Pengujian & Mitigasi

| Risiko | Dampak | Mitigasi QA |
|--------|--------|-------------|
| Gateway pembayaran tidak stabil | Tinggi | Uji multi-gateway (Midtrans + Xendit), fallback, idempotency test |
| Stok tidak sinkron (race condition) | Tinggi | Concurrency test, lock saat checkout, verifikasi trigger deduksi |
| Harga berubah saat checkout | Sedang | Re-validate harga server-side; test perubahan mid-session |
| Cron laporan tidak jalan / duplikat | Sedang | Clock mock, idempotency test (ON CONFLICT upsert) |
| RBAC bocor antar-role/outlet | Tinggi | Matriks RBAC eksplisit + IDOR test tiap endpoint |
| Notifikasi realtime delay | Sedang | Latency test < 5s; uji koneksi terputus |
| Katalog besar lambat | Sedang | Load test 500+ item; indeks & cache |
| Cart guest tidak sinkron (localStorage vs Redis) | Tinggi | Uji divergensi & Redis sebagai source of truth; fallback TTL expired; flush Redis antar suite |
| Merge guest→member ganda | Sedang | Uji idempotensi merge per `guestId` (login ulang tidak duplikasi) |
| Tracking token bocor / IDOR | Tinggi | Uji anti-IDOR: token terikat 1 order; tanpa token → 401/403 |
| Config `GET /config` tidak konsisten (tax/ongkir) | Sedang | Uji pricing server-side dari config; cegah hitung di client |
| SSE gagal / tidak terkirim (realtime putus) | Tinggi | Uji SSE < 5s + **fallback polling 3s** saat SSE gagal; uji reconnect/heartbeat 15s |
| Customer cancel setelah CONFIRMED (state tidak konsisten) | Tinggi | Uji state machine cancel (PENDING/PAID customer, CONFIRMED staff), refund trigger, idempotent, audit log |
| Refund otomatis gagal / ganda | Tinggi | Uji refund trigger + idempotency cancel; verifikasi `payments.status=refunded` sekali saja |
| Snapshot address hilang saat checkout delivery | Sedang | Uji order menyimpan snapshot address; ubah/hapus address tidak mengubah order historis |
| Merge `guest_id` lintas user (cart bocor) | Tinggi | Uji anti-IDOR merge; merge hanya untuk guest_id milik pemanggil |
| SSE terputus saat idle ~60s (default hop) | Tinggi | Uji TC-REALTIME-INFRA-01: SSE survive idle >120s; verifikasi idle_timeout ALB/Kong ≥ 120s |
| Event tertahan buffering (tidak sampai klien) | Tinggi | Uji TC-REALTIME-INFRA-02: buffering off + `X-Accel-Buffering: no`; event <5s |
| OOM / crash saat koneksi SSE membludak | Tinggi | Uji TC-REALTIME-INFRA-03: over-limit → HTTP 503 (bukan crash); cap per pod + HPA |
| SSE terputus saat rolling deploy | Sedang | Uji TC-REALTIME-INFRA-04: grace period 60s + preStop drain + event penutup/retry |
| Lonjakan beban polling saat SSE down (≈333 req/s) | Sedang | Uji TC-REALTIME-INFRA-06: layani dari Redis cache + rate limit 40/min/IP; alert RPS |

---

## 8. Ringkasan Deliverable & Langkah Berikutnya

**Deliverable dokumen ini:**
1. Test plan per fitur MVP (F-001…F-014) + endpoint v1.2 (reorder, cart merge, cancel, addresses, SSE) + **infra realtime v1.3 (TC-REALTIME-INFRA-01…09)** dengan happy/edge/negative case — **Bagian 2**.
2. Acceptance criteria terukur (GWT) untuk 12 alur kritis (AC-1…AC-12, termasuk realtime operasional) — **Bagian 3**.
3. Matriks traceability UC1–UC28 → Fitur → Test Case — **Bagian 4**.
4. Strategi pengujian (unit/integration/E2E/performance/realtime-infra/security) — **Bagian 5**.
5. DoD & gate rilis MVP (termasuk gate operasional realtime) — **Bagian 6**.
6. Changelog revisi & sinkronisasi PRD-BACKEND/FRONTEND/DEVOPS — **Bagian 9**.

**Langkah berikutnya (usulan):**
- Konversi test case Bagian 2–3 menjadi file otomasi (Playwright spec + Pytest + k6 SSE) di repo QA.
- Integrasikan performance & gate operasional realtime ke CI (k6 threshold) sebagai blocker merge.
- Review bersama PO untuk validasi prioritas & deferred test case (UC11–UC14, UC21, UC26–UC28).
- Setelah PRD-FRONTEND-UX terbit: re-sinkronkan kontrak UI/visual ke Bagian 2–3.

---

## 9. Changelog & Sinkronisasi PRD

**Revisi 1.3 — sinkron dengan PRD-BACKEND-DEVOPS v1.1 (ADR-009, §1.6–§1.9):**

| # | Requirement operasional | Dampak ke PRD-QA | Lokasi perubahan |
|---|-------------------------|------------------|------------------|
| 1 | SSE survive idle > 120s (ALB/Kong idle_timeout ≥ 120s) | **TC-REALTIME-INFRA-01** + AC-12 | Bagian 2 (F-005c), 3 (AC-12), 5.2, 6.3 |
| 2 | Buffering off → event < 5s (`proxy_buffering off`, `X-Accel-Buffering: no`) | **TC-REALTIME-INFRA-02** + AC-12 | idem |
| 3 | Over-limit → HTTP 503 (`SSE_MAX_CONNECTIONS_PER_POD`), bukan crash | **TC-REALTIME-INFRA-03** + AC-12 | idem |
| 4 | Graceful shutdown / rolling deploy tidak memutus SSE | **TC-REALTIME-INFRA-04** + AC-12 | idem |
| 5 | Heartbeat `ping` 15s | **TC-REALTIME-INFRA-05** + AC-12 | idem |
| 6 | Fallback polling 3s (Redis cache + rate limit 40/min/IP) | **TC-REALTIME-INFRA-06** + AC-12 | idem |
| 7 | WS staff upgrade + fan-out (Redis pub/sub, tanpa sticky) | **TC-REALTIME-INFRA-07, -09** | Bagian 2 (F-005c), 4 (UC16) |
| 8 | HPA custom metric `sse_active_connections` | **TC-REALTIME-INFRA-08** | Bagian 2 (F-005c) |

**Tambahan selaras:** layer pengujian baru **Realtime/Infra** (5.1); perf target SSE idle survival, 1.000 koneksi, over-limit 503 (5.2); DoD #13; gate rilis operasional di 6.3; 5 risiko operasional baru (Bagian 7); UC8/UC16 diperluas.

**Ringkasan kompatibilitas:** semua requirement DevOps v1.1 **kompatibel**; revisi bersifat *additive*. Tidak ada test case lama dihapus. Ini melengkapi lapisan operasional sehingga kelima dokumen (Backend v1.3, Frontend v1.3, Frontend-UX, QA v1.3, DevOps v1.1) konsisten penuh.

---

**Revisi 1.2 — sinkron dengan PRD-BACKEND v1.3 & PRD-FRONTEND v1.3:**

| # | Perubahan scope | Dampak ke PRD-QA | Lokasi perubahan |
|---|-----------------|------------------|------------------|
| 1 | `POST /orders/{id}/reorder` → `{ items: CartItemDTO[] }` (ADR-010); **F-006 Reorder naik ke MVP** | Section **F-006** baru (TC-F006-01…-08) + **AC-7**; UC9/UC10 → ✅ | Bagian 2 (F-006), 3 (AC-7), 4 (UC9, UC10) |
| 2 | `POST /orders/cart/merge { guest_id }` + auto-merge saat login (`X-Guest-Id`, `cart_merged:true`) — ADR-011 | TC-F003-23…-25 + **AC-8**; UC6 → ✅ | Bagian 2 (F-003), 3 (AC-8), 4 (UC6) |
| 3 | `POST /orders/{id}/cancel { reason }` — customer PENDING/PAID, staff setelah CONFIRMED, refund otomatis | Section **F-005b** (TC-CANCEL-01…-08) + **AC-9**; UC16 diperluas | Bagian 2 (F-005b), 3 (AC-9), 4 (UC16) |
| 4 | CRUD `/auth/me/addresses` — wajib mode Delivery (MVP) | Section **F-003b** (TC-ADDR-01…-08) + **AC-10**; UC5 diperluas | Bagian 2 (F-003b), 3 (AC-10), 4 (UC5) |
| 5 | Realtime **SSE** `GET /orders/{id}/events` + `/orders/track/{token}/events` (event `status_change`, heartbeat 15s) + fallback polling 3s + staff WS `wss://api/orders/queue/ws` | TC-F005-11…-16 + **AC-11**; perf test SSE/WS; UC8 diperluas | Bagian 2 (F-005), 3 (AC-11), 5.2, 4 (UC8) |
| 6 | **Delivery = MVP** (dari Phase 2) | Pindah dari deferred → MVP; test delivery + snapshot address | Bagian 1.1, 2 (F-003b), 6.3 |
| 7 | **F-006 Reorder = MVP** (dari Phase 2) | UC9/UC10 → ✅ | Bagian 1.1, 4 |
| 8 | `slug` produk → Phase 2 (FE pakai `/product/:id`) | Catat di out-of-scope; tidak ada test slug di MVP | Bagian 1.2 |

**Tambahan selaras:** TC-SEC-15…-19 (anti-IDOR reorder/cancel/address/merge/SSE); 6 risiko baru (SSE gagal, cancel state, refund ganda, snapshot address, merge lintas user); DoD #12; gate rilis diperluas (9 fitur, AC-1…AC-11, endpoint v1.2, Delivery MVP).

**Ringkasan kompatibilitas:** semua keputusan **kompatibel**; revisi bersifat *additive* (menambah test case & memperluas cakupan). Tidak ada test case lama dihapus; UC9/UC10 berubah status dari ⏭️ → ✅.

---

**Revisi 1.1 — sinkron dengan keputusan PO atas 5 pertanyaan terbuka FE (§11 PRD-BACKEND.md):**

| # | Keputusan final | Dampak ke PRD-QA | Lokasi perubahan |
|---|-----------------|------------------|------------------|
| a | Cart guest **HYBRID**: localStorage (cache offline) + Redis keyed `session_id`/`guestId` (`X-Guest-Id`); Redis = source of truth saat checkout; merge guest→member **idempotent** per guestId | Test case baru: merge idempotent, Redis vs localStorage divergen, TTL expired fallback, lock stok via Redis | F-003 (TC-F003-05, -08, -12, -17…-20), AC-3 |
| b | Endpoint publik baru **`GET /config`** → { tax_rate, point_value, currency, active_payment_methods, shipping_flat_fee } | Test: pricing pakai tax/point dari config server | F-003 (TC-F003-21, -22), AC-4 (scenario total harga), 5.4 |
| c | Guest tracking via **`tracking_token`** + publik **`GET /orders/track/{token}`** (tanpa JWT) | Test: akses tanpa/invalid token → 401/403; anti-IDOR token | F-005 (TC-F005-06, -08, -09, -10), 5.3 (TC-SEC-13) |
| d | Ongkir **flat** di MVP (`shipping_flat_fee`) | Test: `total = subtotal + tax + flat fee − diskon` | F-003 (TC-F003-21), AC-4 |
| e | Saved payment / tokenisasi kartu → **Phase 2** | Tandai test tokenisasi kartu sebagai **deferred ⏭️** | F-004 (TC-F004-04, -14) |

**Tambahan non-breaking (selaras):** webhook idempoten **by `transaction_id`** + dual gateway Midtrans/Xendit (TC-F004-05, -13); status order kanonik PENDING→PAID→CONFIRMED→BEING_PREPARED→READY→COMPLETED/CANCELLED (sudah match — tidak berubah).

**Pemicu re-sinkronisasi berikutnya:** PRD-FRONTEND-UX.md (kontrak UI/visual), lalu PRD-BACKEND-DEVOPS.md (CI/CD, environment, monitoring) — update Bagian 4 (traceability) & 6.3 (gate rilis) bila menyentuh scope.

---

*Dokumen ini adalah SUPPORT untuk kedua PRD (Backend & Frontend) CoffeeShop Online. Perubahan scope fitur wajib diikuti pembaruan matriks traceability (Bagian 4) dan gate rilis (Bagian 6.3).*
