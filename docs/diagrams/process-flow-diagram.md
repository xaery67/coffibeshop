# Process Flow Diagram - CoffeeShop Online

> Pemodelan Aliran Proses & Logika Bisnis

## 1. Alur Proses Pemesanan Online (Customer)

```mermaid
flowchart TD
    A[Pelanggan Buka Aplikasi/Web] --> B{Lihat Menu}
    B --> C[Pilih Produk]
    C --> D{Perlu Kustomisasi?}
    D -->|Ya| E[Pilih Varian & Opsi]
    D -->|Tidak| F[Tambah ke Keranjang]
    E --> F
    F --> G{Lanjut Checkout?}
    G -->|Ya| H{Sudah Login?}
    H -->|Tidak| I[Guest Checkout atau Register/Login]
    H -->|Ya| J[Pilih Tipe Pengambilan]
    I --> J
    J --> K[Dine-in / Takeaway / Pickup / Delivery]
    K --> L{Ada Voucher/Poin?}
    L -->|Ya| M[Terapkan Voucher atau Poin]
    L -->|Tidak| N[Konfirmasi Ringkasan Pesanan]
    M --> N
    N --> O[Pilih Metode Pembayaran]
    O --> P[Kirim ke Payment Gateway]
    P --> Q{Pembayaran Sukses?}
    Q -->|Ya| R[Order Status: PAID]
    Q -->|Tidak| S[Tampilkan Pesan Gagal]
    S --> O
    R --> T[Kirim Notifikasi ke Pelanggan]
    T --> U[Tampilkan Estimasi Waktu]
    U --> V[Proses di Dapur]
    V --> W{Pesanan Siap?}
    W -->|Ya| X[Status: READY]
    X --> Y[Notifikasi Pickup]
    Y --> Z[Pelanggan Ambil / Diantar]
    Z --> AA[Status: COMPLETED]
    AA --> AB[Minta Review]
```

## 2. Alur Proses Back Office - Manajemen Pesanan

```mermaid
flowchart TD
    A[Dashboard Kasir] --> B{Pesanan Baru Masuk}
    B -->|Ada| C[Tampilkan di Antrian]
    C --> D[Konfirmasi Pesanan]
    D --> E[Status: CONFIRMED]
    E --> F[Cetak Kitchen Ticket]
    F --> G[Dapur Mempersiapkan]
    G --> H{Selesai Dipersiapkan}
    H -->|Ya| I[Status: BEING PREPARED]
    I --> J[Barista Selesai]
    J --> K[Status: READY]
    K --> L{Pelanggan Ambil}
    L -->|Ya| M[Status: COMPLETED]
    L -->|Tidak dalam 15 menit| N[Hubungi Pelanggan]
    N --> O{Pelanggan Datang}
    O -->|Ya| M
    O -->|Tidak| P[Status: CANCELLED/NO-SHOW]
```

## 3. Alur Proses Perhitungan Harga & Stok

```mermaid
flowchart TD
    A[Cart Items] --> B[Hitung Base Price Produk]
    B --> C[Tambah Adjustment Varian]
    C --> D[Tambah Adjustment Opsi/Topping]
    D --> E[Kalikan Kuantitas]
    E --> F[Hitung Subtotal per Item]
    F --> G[Total Items]
    G --> H{Ada Voucher?}
    H -->|Ya| I[Hitung Diskon]
    H -->|Tidak| J[Total Setelah Diskon]
    I --> J
    J --> K[Tambah Pajak]
    K --> L[Tambah Biaya Pengiriman]
    L --> M[Grand Total]
    
    N[Order Completed] --> O[Kurangi Stok Varian]
    O --> P[Kurangi Stok Bahan Baku via BOM]
    P --> Q{Cek Reorder Point}
    Q -->|Di bawah threshold| R[Kirim Alert Low Stock]
    Q -->|Normal| S[Selesai]
    R --> S
```

## 4. Alur Proses Laporan Bulanan Otomatis

