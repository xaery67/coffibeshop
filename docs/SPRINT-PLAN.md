# 🗓️ Sprint Planning MVP — CoffeeShop Online

> **Versi:** v1.0 · **Tanggal:** 2026-10-11 · **Pemilik:** Product Owner (@kantal)
> **Durasi sprint:** 2 minggu · **Total MVP:** 4 sprint (~8 minggu)
> **Sumber:** PRD-BACKEND v1.3 · PRD-FRONTEND v1.3 · PRD-FRONTEND-UX · PRD-QA v1.3 · PRD-BACKEND-DEVOPS v1.1

---

## 0. Ringkasan Eksekutif

MVP mencakup **12 baris fitur** (F-001, F-002, F-003, F-003b, F-004, F-005, F-005b, F-005c, F-006, F-009, F-011, F-014)
yang dikelompokkan ke **4 sprint**. Setiap sprint menghasilkan increment yang bisa didemokan
(*vertical slice*: backend + frontend + test dalam satu sprint).

| Sprint | Tema | Fitur MVP | Issue GitHub | Status |
|--------|------|-----------|--------------|--------|
| **Sprint 1** | Fondasi & Katalog | F-001, F-002 | #2, #3, #4, #10 | 🔄 Siap mulai |
| **Sprint 2** | Cart, Checkout & Pembayaran | F-003, F-003b, F-004 | #6, #7, #11 | ⏳ Planned |
| **Sprint 3** | Tracking, Reorder & Loyalty | F-005, F-005b, F-005c, F-006, F-009 | #8, #12 | ⏳ Planned |
| **Sprint 4** | Order Management & Reporting | F-011, F-014 | #9, #13 | ⏳ Planned |

**Definition of Done (global):** fitur lulus AC-nya, test case terkait hijau, CI hijau
(lint → test → build → docker), tidak ada bug blocker, ter-dokumentasi, ter-merge ke `main`.

---

## 1. Asumsi & Kapasitas Tim

### 1.1 Kapasitas

| Peran | Alokasi/sprint | Fokus |
|-------|---------------|-------|
| Backend Engineer | 1 orang | 9 domain service (Node/TS) |
| Frontend Engineer | 1 orang | PWA Customer + Admin (React) |
| UI/UX Designer | 0,3 orang | Design system + review implementasi |
| QA Engineer | 0,5 orang | Test suite, gate rilis |
| DevOps Engineer | 0,3 orang | CI/CD, observability, infra |

**Kapasitas efektif:** ~8 *developer-day*/sprint/orang (2 minggu, buffer 20% untuk
ceremony, review, dan bug).

### 1.2 Velocity asumsi

- **Sprint 1:** 34 SP (fondasi lebih berat, banyak setup)
- **Sprint 2:** 42 SP (fitur paling kompleks: cart + payment)
- **Sprint 3:** 38 SP (realtime + loyalty)
- **Sprint 4:** 30 SP (admin + reporting, banyak reuse)

### 1.3 Definition of Ready (DoR)

Sebuah task boleh masuk sprint bila: (1) punya AC jelas, (2) desain/wireframe tersedia,
(3) kontrak API sudah disepakati (PRD-BACKEND), (4) test case sudah terdefinisi (PRD-QA).

---

## 2. Sprint 1 — Fondasi & Katalog (Minggu 1–2)

> **Sprint Goal:** *"Pengguna dapat membuka menu, mencari produk, dan mengkustomisasi
> pesanan dengan harga real-time — di atas fondasi teknis yang hijau CI."*

### 2.1 Backend (21 SP)

