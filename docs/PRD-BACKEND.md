# PRD-BACKEND - CoffeeShop Online
>
> **Product Requirements Document — Backend Engineering Specification**  
> Platform pesanan online coffeeshop + otomatisasi administrasi bulanan  
> **Versi:** 1.3 | **Tanggal:** 9 Oktober 2026 | **Status:** MVP Ready (PO-signed)

---

## 1. Ringkasan Arsitektur & Service Landscape

Sistem dibagi menjadi **9 service/modul** terpisah yang berkomunikasi via REST API + Message Queue (async). Semua service berbagi database PostgreSQL (multi-schema) dan Redis untuk cache/session.

| Service | Tanggung Jawab Utama | Database Schema / Tabel Utama |
|---------|---------------------|-------------------------------|
| **Auth** | Registrasi, login, JWT, refresh token, RBAC, password reset | `users`, `customers` |
| **Catalog** | CRUD outlet, kategori, produk, varian, opsi, harga, gambar | `outlets`, `categories`, `products`, `product_variants`, `product_options`, `option_values` |
| **Order** | Keranjang, checkout, manajemen status pesanan, kitchen ticket | `carts`, `cart_items`, `orders`, `order_items`, `order_item_options`, `order_status_logs` |
| **Payment** | Integrasi Midtrans/Xendit, webhook, refund, reconciliation | `payments`, `vouchers` |
| **Inventory** | Stok bahan baku, BOM, auto-deduction, low-stock alert, supplier | `inventory_items`, `inventory_logs`, `product_bom`, `suppliers` |
| **Loyalty** | Poin, tier (Bronze–Platinum), voucher, birthday reward | `loyalty_tiers`, `loyalty_points`, `vouchers` |
| **Reporting** | Agregasi daily/monthly, P&L, COGS, export akuntansi (Xero/QuickBooks/Jurnal) | `daily_sales`, `monthly_reports` |
| **Notification** | Push (FCM/OneSignal), WhatsApp (Twilio/WA API), SMS, Email | — (stateless, pakai queue) |
| **Admin** | Manajemen karyawan/role, outlet, audit log, konfigurasi sistem | `users` (role), `outlets`, audit logs |

---

## 2. REST API Endpoint per Service

> **Konvensi:** `POST /api/v1/{service}/{resource}` | Response standar: `{ success: bool, data?, error? }` | Auth: `Authorization: Bearer <JWT>` (kecuali public endpoints)

### 2.1 Auth Service
| Method | Path | Deskripsi | Payload Ringkas |
|--------|------|-----------|-----------------|
| POST | `/auth/register` | Registrasi customer baru | `{ email, phone, password, full_name }` |
| POST | `/auth/login` | Login → access + refresh token | `{ email/phone, password }` |
| POST | `/auth/refresh` | Refresh access token | `{ refresh_token }` |
| POST | `/auth/forgot-password` | Kirim link reset | `{ email }` |
| POST | `/auth/reset-password` | Ganti password | `{ token, new_password }` |
| GET | `/auth/me` | Profil user login | — |
| GET | `/auth/me/addresses` | **Address book** — daftar alamat customer | (auth required) |
| POST | `/auth/me/addresses` | Tambah alamat baru | `{ label, recipient_name, phone, address_line, city, postal_code, latitude?, longitude?, is_default? }` |
| PUT | `/auth/me/addresses/{id}` | Update alamat | partial fields |
| DELETE | `/auth/me/addresses/{id}` | Hapus alamat | — |

### 2.2 Catalog Service
| Method | Path | Deskripsi | Payload Ringkas |
|--------|------|-----------|-----------------|
| GET | `/catalog/outlets` | Daftar outlet aktif | query: `?lat=&lng=&radius=` |
| GET | `/catalog/outlets/{id}` | Detail outlet + jam operasional | — |
| GET | `/catalog/categories` | Kategori per outlet | query: `?outlet_id=` |
| GET | `/catalog/products` | Daftar produk (filter kategori, search, available) | query: `?outlet_id=&category_id=&q=&available=true` |
| GET | `/catalog/products/{id}` | Detail produk + varian + opsi | — |
| **Admin only:** |
| POST | `/catalog/outlets` | Buat outlet baru | `{ name, code, address, phone, email, opening_hours }` |
| PUT | `/catalog/outlets/{id}` | Update outlet | partial fields |
| POST | `/catalog/categories` | Buat kategori | `{ outlet_id, name, sort_order }` |
| POST | `/catalog/products` | Buat produk | `{ outlet_id, category_id, name, base_price, image_url, is_available }` |
| POST | `/catalog/products/{id}/variants` | Tambah varian (ukuran) | `{ name, sku, price_adjustment, stock_quantity }` |
| POST | `/catalog/products/{id}/options` | Tambah opsi (susu, gula) | `{ name, option_type, min_select, max_select, is_required }` |
| POST | `/catalog/options/{id}/values` | Tambah nilai opsi | `{ value, price_adjustment, stock_code }` |

