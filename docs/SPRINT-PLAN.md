# 🗓️ Rencana Sprint MVP — CoffeeShop Online

> Durasi sprint: **2 minggu**. Total MVP: **4 sprint (~8 minggu)**.
> Mengacu pada PRD-BACKEND v1.3, PRD-FRONTEND v1.3, dan PRD-QA v1.3.

## Ringkasan

| Sprint | Tema | Fitur MVP | Status |
|--------|------|-----------|--------|
| **Sprint 1** | Fondasi & Katalog | F-001, F-002 | 🔄 In progress |
| **Sprint 2** | Cart, Checkout & Pembayaran | F-003, F-004 | ⏳ Planned |
| **Sprint 3** | Tracking, Loyalty & Admin Menu | F-005, F-009, F-006 | ⏳ Planned |
| **Sprint 4** | Order Management & Reporting | F-011, F-014 | ⏳ Planned |

---

## Sprint 1 — Fondasi & Katalog (Minggu 1–2)

**Tujuan:** fondasi teknis + pengguna bisa melihat & mengkustomisasi menu.

### Backend
- [ ] Auth service: register/login/refresh, JWT RS256, RBAC dasar
- [ ] Catalog service: kategori, produk, varian, opsi
- [ ] Cache menu Redis (`menu:{outlet_id}` TTL 5m)
- [ ] Migrasi Prisma ke Supabase + seed data
- [ ] CI hijau (lint → test → build)

### Frontend
- [ ] Shell Customer + routing
- [ ] Halaman Home & Menu (katalog + pencarian)
- [ ] PDP + kustomisasi (varian/opsi, harga real-time)
- [ ] Design system: token + primitives dasar

### QA
- [ ] TC-F001-01…-10 (katalog & pencarian)
- [ ] TC-F002-01…-08 (kustomisasi & harga)

**Definition of Done:** pengguna bisa buka menu, pilih produk, kustomisasi, lihat harga real-time; CI hijau.

---

## Sprint 2 — Cart, Checkout & Pembayaran (Minggu 3–4)

**Tujuan:** alur pemesanan end-to-end dengan pembayaran QRIS.

### Backend
- [ ] Cart service: guest hybrid (Redis + `X-Guest-Id`, ADR-006)
- [ ] Checkout atomic + `tracking_token` (ADR-008)
- [ ] Payment service: Midtrans/Xendit, webhook idempotent
- [ ] Merge guest→member (ADR-011)
- [ ] `GET /config` publik (ADR-007)

### Frontend
- [ ] Cart (Zustand + persist, optimistic)
- [ ] Checkout ≤ 5 langkah + `GET /config` pricing
- [ ] Halaman pembayaran + status
- [ ] Merge cart saat login

### QA
- [ ] TC-F003-01…-25 (cart, merge, voucher)
- [ ] TC-F004-01…-14 (pembayaran, idempotency, dual gateway)

**Definition of Done:** guest/member bisa checkout & bayar; order `PAID`; webhook idempotent.

---

## Sprint 3 — Tracking, Loyalty & Admin Menu (Minggu 5–6)

**Tujuan:** pelacakan real-time, reorder, dan manajemen menu oleh staff.

### Backend
- [ ] SSE `/orders/{id}/events` + `/track/{token}/events` (ADR-009)
- [ ] Fallback polling 3s
- [ ] Reorder 1-klik (ADR-010)
- [ ] Loyalty: poin & voucher
- [ ] Admin: CRUD menu outlet-scoped + invalidasi cache

### Frontend
- [ ] Halaman tracking (SSE + fallback)
- [ ] Riwayat + reorder 1-klik
- [ ] Profil & loyalty
- [ ] Admin: manajemen menu

### QA
- [ ] TC-F005-01…-16 + TC-F006-01…-08
- [ ] TC-REALTIME-INFRA-01…-06 (SSE ops)

**Definition of Done:** status order update < 5s via SSE; reorder 1-klik; staff kelola menu.

---

## Sprint 4 — Order Management & Reporting (Minggu 7–8)

**Tujuan:** operasional staff + otomatisasi laporan (tujuan bisnis utama).

### Backend
- [ ] Order queue staff + WebSocket `wss://.../queue/ws`
- [ ] State machine status + audit log
- [ ] Inventory trigger deduction
- [ ] Reporting: laporan harian/bulanan otomatis (cron)
- [ ] Export akuntansi (Xero/QuickBooks/Jurnal)

### Frontend
- [ ] Admin: order queue real-time
- [ ] Admin: dashboard & laporan
- [ ] Admin: manajemen pesanan

### QA
- [ ] TC-F011-01…-12 (order management)
- [ ] TC-F014-01…-10 (reporting)
- [ ] E2E: happy path lengkap
- [ ] Gate rilis MVP

**Definition of Done:** semua 8 fitur MVP berfungsi; gate rilis MVP terpenuhi; siap produksi.

---

## Gate Rilis MVP

Lihat [`PRD-QA.md`](./PRD-QA.md) §6.3. Ringkas:
- [ ] 8 fitur MVP lulus AC (AC-1…AC-12)
- [ ] Semua test blocker/high lulus
- [ ] Performance: checkout < 90s, payment < 10s, status update < 5s
- [ ] SSE operasional: idle > 120s, over-limit 503, rolling deploy aman
- [ ] Security: RBAC, anti-IDOR, webhook signature
- [ ] Coverage ≥ 80% modul kritis
