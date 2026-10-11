# Data Flow Diagram Level 1

> DFD Level 1 - Dekomposisi Sistem CoffeeShop Online menjadi proses-proses utama.

```mermaid
flowchart LR
    subgraph "External Entities"
        C["Customer"]
        S["Staff"]
        O["Owner / Manager"]
        PG["Payment Gateway"]
        NS["Notification Service"]
        AS["Accounting System"]
    end

    subgraph "Data Stores"
        DS1[("D1: User & Customer DB")]
        DS2[("D2: Menu & Catalog DB")]
        DS3[("D3: Cart DB")]
        DS4[("D4: Order DB")]
        DS5[("D5: Payment DB")]
        DS6[("D6: Inventory DB")]
        DS7[("D7: Loyalty DB")]
        DS8[("D8: Reporting DB")]
        DS9[("D9: Audit Logs")]
    end

    P1["P1: Manage Catalog\nKelola Menu, Kategori, Outlet"]
    P2["P2: Browse & Order\nLihat Menu, Keranjang, Checkout"]
    P3["P3: Process Payment\nPembayaran Online"]
    P4["P4: Order Fulfillment\nKelola Pesanan & Status"]
    P5["P5: Loyalty & Rewards\nPoin & Voucher"]
    P6["P6: Inventory Management\nStok & Bahan Baku"]
    P7["P7: Reporting & Accounting\nLaporan & Export"]
    P8["P8: Notification Engine\nNotifikasi Pelanggan"]

    C -->|"browse menu, add to cart, place order"| P2
    P2 -->|"menu list, prices"| C
    P2 -->|"read/write cart"| DS3
    P2 -->|"read menu"| DS2
    P2 -->|"read customer"| DS1
    P2 -->|"new order request"| P3
    P2 -->|"order placed"| P4
    P2 -->|"redeem voucher/points"| P5

    P3 -->|"payment request"| PG
    PG -->|"payment status"| P3
    P3 -->|"payment record"| DS5
    P3 -->|"payment confirmed"| P4
    P3 -->|"payment failed"| P8

    P4 -->|"order status"| DS4
    P4 -->|"prepare order"| S
    S -->|"update status"| P4
    P4 -->|"deduct inventory"| P6
    P4 -->|"grant loyalty points"| P5
    P4 -->|"send status update"| P8

    P5 -->|"read/write loyalty"| DS7
    P5 -->|"apply voucher"| P2
    P5 -->|"points earned"| C

    P6 -->|"read/write inventory"| DS6
    P6 -->|"low stock alert"| O
    P6 -->|"stock usage log"| DS9

    O -->|"manage menu, stok, outlet"| P1
    P1 -->|"write catalog"| DS2
    P1 -->|"write outlet"| DS1
    O -->|"view reports"| P7
    P7 -->|"read orders & payments"| DS4
    P7 -->|"read sales aggregate"| DS8
    P7 -->|"generate report"| O
    P7 -->|"export to accounting"| AS
    P7 -->|"report audit trail"| DS9

    P8 -->|"push/SMS/WhatsApp"| NS
    NS -->|"delivery receipt"| P8
    P8 -->|"notification"| C

    P2 -.->|"write audit"| DS9
    P3 -.->|"write audit"| DS9
    P4 -.->|"write audit"| DS9
```

## Daftar Proses (P)

| ID | Nama Proses | Deskripsi | Input | Output |
|----|-------------|-----------|-------|--------|
| P1 | Manage Catalog | Kelola outlet, kategori, produk, varian, opsi, harga | Data dari Owner/Manager | Menu & catalog terbaru |
| P2 | Browse & Order | Pelanggan melihat menu, membuat pesanan, checkout | Permintaan customer | Order request, cart |
| P3 | Process Payment | Memproses pembayaran melalui gateway | Order total, payment method | Payment status |
| P4 | Order Fulfillment | Mengelola dapur, status pesanan, selesai | Pesanan baru, update staff | Status pesanan, inventory request |
| P5 | Loyalty & Rewards | Mengelola poin, tier, voucher | Order completed, redeem request | Poin, diskon |
| P6 | Inventory Management | Mengelola stok bahan baku, alert, BOM | Penggunaan dari order, input stok | Stok terkini, alert |
| P7 | Reporting & Accounting | Membuat laporan harian/bulanan dan export | Data order & payment | Laporan & export file |
| P8 | Notification Engine | Mengirim notifikasi ke pelanggan | Trigger dari order/payment | Pesan ke notification service |

## Daftar Data Store (D)

| ID | Nama | Isi |
|----|------|-----|
| D1 | User & Customer DB | Users, customers, addresses, staff, roles |
| D2 | Menu & Catalog DB | Outlets, categories, products, variants, options, option values |
| D3 | Cart DB | Cart dan cart items sementara |
| D4 | Order DB | Orders, order items, order status logs |
| D5 | Payment DB | Payments, refunds, transaction logs |
| D6 | Inventory DB | Inventory items, BOM, suppliers, inventory logs |
| D7 | Loyalty DB | Loyalty tiers, loyalty points, vouchers |
| D8 | Reporting DB | Daily sales, monthly reports, analytics |
| D9 | Audit Logs | Semua perubahan status, payment, stok |

## Catatan
- Proses P2 menerima trigger dari customer, tetapi voucher/poin diproses melalui P5.
- Pembayaran P3 adalah boundary dengan payment gateway eksternal.
- Setiap perubahan status pesanan di P4 men-trigger notifikasi P8 dan pengurangan stok P6.
- Laporan P7 membaca data agregat dari D8 agar query cepat.