| # | Task | SP | Endpoint / Artefak | Issue |
|---|------|----|--------------------|-------|
| 1.1 | Auth service — register/login/refresh, JWT RS256, RBAC 7 role | 8 | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` | #3 |
| 1.2 | Catalog service — kategori, produk, varian, opsi | 8 | `GET /catalog/categories`, `/catalog/products`, `/catalog/products/{id}` | #4 |
| 1.3 | Cache menu Redis (`menu:{outlet_id}` TTL 5m) + invalidasi | 3 | — | #4 |
| 1.4 | Prisma schema lengkap + migrasi + seed (2 kategori, 4 produk) | 2 | `apps/api/prisma/**` | #2 |

**AC terkait:** AC-2 (kustomisasi harga real-time) — sebagian.
**TC:** TC-F001-01…-12, TC-F002-01…-12, TC-SEC-RBAC-*.

### 2.2 Frontend (13 SP)

| # | Task | SP | Artefak | Issue |
|---|------|----|---------|-------|
| 1.5 | App shell + routing + layout mobile-first | 3 | `App.tsx`, `routes/` | #10 |
| 1.6 | Halaman Home & Menu (katalog + pencarian + filter kategori) | 5 | `HomePage.tsx`, `MenuPage.tsx` | #10 |
| 1.7 | PDP + kustomisasi (varian/opsi, harga real-time via PricingEngine) | 3 | `ProductDetail` | #10 |
| 1.8 | Design system: token (Coffee Brown `#6F4E37`, Inter, spacing 4pt) + primitives | 2 | `styles/index.css`, `tailwind.config.js` | #10 |

**AC terkait:** AC-2. **TC:** TC-F002-* (sisi UI).

### 2.3 QA & DevOps (paralel)

| # | Task | SP | Artefak |
|---|------|----|---------|
| 1.9 | Setup Vitest (unit + integration) untuk api & web | 2 | `vitest.config.ts` |
| 1.10 | CI hijau: lint → test → build → docker + Trivy | 2 | `.github/workflows/ci.yml` ✅ |
| 1.11 | Smoke test dasar (`/health`, `/api/v1/config`) | 1 | `scripts/smoke-test.sh` ✅ |

### 2.4 Definition of Done Sprint 1

- [ ] Pengguna bisa buka menu, cari produk, kustomisasi, lihat harga real-time
- [ ] Auth register/login berfungsi; RBAC dasar menolak akses tak berizin
- [ ] Katalog ter-cache di Redis (p95 < 100ms)
- [ ] CI hijau untuk semua commit di `main`
- [ ] TC-F001 (12) & TC-F002 (12) lulus

---

## 3. Sprint 2 — Cart, Checkout & Pembayaran (Minggu 3–4)

> **Sprint Goal:** *"Guest maupun member dapat menyelesaikan pemesanan end-to-end dan
> membayar via QRIS/e-wallet — dengan cart yang bertahan lintas sesi."*

### 3.1 Backend (26 SP)

| # | Task | SP | Endpoint / Artefak | Issue |
|---|------|----|--------------------|-------|
| 2.1 | Cart service — guest hybrid (Redis + `X-Guest-Id`, ADR-006) | 8 | `POST/GET/PUT/DELETE /orders/cart/items`, `GET /orders/cart` | #6 |
| 2.2 | Checkout atomic + `tracking_token` (ADR-008) | 5 | `POST /orders/checkout` | #6 |
| 2.3 | Merge guest→member (ADR-011, dedup fingerprint) | 3 | header `X-Guest-Id` di `/auth/login`, `POST /orders/cart/merge` | #6 |
| 2.4 | `GET /config` publik (ADR-007) | 2 | `GET /config` | #6 |
| 2.5 | Payment service — Midtrans + Xendit, webhook idempotent | 8 | `POST /payments/initiate`, `POST /payments/webhook/{gateway}` | #7 |

**AC terkait:** AC-1, AC-3, AC-4, AC-8, AC-10.
**TC:** TC-F003-01…-33 (33), TC-F004-01…-17 (17), TC-ADDR-01…-11 (11).

### 3.2 Frontend (16 SP)

| # | Task | SP | Artefak | Issue |
|---|------|----|---------|-------|
| 2.6 | Cart (Zustand + persist, optimistic update) | 6 | `stores/cart.store.ts`, `CartPage.tsx` | #11 |
| 2.7 | Checkout ≤ 5 langkah + `GET /config` pricing | 5 | `CheckoutPage` | #11 |
| 2.8 | Halaman pembayaran + status (QRIS/e-wallet) | 3 | `PaymentPage` | #11 |
| 2.9 | Merge cart saat login + toast "N item digabungkan" | 2 | `auth` flow | #11 |

**AC terkait:** AC-1, AC-3, AC-4, AC-8. **TC:** TC-F003-*, TC-F004-* (sisi UI).

### 3.3 Definition of Done Sprint 2

- [ ] Guest/member bisa checkout & bayar; order berstatus `PAID`
- [ ] Cart bertahan saat app ditutup (Redis + localStorage hybrid)
- [ ] Webhook idempotent (2x kirim = 1 order update)
- [ ] Checkout ≤ 5 langkah; total = subtotal + tax + ongkir − diskon (server-side)
- [ ] TC-F003 (33) & TC-F004 (17) lulus

---

## 4. Sprint 3 — Tracking, Reorder & Loyalty (Minggu 5–6)

> **Sprint Goal:** *"Pelanggan memantau status pesanan secara real-time, mengulang
> pesanan 1-klik, dan mengumpulkan poin loyalty; staff mengelola menu."*

### 4.1 Backend (22 SP)

| # | Task | SP | Endpoint / Artefak | Issue |
|---|------|----|--------------------|-------|
| 3.1 | SSE `/orders/{id}/events` + `/orders/track/{token}/events` (ADR-009) | 6 | `sse.controller.ts` | #8 |
| 3.2 | Fallback polling 3s + rate limit 40 req/min/IP | 3 | `/config.tracking_poll_interval_ms` | #8 |
| 3.3 | Reorder 1-klik (ADR-010) | 3 | `POST /orders/{id}/reorder` | #8 |
| 3.4 | Customer cancel (ADR-012, state machine + refund async) | 3 | `POST /orders/{id}/cancel` | #8 |
| 3.5 | Address book CRUD (ADR-013, is_default exclusive) | 3 | `GET/POST/PUT/DELETE /auth/me/addresses` | #8 |
| 3.6 | Loyalty — poin, voucher, redeem | 4 | `GET /loyalty/points`, `/loyalty/vouchers`, `POST /loyalty/redeem` | #8 |

**AC terkait:** AC-5, AC-7, AC-9, AC-10, AC-11.
**TC:** TC-F005-01…-22 (22), TC-F006-01…-11 (11), TC-CANCEL-01…-11 (11), TC-ADDR-* (11), TC-REALTIME-INFRA-01…-09.

### 4.2 Frontend (14 SP)

| # | Task | SP | Artefak | Issue |
|---|------|----|---------|-------|
| 3.7 | Halaman tracking (SSE + fallback polling + `useOrderTracking`) | 6 | `TrackPage.tsx`, `hooks/useOrderTracking.ts` ✅ | #12 |
| 3.8 | Riwayat pesanan + reorder 1-klik | 4 | `OrderHistoryPage` | #12 |
| 3.9 | Profil & loyalty (poin, voucher) | 3 | `ProfilePage` | #12 |
| 3.10 | Admin: manajemen menu (CRUD outlet-scoped) | 4 | `AdminPage.tsx` | #13 |

**AC terkait:** AC-5, AC-7, AC-11, AC-12. **TC:** TC-F005-*, TC-F006-* (sisi UI).

### 4.3 Definition of Done Sprint 3

- [ ] Status order ter-update < 5s (p95) via SSE, fallback polling 3s
- [ ] SSE survive idle > 120s; over-limit → HTTP 503 (bukan crash)
- [ ] Reorder 1-klik memuat item dengan harga terkini
- [ ] Staff dapat CRUD menu outlet-scoped + invalidasi cache
- [ ] TC-F005 (22), TC-F006 (11), TC-REALTIME-INFRA (9) lulus

---

## 5. Sprint 4 — Order Management & Reporting (Minggu 7–8)

> **Sprint Goal:** *"Operasional staff berjalan real-time dan laporan administrasi
> (penjualan, stok, pajak) ter-generate otomatis — tujuan bisnis utama proyek."*

### 5.1 Backend (18 SP)

| # | Task | SP | Endpoint / Artefak | Issue |
|---|------|----|--------------------|-------|
| 4.1 | Order queue staff + WebSocket `wss://.../queue/ws` | 5 | WS server + Redis pub/sub fan-out | #9 |
| 4.2 | State machine status + audit log (`order_status_logs`) | 3 | `PATCH /admin/orders/{id}/status` | #9 |
| 4.3 | Inventory trigger deduction (stok berkurang saat `CONFIRMED`) | 3 | `inventory.service` | #9 |
| 4.4 | Reporting — laporan harian/bulanan otomatis (cron) | 5 | `GET /admin/reports/daily`, `/monthly` | #9 |
| 4.5 | Export akuntansi (CSV/Excel) | 2 | `GET /admin/reports/export` | #9 |

**AC terkait:** AC-5, AC-6, AC-12.
**TC:** TC-F011-01…-15 (15), TC-F014-01…-09 (9), TC-AC6 (stock).

### 5.2 Frontend (12 SP)

| # | Task | SP | Artefak | Issue |
|---|------|----|---------|-------|
| 4.6 | Admin: order queue real-time (WS) | 5 | `OrderQueuePage` | #13 |
| 4.7 | Admin: dashboard & laporan (grafik + export) | 5 | `DashboardPage`, `ReportsPage` | #13 |
| 4.8 | Admin: manajemen pesanan (state machine UI) | 2 | `OrderDetailPage` | #13 |

**AC terkait:** AC-5, AC-6. **TC:** TC-F011-*, TC-F014-* (sisi UI).

### 5.3 QA — Gate Rilis (paralel)

| # | Task | SP |
|---|------|----|
| 4.9 | E2E happy path lengkap (guest + member + staff) | 3 |
| 4.10 | Performance test (checkout < 90s, payment < 10s, status < 5s) | 2 |
| 4.11 | Security test (RBAC, anti-IDOR, webhook signature) | 2 |
| 4.12 | Gate rilis MVP (§7) | 1 |

### 5.4 Definition of Done Sprint 4

- [ ] Semua 12 baris fitur MVP berfungsi
- [ ] Order queue staff real-time via WebSocket
- [ ] Laporan otomatis ter-generate (harian/bulanan) + export
- [ ] Gate rilis MVP terpenuhi → siap produksi
- [ ] TC-F011 (15) & TC-F014 (9) lulus; E2E hijau

---

## 6. Dependency & Urutan Kritis

```
Sprint 1 (Auth + Catalog)
    │
    ├──▶ Sprint 2 (Cart + Checkout + Payment)   ← butuh Auth & Catalog
    │        │
    │        ├──▶ Sprint 3 (Tracking + Reorder + Loyalty)  ← butuh Order & Payment
    │        │        │
    │        │        └──▶ Sprint 4 (Order Mgmt + Reporting) ← butuh state machine & inventory
    │        │
    │        └──▶ (paralel) DevOps: observability, HPA, SSE tuning
    │
    └──▶ (paralel) QA: test suite dibangun bersamaan, bukan di akhir
```

**Jalur kritis:** Auth → Catalog → Cart → Checkout → Payment → Tracking → Reporting.

**Dependensi eksternal (di luar sprint, milik user):**

| Item | Dibutuhkan sejak | Status |
|------|------------------|--------|
| Kredensial Supabase (`.env`) | Sprint 1 (migrasi) | ⏳ Menunggu user |
| Upstash Redis (cache + queue) | Sprint 1 (cache katalog) | ⏳ Menunggu user |
| Akun Midtrans/Xendit (sandbox) | Sprint 2 (payment) | ⏳ Menunggu user |
| FCM/Twilio/SendGrid | Sprint 3 (notifikasi) | ⏳ Menunggu user |
| Domain + SSL | Sprint 4 (staging) | ⏳ Menunggu user |

---

## 7. Gate Rilis MVP

Mengacu [`PRD-QA.md`](./PRD-QA.md) §6.3:

- [ ] 12 baris fitur MVP lulus AC (**AC-1 … AC-12**)
- [ ] Semua test blocker/high lulus; tidak ada bug P0/P1 terbuka
- [ ] **Performance:** checkout < 90s, payment < 10s, status update < 5s (p95)
- [ ] **Realtime ops:** SSE idle > 120s, over-limit → 503, rolling deploy tidak memutus
- [ ] **Security:** RBAC 7 role, anti-IDOR (reorder/cancel/address/merge/SSE), webhook signature
- [ ] **Coverage** ≥ 80% modul kritis (Auth, Order, Payment)
- [ ] **Observability:** metrics + alerting aktif (error > 1%, p95 > 1s, queue > 1000)
- [ ] **Docs:** README, SETUP, runbook rollback, API reference tersinkron

---

## 8. Risiko Sprint

| # | Risiko | Dampak | Mitigasi |
|---|--------|--------|----------|
| R1 | Kredensial Supabase/Upstash belum siap | Sprint 1 tertunda | Dev lokal (Postgres/Redis Docker) sudah jalan; migrasi menyusul |
| R2 | Integrasi payment gateway (sandbox) lambat | Sprint 2 berisiko | Mulai pendaftaran akun di Sprint 1; pakai mock gateway untuk test |
| R3 | SSE tuning infra (idle timeout, buffering) | Sprint 3 realtime gagal | Sudah didokumentasikan di PRD-BACKEND-DEVOPS §1.6–§1.9 |
| R4 | Cakupan test 145 TC terlalu besar | QA jadi bottleneck | QA paralel per sprint, bukan di akhir; prioritaskan blocker/high |
| R5 | Perubahan scope (F-006/address/cancel masuk MVP) | Sprint membengkak | Sudah dikunci di PRD v1.3; perubahan baru → Phase 2 |
| R6 | Supabase Pro single-AZ (< RTO 30m) | Risiko go-live | Wajib upgrade ke Team (HA) sebelum produksi |

---

## 9. Traceability: Sprint ↔ Fitur ↔ Test Case ↔ AC

| Fitur | Sprint | Test Case | AC | Issue |
|-------|--------|-----------|----|-------|
| F-001 Menu & Pencarian | 1 | TC-F001-* (12) | AC-2 | #4, #10 |
| F-002 Kustomisasi | 1 | TC-F002-* (12) | AC-2 | #4, #10 |
| F-003 Cart & Checkout | 2 | TC-F003-* (33) | AC-1, AC-3, AC-8 | #6, #11 |
| F-003b Addresses | 2 | TC-ADDR-* (11) | AC-10 | #6, #11 |
| F-004 Pembayaran | 2 | TC-F004-* (17) | AC-4 | #7, #11 |
| F-005 Tracking | 3 | TC-F005-* (22) | AC-5, AC-11 | #8, #12 |
| F-005b Customer Cancel | 3 | TC-CANCEL-* (11) | AC-9 | #8, #12 |
| F-005c Realtime Infra | 3 | TC-REALTIME-INFRA-* (9) | AC-12 | #8 |
| F-006 Reorder | 3 | TC-F006-* (11) | AC-7 | #8, #12 |
| F-009 Manajemen Menu | 3 | TC-F009-* (13) | — | #8, #13 |
| F-011 Manajemen Pesanan | 4 | TC-F011-* (15) | AC-5, AC-6 | #9, #13 |
| F-014 Reporting | 4 | TC-F014-* (9) | — | #9, #13 |

**Total:** 145 test case unik · 12 AC · 12 baris fitur MVP.

---

## 10. Ceremony & Alur Kerja

| Ceremony | Frekuensi | Durasi |
|----------|-----------|--------|
| Sprint Planning | Awal sprint | 2 jam |
| Daily Standup | Harian | 15 menit |
| Backlog Refinement | Tengah sprint | 1 jam |
| Sprint Review | Akhir sprint | 1 jam |
| Retrospective | Akhir sprint | 45 menit |

**Alur Git (mengacu [`CONTRIBUTING.md`](./CONTRIBUTING.md)):**

```
main          ← hanya menerima PR yang sudah lolos CI + review
 └── develop  ← integrasi harian
      └── feat/<scope>-<deskripsi>   ← branch kerja
      └── fix/<scope>-<deskripsi>
```

**Konvensi commit:** `feat(scope): ...` · `fix(scope): ...` · `chore(scope): ...` · `docs: ...`

---

## 11. Metrik Keberhasilan MVP

| Metrik | Target | Sumber |
|--------|--------|--------|
| Waktu checkout | < 90 detik | PRD-QA §5.2 |
| Waktu pembayaran | < 10 detik | PRD-QA §5.2 |
| Update status pesanan | < 5 detik (p95) | AC-11 |
| Katalog (cached) | < 100 ms (p95) | PRD-BACKEND |
| Error rate | < 1% | PRD-BACKEND-DEVOPS §4.2 |
| Uptime | ≥ 99.5% (SLA Supabase Pro) | PRD-BACKEND-DEVOPS |

---

*Dokumen ini adalah deliverable **"Sprint Planning MVP"** dan menjadi acuan eksekusi
Sprint 1–4. Perubahan scope harus melalui revisi PRD terkait terlebih dahulu.*