### 2.3 Order Service
| Method | Path | Deskripsi | Payload Ringkas |
|--------|------|-----------|-----------------|
| GET | `/orders/cart` | Lihat keranjang (customer/session) | Header: `X-Guest-Id` (optional, uuid) |
| POST | `/orders/cart/items` | Tambah item ke keranjang | `{ product_id, variant_id?, selected_options[], quantity }` + Header `X-Guest-Id` |
| PUT | `/orders/cart/items/{id}` | Update qty/hapus item | `{ quantity }` + Header `X-Guest-Id` |
| DELETE | `/orders/cart/items/{id}` | Hapus item | Header `X-Guest-Id` |
| POST | `/orders/cart/voucher` | Terapkan voucher/poin | `{ voucher_code?, points_to_redeem? }` + Header `X-Guest-Id` |
| POST | `/orders/checkout` | Checkout → create order `PENDING` | `{ fulfillment_type, pickup_time?, table_number?, note?, addresses? }` + Header `X-Guest-Id` (guest) |
| POST | `/orders/{id}/reorder` | **Reorder 1-klik** — ambil order history, kembalikan CartDTO pre-filled (semua item + varian + opsi + qty) | Response: `{ items: CartItemDTO[] }` — FE langsung push ke localStorage/Redis cart |
| POST | `/orders/cart/merge` | **Merge guest cart → member** (eksplisit, jika tidak pakai header di auth) | `{ guest_id }` (auth required) |
| POST | `/orders/{id}/cancel` | **Customer cancel order** (member JWT atau guest via `tracking_token`) | `{ reason }` — hanya boleh saat status `PENDING` atau `PAID`; setelah `CONFIRMED` hanya staff |
| GET | `/orders` | Riwayat pesanan customer | query: `?status=&page=&limit=` (auth required) |
| GET | `/orders/{id}` | Detail pesanan + items + status log | (auth required) |
| GET | `/orders/{id}/tracking` | Status real-time untuk customer | (auth required) |
| GET | `/orders/track/{token}` | **Guest tracking** — status + estimated_ready_time (public, no JWT) | `token` = `tracking_token` dari response checkout |
| **Staff/Admin (via outlet_id scope):** |
| GET | `/orders/queue` | Antrian pesanan outlet (real-time) | query: `?status=paid,confirmed` |
| PUT | `/orders/{id}/status` | Update status (CONFIRMED, BEING_PREPARED, READY, COMPLETED, CANCELLED) | `{ status, note? }` |
| POST | `/orders/{id}/print-ticket` | Cetak kitchen ticket | — |

**Guest Cart Contract (F-003):**
- Client generate `guestId` (UUID v4) saat pertama kali buka app; simpan di `localStorage`.
- Semua request cart (GET/POST/PUT/DELETE `/orders/cart*`) wajib kirim header `X-Guest-Id: <guestId>`.
- Redis key: `cart:guest:{guestId}` (TTL 7 hari). Redis = **source of truth** saat checkout.
- `localStorage` = mirror untuk instant read / offline; sinkron ke Redis via background sync.
- **Merge guest → member (F-006 support):**
  - Otomatis dijalankan saat `POST /auth/login` atau `POST /auth/register` **jika request membawa header `X-Guest-Id`**.
  - Backend merge idempotent `cart:guest:{guestId}` → `carts` (member). Dedup key: fingerprint line item = `(product_id, variant_id, sorted(selected_options))`. Quantity dijumlahkan; harga & diskon dihitung ulang pakai harga terkini.
  - Response login/register tambahkan field `cart_merged: true` + `cart_item_count` agar FE tahu perlu refresh cart UI.
  - Alternatif eksplisit: `POST /orders/cart/merge` `{ guest_id }` (dipanggil FE setelah login kalau tidak pakai header di auth).
- Response `POST /orders/checkout` (guest) mengembalikan: `{ order_id, payment_initiate_url, tracking_token }`. `tracking_token` = opaque 32-byte URL-safe string untuk `GET /orders/track/{token}`.

