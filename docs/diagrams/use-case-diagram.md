# Use Case Diagram - CoffeeShop Online

> Pemodelan Berorientasi Objek - Use Case

```mermaid
usecaseDiagram
    actor "Guest / Pelanggan" as Guest
    actor "Member / Pelanggan" as Member
    actor "Kasir / Barista" as Staff
    actor "Manajer" as Manager
    actor "Owner" as Owner
    actor "Payment Gateway" as PG
    actor "Notification Service" as Notif
    actor "Accounting System" as Accounting

    rectangle "CoffeeShop Online System" {
        usecase "Lihat Menu" as UC1
        usecase "Cari Produk" as UC2
        usecase "Tambah ke Keranjang" as UC3
        usecase "Kustomisasi Pesanan" as UC4
        usecase "Checkout sebagai Tamu" as UC5
        usecase "Login / Register" as UC6
        usecase "Pembayaran Online" as UC7
        usecase "Lacak Pesanan" as UC8
        usecase "Riwayat Pesanan" as UC9
        usecase "Reorder" as UC10
        usecase "Lihat Poin Loyalty" as UC11
        usecase "Tukar Poin" as UC12
        usecase "Berikan Review" as UC13
        usecase "Terima Notifikasi" as UC14
        
        usecase "Konfirmasi Pesanan" as UC15
        usecase "Update Status Pesanan" as UC16
        usecase "Kelola Pesanan Outlet" as UC17
        usecase "Cetak Kitchen Ticket" as UC18
        
        usecase "Kelola Menu" as UC19
        usecase "Kelola Kategori" as UC20
        usecase "Kelola Outlet" as UC21
        usecase "Kelola Stok" as UC22
        usecase "Kelola Karyawan" as UC23
        usecase "Kelola Voucher" as UC24
        usecase "Lihat Laporan Penjualan" as UC25
        usecase "Lihat Laporan Keuangan" as UC26
        usecase "Export Data Akuntansi" as UC27
        usecase "Atur Loyalty Program" as UC28
    }

    Guest --> UC1
    Guest --> UC2
    Guest --> UC3
    Guest --> UC4
    Guest --> UC5
    Guest --> UC7
    Guest --> UC8
    
    Member --> UC6
    Member --> UC9
    Member --> UC10
    Member --> UC11
    Member --> UC12
    Member --> UC13
    Member --> UC14
    
    Staff --> UC15
    Staff --> UC16
    Staff --> UC17
    Staff --> UC18
    
    Manager --> UC19
    Manager --> UC20
    Manager --> UC22
    Manager --> UC24
    Manager --> UC25
    Manager --> UC21 : koordinasi
    
    Owner --> UC21
    Owner --> UC23
    Owner --> UC26
    Owner --> UC27
    Owner --> UC28
    Owner --> UC25 : review strategis
    
    UC7 ..> PG : <<include>>
    UC8 ..> Notif : <<include>>
    UC14 ..> Notif : <<include>>
    UC27 ..> Accounting : <<include>>
    
    UC13 .> UC8 : <<extend>>
    UC12 .> UC11 : <<extend>>
```

## Daftar Aktor

| Aktor | Deskripsi |
|-------|-----------|
| Guest | Pengunjung yang belum login, bisa pesan sebagai tamu. |
| Member | Pelanggan terdaftar, punya loyalty points dan riwayat. |
| Staff | Kasir/barista yang mengelola pesanan di outlet. |
| Manager | Mengelola operasional harian: menu, stok, voucher, laporan. |
| Owner | Akses penuh termasuk outlet, karyawan, laporan keuangan, export. |
| Payment Gateway | Sistem eksternal untuk memproses pembayaran. |
| Notification Service | Mengirim push, SMS, WhatsApp. |
| Accounting System | Integrasi Xero/QuickBooks/Jurnal untuk export data. |

## Daftar Use Case

| ID | Use Case | Aktor |
|----|----------|-------|
| UC1 | Lihat Menu | Guest, Member |
| UC2 | Cari Produk | Guest, Member |
| UC3 | Tambah ke Keranjang | Guest, Member |
| UC4 | Kustomisasi Pesanan | Guest, Member |
| UC5 | Checkout sebagai Tamu | Guest |
| UC6 | Login / Register | Member |
| UC7 | Pembayaran Online | Guest, Member |
| UC8 | Lacak Pesanan | Guest, Member |
| UC9 | Riwayat Pesanan | Member |
| UC10 | Reorder | Member |
| UC11 | Lihat Poin Loyalty | Member |
| UC12 | Tukar Poin | Member |
| UC13 | Berikan Review | Member |
| UC14 | Terima Notifikasi | Member |
| UC15 | Konfirmasi Pesanan | Staff |
| UC16 | Update Status Pesanan | Staff |
| UC17 | Kelola Pesanan Outlet | Staff |
| UC18 | Cetak Kitchen Ticket | Staff |
| UC19 | Kelola Menu | Manager |
| UC20 | Kelola Kategori | Manager |
| UC21 | Kelola Outlet | Owner |
| UC22 | Kelola Stok | Manager |
| UC23 | Kelola Karyawan | Owner |
| UC24 | Kelola Voucher | Manager |
| UC25 | Lihat Laporan Penjualan | Manager, Owner |
| UC26 | Lihat Laporan Keuangan | Owner |
| UC27 | Export Data Akuntansi | Owner |
| UC28 | Atur Loyalty Program | Owner |