```mermaid
flowchart TD
    A[Cron Job Harian 00:01] --> B[Ambil Transaksi Hari Sebelumnya]
    B --> C[Hitung Total Revenue per Outlet]
    C --> D[Hitung COGS dari BOM]
    D --> E[Hitung PPN & Diskon]
    E --> F[Simpan Daily Sales]
    F --> G{Akhir Bulan?}
    G -->|Ya| H[Agregasi Daily Sales]
    H --> I[Hitung Gross Profit]
    I --> J[Kurangi Operating Expenses]
    J --> K[Hitung Net Profit]
    K --> L[Generate Monthly Report]
    L --> M[Export ke Format Excel/CSV]
    M --> N[Kirim Notifikasi ke Owner]
    N --> O[Opsional: Sinkronkan ke Accounting System]
    G -->|Tidak| P[Tunggu Hari Berikutnya]
```

## 5. Logika Status Pesanan

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> PAID : Payment Success
    PENDING --> CANCELLED : Timeout / Cancel
    PAID --> CONFIRMED : Staff Confirms
    PAID --> CANCELLED : Refund / Cancel
    CONFIRMED --> BEING_PREPARED : Kitchen Starts
    BEING_PREPARED --> READY : Order Done
    READY --> COMPLETED : Customer Picked Up
    READY --> CANCELLED : No-show / Refund
    CANCELLED --> [*]
    COMPLETED --> [*]
```

| Status | Keterangan | Aktor Trigger |
|--------|------------|---------------|
| PENDING | Pesanan dibuat, menunggu pembayaran | System |
| PAID | Pembayaran berhasil | Payment Gateway |
| CONFIRMED | Kasir mengonfirmasi pesanan | Staff |
| BEING_PREPARED | Sedang dipersiapkan di dapur | Staff |
| READY | Pesanan siap diambil | Staff |
| COMPLETED | Pesanan selesai diambil | Staff/Customer |
| CANCELLED | Pesanan dibatalkan | Staff/System |

## 6. Logika Penerapan Voucher

```mermaid
flowchart TD
    A[Input Kode Voucher] --> B{Cari Voucher Aktif}
    B -->|Tidak Ditemukan| C[Tampilkan: Kode Tidak Valid]
    B -->|Ditemukan| D{Sudah Melewati Start Date?}
    D -->|Belum| E[Tampilkan: Belum Aktif]
    D -->|Ya| F{Sudah Expired?}
    F -->|Ya| G[Tampilkan: Sudah Kadaluarsa]
    F -->|Tidak| H{Usage Limit Tercapai?}
    H -->|Ya| I[Tampilkan: Kuota Habis]
    H -->|Tidak| J{Memenuhi Min Purchase?}
    J -->|Tidak| K[Tampilkan: Min. Belanja Tidak Terpenuhi]
    J -->|Ya| L{Berlaku untuk Produk Ini?}
    L -->|Tidak| M[Tampilkan: Tidak Berlaku]
    L -->|Ya| N[Hitung Diskon]
    N --> O{Diskon > Max Discount?}
    O -->|Ya| P[Terapkan Max Discount]
    O -->|Tidak| Q[Terapkan Diskon]
    P --> R[Tampilkan Total Akhir]
    Q --> R
```

## 7. Logika Loyalty Points

```mermaid
flowchart TD
    A[Order Completed] --> B{Customer Terdaftar?}
    B -->|Tidak| C[Tidak Ada Poin]
    B -->|Ya| D[Hitung Base Poin dari Total]
    D --> E{Ada Tier Multiplier?}
    E -->|Ya| F[Kalikan dengan Tier Multiplier]
    E -->|Tidak| G[Simpan Poin]
    F --> G
    G --> H[Update Customer.total_points]
    H --> I{Naik Tier?}
    I -->|Ya| J[Update Loyalty Tier & Kirim Notifikasi]
    I -->|Tidak| K[Selesai]
```