**Realtime Order Status (F-005 / AC-09):**
- **Primary: Server-Sent Events (SSE)** — endpoint `GET /orders/{id}/events` (member, JWT) dan `GET /orders/track/{token}/events` (guest, public).
  - Event stream: `event: status_change` → `data: { status, estimated_ready_time, timestamp }`.
  - Heartbeat: `event: ping` tiap 15s; client reconnect otomatis jika putus > 30s.
  - Connection limit: 1 SSE per `order_id` per client (browser tab).
- **Fallback: Short Polling** — `GET /orders/{id}/tracking` / `GET /orders/track/{token}` interval **3 detik** (configurable via `/config` → `tracking_poll_interval_ms`, default 3000).
- **Staff Dashboard (Order Queue):** WebSocket `wss://api/orders/queue/ws?outlet_id={outlet_id}` (JWT staff) — broadcast real-time untuk antrian baru & status update.
- Target latency: status change → client receive **< 5 detik** (p95).

### 2.4 Payment Service
| Method | Path | Deskripsi | Payload Ringkas |
|--------|------|-----------|-----------------|
| POST | `/payments/initiate` | Buat transaksi di gateway | `{ order_id, payment_method, callback_url }` |
| GET | `/payments/{id}` | Detail pembayaran | — |
| POST | `/payments/webhook/midtrans` | Webhook Midtrans (server-to-server) | Raw notification JSON |
| POST | `/payments/webhook/xendit` | Webhook Xendit | Raw notification JSON |
| POST | `/payments/{id}/refund` | Refund (admin/owner) | `{ amount?, reason }` |
| GET | `/payments/reconcile` | Laporan rekon harian (finance) | query: `?date=&outlet_id=` |

**MVP Scope (Payment Methods):** `qris, gopay, ovo, dana, linkaja, shopeepay, virtual_account, credit_card` (tanpa tokenisasi), `apple_pay, google_pay`. **Saved payment method / card tokenisasi → Phase 2**.

### 2.5 Inventory Service
| Method | Path | Deskripsi | Payload Ringkas |
|--------|------|-----------|-----------------|
| GET | `/inventory/items` | Daftar bahan baku per outlet | query: `?outlet_id=&low_stock=` |
| GET | `/inventory/items/{id}` | Detail stok + riwayat | — |
| POST | `/inventory/items` | Tambah bahan baku (manager) | `{ outlet_id, name, unit, reorder_point, unit_cost, supplier_id }` |
| PUT | `/inventory/items/{id}/adjust` | Adjustment manual (in/out/adjustment/waste) | `{ type, quantity, note }` |
| GET | `/inventory/bom/{product_id}` | Lihat BOM produk | — |
| POST | `/inventory/bom` | Set BOM (manager) | `{ product_id, inventory_item_id, quantity_used }` |
| GET | `/inventory/suppliers` | Daftar supplier | — |
| POST | `/inventory/suppliers` | Tambah supplier | `{ name, contact, email, phone, address }` |
| GET | `/inventory/alerts` | Low-stock alerts | — |

### 2.6 Loyalty Service
| Method | Path | Deskripsi | Payload Ringkas |
|--------|------|-----------|-----------------|
| GET | `/loyalty/profile` | Poin, tier, benefit customer | — |
| GET | `/loyalty/tiers` | Daftar tier & benefit | — |
| POST | `/loyalty/redeem` | Tukar poin jadi voucher/diskon | `{ points, reward_type }` |
| GET | `/loyalty/history` | Riwayat earn/redeem | query: `?page=&limit=` |
| **Admin/Owner:** |
| POST | `/loyalty/tiers` | Buat/update tier | `{ name, min_points, discount_pct, benefits }` |
| POST | `/loyalty/vouchers` | Buat voucher promo | `{ code, discount_type, discount_value, min_purchase, max_discount, usage_limit, start_date, end_date }` |
| PUT | `/loyalty/vouchers/{id}` | Aktifkan/nonaktifkan voucher | `{ is_active }` |

### 2.7 Reporting Service
| Method | Path | Deskripsi | Payload Ringkas |
|--------|------|-----------|-----------------|
| GET | `/reports/daily` | Laporan harian per outlet | query: `?outlet_id=&date=` |
| GET | `/reports/monthly` | Laporan bulanan per outlet | query: `?outlet_id=&month=&year=` |
| GET | `/reports/financial` | P&L lengkap (revenue, COGS, gross/net profit) | query: `?outlet_id=&month=&year=` |
| GET | `/reports/top-products` | Produk terlaris | query: `?outlet_id=&period=7d/30d` |
| GET | `/reports/export/accounting` | Export jurnal/buku besar (Xero/QuickBooks/Jurnal) | query: `?outlet_id=&month=&year=&format=xlsx/csv` |
| GET | `/reports/export/tax` | Laporan PPN untuk SPT | query: `?outlet_id=&month=&year=` |

### 2.8 Notification Service (Internal/Async)
| Method | Path | Deskripsi | Payload Ringkas |
|--------|------|-----------|-----------------|
| POST | `/notifications/send` | Kirim notifikasi (dipanggil via queue) | `{ user_id, channel: push|whatsapp|sms|email, template_id, data }` |
| POST | `/notifications/broadcast` | Broadcast promo (owner) | `{ segment, title, body, data }` |
| GET | `/notifications/preferences` | Preferensi notifikasi customer | — |
| PUT | `/notifications/preferences` | Update preferensi | `{ push_enabled, whatsapp_enabled, sms_enabled, email_enabled }` |

### 2.9 Admin Service
| Method | Path | Deskripsi | Payload Ringkas |
|--------|------|-----------|-----------------|
| GET | `/config` | **Public config** — subset untuk client (tanpa auth) | Response: `{ tax_rate, point_value, currency, active_payment_methods[], shipping_flat_fee }` |
| GET | `/admin/users` | Daftar user + role | query: `?role=&outlet_id=` |
| POST | `/admin/users` | Invite staff baru (owner) | `{ email, phone, full_name, role, outlet_id }` |
| PUT | `/admin/users/{id}/role` | Ganti role | `{ role }` |
| DELETE | `/admin/users/{id}` | Nonaktifkan user | — |
| GET | `/admin/audit-logs` | Audit trail semua perubahan | query: `?entity=&entity_id=&user_id=&from=&to=` |
| GET | `/admin/settings` | Konfigurasi sistem penuh (Owner only) | — |
| PUT | `/admin/settings` | Update konfigurasi (Owner only) | `{ key, value }` |

---

## 3. Ringkasan Schema Database & Relasi Kunci

> **Sumber:** `database-design.md` + `diagrams/entity-relationship-diagram.md`  
> Semua PK = `UUID` (gen_random_uuid). FK didefinisikan eksplisit. Enum tipe: `order_status`, `fulfillment_type`, `payment_method`, `payment_status`, `discount_type`, `inventory_log_type`.

### 3.1 Core Entities & Relasi (Ringkas)

```
users (1) ─────< (0..1) customers
customers (1) ────< (0..*) orders
customers (1) ────< (0..*) addresses
customers (1) ────< (0..*) loyalty_points
customers (0..1) ─< (0..1) loyalty_tiers
outlets (1) ──────< (0..*) products
outlets (1) ──────< (0..*) orders
outlets (1) ──────< (0..*) inventory_items
outlets (1) ──────< (0..*) daily_sales
outlets (1) ──────< (0..*) monthly_reports
categories (1) ───< (0..*) products
products (1) ─────< (0..*) product_variants
products (1) ─────< (0..*) product_options
product_options (1) < (0..*) option_values
products (1) ─────< (0..*) product_bom
inventory_items (1) > (0..*) product_bom
orders (1) ───────< (0..*) order_items
order_items (1) ──< (0..*) order_item_options
order_items (1) ──> (0..1) product_variants
orders (1) ───────> (0..1) payments
orders (1) ───────< (0..*) order_status_logs
orders (0..1) ────> (0..1) vouchers
```

### 3.2 Tabel Agregat untuk Performa Laporan
- `daily_sales` — unique `(outlet_id, date)` | diisi via cron 00:01 + trigger `order completed`
- `monthly_reports` — unique `(outlet_id, year, month)` | diisi via cron tanggal 1

### 3.3 Indeks Kritis (sudah terdaftar di `database-design.md`)
`idx_orders_outlet_created`, `idx_orders_status`, `idx_payments_transaction_id`, `idx_inventory_logs_item_created`, `idx_daily_sales_outlet_date`, `idx_monthly_reports_outlet_ym`

---

## 4. Alur End-to-End: Order → Payment → Webhook → Notification → Inventory → Reporting

```mermaid
flowchart TD
    A[Customer Checkout] --> B[Order Service: CREATE order PENDING]
    B --> C[Payment Service: INITIATE ke Midtrans/Xendit]
    C --> D[Customer bayar di gateway]
    D --> E[Gateway POST webhook /payments/webhook/*]
    E --> F{Payment Success?}
    F -->|Ya| G[Payment Service: UPDATE payment SUCCESS]
    G --> H[Order Service: UPDATE order PAID]
    H --> I[Message Queue: order.paid event]
    I --> J[Notification Service: PUSH/WA/SMS ke Customer]
    I --> K[Notification Service: PUSH ke Staff/Kasir]
    I --> L[Loyalty Service: GRANT points async]
    K --> M[Staff konfirmasi → CONFIRMED]
    M --> N[Staff siapkan → BEING_PREPARED → READY]
    N --> O[Staff/Complete → COMPLETED]
    O --> P[Trigger DB: deduct_inventory_on_order_complete()]
    P --> Q[Inventory Logs: OUT via BOM × qty]
    Q --> R[Cek reorder_point → alert kalau low]
    O --> S[Daily Sales Aggregate (cron 00:01)]
    S --> T[Monthly Report Aggregate (cron 1st)]
    T --> U[Export ke Accounting System (Xero/QuickBooks/Jurnal)]
```

**Catatan Teknis:**
- Semua step async setelah `PAID` diproses via **Message Queue (BullMQ/Redis)** agar tidak blocking request HTTP.
- `deduct_inventory_on_order_complete()` adalah **PostgreSQL AFTER UPDATE trigger** (lihat `database-design.md` baris 548-583) — atomic, tidak butuh service call terpisah.
- Idempotency key: `payment.transaction_id` + `order.id` untuk mencegah double-charge.

---

## 5. Auth & RBAC per Role

| Role | Scope Akses | Service/Endpoint yang Diizinkan |
|------|-------------|--------------------------------|
| **Guest** (unauth) | Public catalog, guest checkout | Catalog GET, Order POST cart/checkout (tanpa loyalty) |
| **Member** (customer login) | Semua fitur customer + loyalty | Auth, Catalog, Order (full), Payment, Loyalty, Notification preferences |
| **Kasir** | Outlet-specific order queue | Order queue GET, PUT status (CONFIRMED→READY), print ticket |
| **Barista** | Kitchen view only | Order queue GET (filter BEING_PREPARED), update to READY |
| **Manager** | Outlet ops: menu, stok, voucher, laporan harian | Catalog CRUD (outlet-scoped), Inventory CRUD, Loyalty vouchers, Reports daily |
| **Finance/Admin** | Keuangan, pajak, export akuntansi | Payment reconcile, Reports financial/export, Monthly reports |
| **Owner** | Full access multi-outlet + user management | Semua endpoint + Admin service (users, roles, outlet, settings) |

**Implementasi RBAC:**
- JWT payload: `{ sub: user_id, role, outlet_id? }`
- API Gateway / Middleware validasi `outlet_id` scope untuk Manager/Kasir/Barista.
- Owner & Finance/Admin: `outlet_id = null` (akses semua).

---

## 6. Integrasi Eksternal

| Integrasi | Provider | Pola | Detail Teknis |
|-----------|----------|------|---------------|
| **Payment Gateway** | **Midtrans** (primary), **Xendit** (fallback) | Server-to-server webhook | `POST /payments/webhook/midtrans` & `/xendit` — verifikasi signature, idempotency by `transaction_id`, update `payments` + trigger `order.paid` event |
| **Push Notification** | **Firebase Cloud Messaging (FCM)** / **OneSignal** | Async via queue | Template: `order_paid`, `order_ready`, `order_completed`, `loyalty_tier_up`, `promo_broadcast` |
| **WhatsApp** | **Twilio WhatsApp API** / **WhatsApp Business API** | Async via queue | Template approved by Meta; fallback ke SMS jika WA gagal |
| **SMS** | **Twilio** / **Nexmo** | Async via queue | OTP login, payment failed alert |
| **Email** | **SendGrid** / **Resend** | Async via queue | Invoice, laporan bulanan, reset password |
| **Accounting** | **Xero** / **QuickBooks Online** / **Jurnal.id** | Scheduled export (cron 1st bulan) | `GET /reports/export/accounting` → generate CSV/XLSX → push ke API partner OAuth2 |
| **Maps/Geolocation** | **Google Maps Places API** / **Mapbox** | Client-side (autocomplete alamat) | Backend hanya simpan `latitude, longitude` di `addresses` |

**Resilience:**
- Payment: dual gateway, auto-failover kalau salah satu down > 5% error rate (circuit breaker).
- Notification: retry 3x exponential backoff (1m, 5m, 15m) → dead-letter queue untuk manual review.

---

## 7. Non-Functional Requirements

| Kategori | Requirement | Target / Implementasi |
|----------|-------------|----------------------|
| **Performance** | API latency (p95) | < 200 ms untuk Catalog GET (Redis cache), < 500 ms untuk Order POST |
| | Throughput | 1.000 req/s burst (promo), horizontal scale Order/Payment service |
| | DB query | Semua lookup by PK/FK < 10 ms; agregat laporan pakai materialized view `daily_sales` |
| **Keamanan** | Transport | TLS 1.3 everywhere (CDN → LB → Service) |
| | Auth | JWT RS256, access 15m, refresh 7d, rotation + revoke list di Redis |
| | RBAC | Middleware per-request, outlet-scoped untuk staff |
| | Data at rest | PostgreSQL `pgcrypto` / cloud-managed encryption (AWS RDS / Supabase) |
| | Input validation | Zod/JSON Schema di API Gateway + service layer; parameterized query only |
| | Rate limiting | API Gateway: 100 req/min/IP (auth), 30 req/min/IP (payment) |
| | Secrets | Vault / AWS Secrets Manager / Doppler — **tidak** di repo/env file |
| **Skalabilitas** | Read Replica | 2x read replica untuk Reporting & Catalog heavy query |
| | Cache | Redis Cluster: session, cart, menu cache (TTL 5 menit), rate limit counters |
| | Queue | BullMQ (Redis) — worker terpisah per service (payment, notif, loyalty, reporting) |
| | Horizontal Pod Autoscaler | CPU > 70% / custom metric `queue_depth` |
| **Observability** | Logging | Structured JSON (pino/winston) → Loki/ELK; correlation-id header `x-request-id` |
| | Metrics | Prometheus + Grafana: latency, error rate, queue depth, DB pool |
| | Tracing | OpenTelemetry → Jaeger/Tempo (distributed trace order→payment→inventory) |
| | Alerting | PagerDuty/Telegram: error rate > 1%, p95 latency > 1s, queue lag > 1000, disk > 80% |
| **Reliability** | SLA | 99.5% uptime (exclude scheduled maintenance 02:00-04:00 WIB) |
| | Backup | Point-in-time recovery (PITR) 7 hari; daily snapshot cross-region |
| | Disaster Recovery | RPO < 5 menit, RTO < 30 menit (multi-AZ deployment) |

---

## 8. Acceptance Criteria Teknis per Fitur MVP

> **Referensi fitur:** `prd-planning-coffeeshop.md` — F-001, F-002, F-003, F-004, F-005, F-009, F-011, F-014

| Fiturs | ID | Kriteria Teknis (Backend) | Verifikasi |
|--------|----|---------------------------|------------|
| **Menu Digital & Pencarian** | F-001 | `GET /catalog/products?outlet_id=&q=&category_id=` → response < 1s untuk katalog ≤ 500 item; Redis cache `menu:{outlet_id}` TTL 5m; full-text search pakai `pg_trgm` index | Load test 500 produk, 100 concurrent search → p95 < 1s |
| **Kustomisasi Pesanan** | F-002 | `POST /orders/cart/items` menghitung `unit_price` real-time: `base_price + variant_adj + Σ option_adj`; validasi `min/max_select`, required, stok varian; response include `unit_price`, `subtotal` | Unit test 50 kombinasi varian+opsi → harga akurat |
| **Keranjang & Checkout** | F-003 | Guest cart: Redis `cart:guest:{guestId}` (TTL 7d) + header `X-Guest-Id`; localStorage mirror; checkout atomic (orders + items + options in 1 TX); response include `tracking_token` untuk guest. Login merge idempotent: dedup by `(product_id, variant_id, sorted(selected_options))`, qty dijumlahkan, harga hitung ulang. | E2E test: guest cart → checkout → payment success → order PAID + tracking_token valid; login → cart merged tanpa duplikat |
| **Pembayaran Online** | F-004 | `POST /payments/initiate` support: `qris, gopay, ovo, dana, linkaja, shopeepay, virtual_account, credit_card` (tanpa tokenisasi), `apple_pay, google_pay`; webhook idempotent via `transaction_id`; payment success < 10s end-to-end; auto-retry webhook 3x. **Saved payment method / card tokenisasi → Phase 2** | Sandbox Midtrans/Xendit: 100 transaksi sukses, 0 duplicate |
| **Pelacakan Pesanan** | F-005 | Member: `GET /orders/{id}/tracking` (JWT) → status + `estimated_ready_time`; Guest: `GET /orders/track/{token}` (public) → same payload; SSE `GET /orders/{id}/events` + polling fallback 3s; WebSocket staff queue; status change → client < 5s (p95) | Simulasi staff update status → member SSE < 5s, guest polling < 5s |
| **Reorder 1-Klik** | F-006 | `POST /orders/{id}/reorder` (auth) → `{ items: CartItemDTO[] }` lengkap (varian, opsi, qty, harga terkini); FE push ke cart localStorage/Redis dalam 1 request; validasi stok & produk aktif sebelum response | E2E: member klik "Order Again" → cart terisi lengkap < 2s; item tidak aktif distrip (flag `unavailable: true`) |
| **Customer Cancel Order** | F-003/F-005 | `POST /orders/{id}/cancel` `{ reason }` — member JWT atau guest `tracking_token`; validasi state machine: hanya `PENDING`/`PAID`; response order `CANCELLED` + refund trigger otomatis kalau sudah bayar; audit log `order_status_logs` | E2E: member cancel PAID → refund queued; guest cancel via token → CANCELLED; staff cancel CONFIRMED+ tetap bisa |
| **Address Book CRUD** | F-003 (Delivery) | `GET/POST/PUT/DELETE /auth/me/addresses` — field wajib: `label, recipient_name, phone, address_line, city, postal_code`; opsional: `latitude, longitude, is_default`; `is_default=true` → set false pada alamat lain; checkout delivery wajib pilih alamat dari address book atau input baru (disimpan otomatis) | E2E: member kelola alamat; checkout delivery pilih alamat → order simpan address snapshot; guest checkout delivery input alamat → response include address_id |
| **Manajemen Menu** | F-009 | Manager CRUD outlet-scoped; `PUT /catalog/products/{id}` → invalidasi Redis cache `menu:{outlet_id}`; perubahan terefleksi di customer app < 1 menit (cache TTL + pub/sub invalidation) | Update harga → cek GET catalog dalam 30s → harga baru |
| **Manajemen Pesanan (Staff)** | F-011 | `GET /orders/queue?status=paid,confirmed` real-time via Redis pub/sub; Kitchen ticket PDF generate < 2s; Status transition validasi state machine (lihat process-flow) | Load test 50 pesanan simultan → queue update < 3s |
| **Laporan Penjualan Harian** | F-014 | Cron 00:01 WIB → `aggregate_daily_sales()` upsert `daily_sales`; API `GET /reports/daily?date=2026-10-08` response < 200ms; Data akurat vs `orders` raw query | Compare `daily_sales` vs manual SUM(orders) → 0 selisih |

---

## 9. Deployment & Operasional (Ringkas)

| Item | Detail |
|------|--------|
| **Container** | Docker multi-stage (builder → runtime distroless), image scan (Trivy) |
| **Orchestration** | Kubernetes (EKS/GKE/AKS) atau Docker Swarm untuk MVP |
| **CI/CD** | GitHub Actions: lint → test → build → deploy staging → manual promote prod |
| **Database Migration** | Golang-migrate / Flyway / Prisma migrate — versioned, run di initContainer |
| **Feature Flags** | LaunchDarkly / Unleash untuk rollout gradual (payment gateway, loyalty) |
| **Secrets** | External Secrets Operator → AWS Secrets Manager / Vault |

---

## 10. Lampiran: Mapping Fitur PRD → Service & Endpoint

| Fitur PRD | Service Utama | Endpoint Kunci |
|-----------|---------------|----------------|
| F-001 Menu Digital | Catalog | `GET /catalog/products`, `GET /catalog/categories` |
| F-002 Kustomisasi | Catalog + Order | `GET /catalog/products/{id}`, `POST /orders/cart/items` |
| F-003 Keranjang & Checkout | Order | `GET/POST/PUT/DELETE /orders/cart*` (header `X-Guest-Id`), `POST /orders/checkout` → `{ order_id, payment_initiate_url, tracking_token }`, `POST /orders/{id}/cancel` |
| F-004 Pembayaran | Payment | `POST /payments/initiate`, `POST /payments/webhook/*` |
| F-005 Pelacakan | Order + Notification | Member: `GET /orders/{id}/tracking` (JWT); Guest: `GET /orders/track/{token}` (public); SSE `/orders/{id}/events` |
| F-006 Reorder 1-Klik | Order | `POST /orders/{id}/reorder` → `{ items: CartItemDTO[] }` |
| — Address Book | Auth | `GET/POST/PUT/DELETE /auth/me/addresses` |
| F-009 Manajemen Menu | Catalog (Admin) | `POST/PUT/DELETE /catalog/*` (role: Manager/Owner) |
| F-011 Manajemen Pesanan | Order (Staff) | `GET /orders/queue`, `PUT /orders/{id}/status`, `POST /orders/{id}/print-ticket` |
| F-014 Laporan Harian | Reporting | Cron `aggregate_daily_sales()`, `GET /reports/daily` |
| — Config Publik | Admin | `GET /config` (public, no auth) |

---

## 11. Catatan & Keputusan Arsitektur (ADR Singkat)

| ADR | Keputusan | Alasan |
|-----|-----------|--------|
| **ADR-001** | Monorepo multi-service (Nx/Turborepo) | Shared types (TS), atomic commit, mudah refactor cross-service |
| **ADR-002** | PostgreSQL single-instance + read replica (bukan microservice DB per service) | Transaksi ACID lintas order-payment-inventory; laporan JOIN mudah; operational overhead rendah untuk MVP |
| **ADR-003** | Redis untuk cache + BullMQ queue (bukan Kafka) | Simpler ops, cukup untuk < 10k msg/s; Redis sudah dipakai cache/session |
| **ADR-004** | Trigger DB untuk inventory deduction (bukan service call) | Atomic, tidak bisa gagal di tengah transaksi, tidak butuh saga/orchestration |
| **ADR-005** | JWT stateless + Redis blocklist untuk logout/revoke | Horizontal scale tanpa sticky session; refresh token rotation mitigate token theft |
| **ADR-006** | Guest cart hybrid: Redis `cart:guest:{guestId}` (source of truth) + localStorage mirror; header `X-Guest-Id` | Offline-first UX, instant read; Redis TTL 7d; merge idempotent saat login by fingerprint line item |
| **ADR-007** | Public config endpoint `GET /config` (subset) | Client butuh tax_rate, point_value, payment methods, shipping_flat_fee tanpa auth; `/admin/settings` tetap Owner-only untuk write |
| **ADR-008** | Guest tracking token `tracking_token` + `GET /orders/track/{token}` (public) | Tanpa OTP (Phase 2); opaque URL-safe 32-byte; sama payload dengan member tracking |
| **ADR-009** | Realtime order status: SSE primary (`/orders/{id}/events`, `/orders/track/{token}/events`) + polling fallback 3s (configurable via `/config`); WebSocket untuk staff queue | SSE lebih ringan dari WS untuk client read-only; polling sebagai fallback universal; staff dashboard butuh broadcast dua arah → WS |
| **ADR-010** | Reorder 1-klik: `POST /orders/{id}/reorder` → `CartItemDTO[]` (bukan create order langsung) | FE butuh kontrol (edit qty, hapus item) sebelum checkout; validasi stok/produk aktif di backend; response < 2s |
| **ADR-011** | Guest→member cart merge: otomatis di `POST /auth/login|register` (header `X-Guest-Id`) + eksplisit `POST /orders/cart/merge` | Zero-friction UX: merge otomatis kalau FE kirim header; fallback eksplisit kalau auth flow terpisah |
| **ADR-012** | Customer cancel order: `POST /orders/{id}/cancel` (member JWT / guest `tracking_token`) — state machine validation `PENDING`/`PAID` only; auto-refund trigger | UX expectation: bisa cancel sebelum dikonfirmasi dapur; guest cancel via token tanpa login; refund async via queue |
| **ADR-013** | Address book CRUD: `GET/POST/PUT/DELETE /auth/me/addresses` — mandatory untuk Delivery MVP; checkout delivery wajib pilih/isi alamat | Delivery = MVP per PO; `shipping_flat_fee` dari `/config` + address snapshot di order; guest checkout delivery simpan alamat otomatis |

---

**File ini disimpan di:** `./AppData/Local/hermes/profiles/kantal/coffeeshop-plan/PRD-BACKEND.md`

---  
*Generated by Backend Engineer Agent — v1.3 PO-signed, ready for dev-team handoff.*