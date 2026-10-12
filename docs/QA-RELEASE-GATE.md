# QA Release Gate — CoffeeShop Online MVP

> **Status:** aktif · **Versi:** 1.0 · **Tanggal:** 11 Okt 2026
> **Pemilik:** @qa (Senior AI QA Engineer) · **Issue:** #18 (Sprint 2, label `testing`/`P2`)
> **Dokumen rujukan:** `PRD-QA.md` (Bagian 6.3 Gate Rilis, DoD), `PRD-BACKEND.md` v1.3,
> `PRD-FRONTEND.md` v1.3, `PRD-BACKEND-DEVOPS.md` v1.1 (ADR-009 realtime).

Dokumen ini adalah **gerbang rilis (release gate) MVP**: daftar kriteria yang WAJIB hijau
sebelum artefak boleh naik ke produksi, plus checklist eksekusi. Setiap butir punya
**perintah verifikasi** yang bisa dijalankan ulang oleh reviewer/CI.

---

## 1. Ringkasan Gate

Rilis MVP **DILARANG** bila salah satu dari ini tidak terpenuhi:

| # | Gate | Ambang | Bukti |
|---|------|--------|-------|
| G1 | Lint | 0 error | `npm run lint` |
| G2 | Unit + integration test (API) | 100% hijau, 0 skipped wajib | `npm --workspace=@coffibeshop/api test` |
| G3 | Unit test (Web) | 100% hijau | `npm --workspace=@coffibeshop/web test` |
| G4 | Build produksi | API + Web sukses | `npm run build` |
| G5 | Migrasi DB segar | `migrate deploy` dari DB kosong + index trgm ada | test `src/db/migration.test.ts` |
| G6 | Smoke E2E | `scripts/smoke-test.sh` lulus | stack `docker compose up` |
| G7 | Bug terbuka | 0 Critical, 0 High | issue tracker |
| G8 | Kriteria penerimaan | AC-1…AC-12 lulus (PRD-QA §4) | matriks traceability |
| G9 | Gate operasional realtime | TC-REALTIME-INFRA-01…09 lulus | PRD-QA §6.3 |
| G10 | Performance | target §6.3 (checkout <90s, dsb.) | hasil uji beban |

> **Catatan cakupan:** G5 & G6 hanya berjalan di lingkungan yang punya Postgres/stack.
> Di CI/lingkungan tanpa DB, test DB **auto-skip** (`QA_TEST_DATABASE_URL` tidak di-set)
> sehingga suite biasa tetap deterministik & offline — tetapi **G5/G6 tetap wajib dijalankan
> sekali secara manual sebelum rilis** (lihat §3).

---

## 2. Status Saat Ini (snapshot PR #47, setelah #7 payment merged)

Dijalankan pada branch `test/qa-suite-mvp` (merge `origin/main` = `ee3a2bf6`, #7 payment).

| Gate | Hasil | Keterangan |
|------|-------|------------|
| G1 Lint | ✅ **0 error, 0 warning** | `npm run lint` |
| G2 Test API (offline) | ✅ **230 lulus, 13 skip** (13 file) | 13 skip = test DB-guarded (E2E/migrasi) |
| G2 Test API (+DB) | ✅ **243 lulus, 0 skip** (13 file) | dengan `QA_TEST_DATABASE_URL`, paralel |
| G3 Test Web | ✅ **103 lulus** (8 file) | |
| G4 Build | ✅ **sukses** (API + Web + shared) | `npm run build` |
| G5 Migrasi DB segar | ✅ DB sementara per-test (lihat §3.2) | `cb_qa_mig_*` → index trgm ada; aman paralel |
| G6 Smoke E2E | ✅ E2E `checkout.e2e.test.ts` (7 kasus) | butuh Postgres; hijau saat suite paralel |
| G7 Bug | ✅ **0 terbuka** | #18-1 (payment stub) **SELESAI** — #7 merged; test kini regression guard |
| G8 AC-1…AC-12 | ⏳ verifikasi PO | |
| G9 Realtime | ⏳ butuh lingkungan SSE/WS | |
| G10 Performance | ⏳ butuh uji beban | |

**Baseline test:** API 121 → **243** (+122); Web 25 → **103** (+78).

---

## 3. Perintah Verifikasi (jalankan dari cwd workspace, BUKAN root)

> ⚠️ **Jalankan test dari dalam `apps/api` atau `apps/web`.** Dari root, `dotenv` membaca
> `.env` root berisi placeholder Supabase → `process.exit(1)`.

### 3.1 Lint · Test · Build

```bash
# Lint (root, eslint semua workspace)
npm run lint

# Test API (cwd apps/api) — offline, deterministik
cd apps/api && npm test

# Test Web (cwd apps/web)
cd apps/web && npm test

# Build produksi (root)
npm run build
```

### 3.2 Migrasi DB segar (G5)

Test migrasi membuat **DATABASE SEMENTARA sendiri** (`cb_qa_mig_<ts>_<rand>`) dari
koneksi `QA_TEST_DATABASE_URL`, menjalankan `migrate deploy` di sana, lalu men-`DROP`-nya.
DB bersama **tidak disentuh**, sehingga aman berjalan **paralel** dengan `checkout.e2e.test.ts`.

```bash
# 1) Siapkan DB bersama (sekali) + migrasi
docker exec -i coffibeshop-postgres psql -U coffibeshop -d postgres -c "CREATE DATABASE cb_test"
cd apps/api
DATABASE_URL='postgresql://coffibeshop:coffibeshop@localhost:5432/cb_test' \
  DIRECT_URL='postgresql://coffibeshop:coffibeshop@localhost:5432/cb_test' \
  npx prisma migrate deploy

# 2) Jalankan SELURUH suite dengan DB test (paralel, default) — inilah bukti utama
QA_TEST_DATABASE_URL='postgresql://coffibeshop:coffibeshop@localhost:5432/cb_test' \
  npx vitest run
# → 13 file lulus, 243 lulus / 0 skip, 0 gagal
```

Test migrasi: `prisma migrate deploy` dari DB kosong → assert tabel inti ada →
assert **index `trgm`** pada kolom pencarian ada → assert extension **`pg_trgm`** aktif.

> **Catatan isolasi (regresi #18):** sebelumnya test migrasi menjalankan
> `DROP SCHEMA public CASCADE` di DB bersama → menjatuhkan schema di tengah test
> checkout paralel → 7 test checkout gagal. Kini migrasi memakai DB sementara
> per-test (`withIsolatedDb`), jadi tidak ada lagi saling-ganggu antar-file.

### 3.3 Smoke E2E (G6)

```bash
# Stack berjalan
docker compose up -d --build
bash scripts/smoke-test.sh          # /health → /config → catalog → cart → checkout → track
```

### 3.4 E2E cart→checkout dengan DB test (G6 alternatif, offline dari stack penuh)

```bash
cd apps/api
QA_TEST_DATABASE_URL='postgresql://coffibeshop:coffibeshop@localhost:5432/cb_test' \
  npx vitest run src/modules/order/checkout.e2e.test.ts
```

Mencakup: guest & member checkout, golden pricing (82.140), idempotency checkout,
produk tidak tersedia → 409, cancel, update status.

### 3.5 Coverage

```bash
cd apps/api && npx vitest run --coverage
cd apps/web && npx vitest run --coverage
```

---

## 4. Checklist Rilis MVP

Tandai `[x]` saat hijau. Semua butir harus `[x]` kecuali ditandai *(opsional)*.

### 4.1 Kode & CI
- [ ] `npm run lint` → 0 error
- [ ] `npm --workspace=@coffibeshop/api test` → semua hijau (skip DB wajar di CI)
- [ ] `npm --workspace=@coffibeshop/web test` → semua hijau
- [ ] `npm run build` → API + Web sukses
- [ ] CI workflow `.github/workflows/ci.yml` hijau di PR (lint-test-build + docker)
- [ ] PR di-*review* & disetujui PO; **tidak** di-merge otomatis

### 4.2 Data & Migrasi
- [ ] DB kosong → `prisma migrate deploy` sukses (G5)
- [ ] Index `trgm` + extension `pg_trgm` terpasang (G5)
- [ ] Seed produksi (`prisma/seed.ts`) idempoten / aman diulang
- [ ] Backup & rollback plan disiapkan (ops — @devops-engineer)

### 4.3 Fungsional (AC-1…AC-12)
- [ ] AC-1…AC-12 lulus (PRD-QA §4, matriks UC1–UC28)
- [ ] Golden pricing: Latte 27.000 → Large 32.000 → +Extra Shot 37.000 (unit + E2E)
- [ ] Cart Subtotal 74.000 + Pajak 8.140 = **Total 82.140** (FE & BE konsisten)
- [ ] State machine order: `PENDING→PAID→CONFIRMED→BEING_PREPARED→READY→COMPLETED/CANCELLED`
- [ ] RBAC: endpoint staff menolak member dengan **403** (regression guard hijau)
- [ ] Guest tracking via `tracking_token`; anti-IDOR track (token orang lain → 404)
- [ ] Reorder (`POST /orders/{id}/reorder`), cancel (`{reason}`), merge cart (`X-Guest-Id`)
- [ ] Envelope `{success,data,error}` konsisten; sukses nested `data.data`/`data.meta`

### 4.4 Keamanan & Pembayaran
- [x] Webhook signature **valid** diterima, **invalid** ditolak **400** `Invalid signature`; tanpa `signature_key` → **400** `Missing signature_key` (Midtrans sha512)
- [x] Idempotency: `Idempotency-Key` (initiate, key sama+body beda → **409**) & `transaction_id` (webhook replay → 1 payment, 1 log)
- [x] **JANGAN** memanggil provider pembayaran nyata saat test (Midtrans di-mock via `vi.mock`)
- [ ] Tidak ada secret/kredensial ter-commit; token tidak pernah di-log
- [ ] Rate limit fallback polling 40 req/min/IP; cap SSE/pod (`SSE_MAX_CONNECTIONS_PER_POD`)

### 4.5 Realtime (G9, ADR-009)
- [ ] TC-REALTIME-INFRA-01…09 lulus (PRD-QA §6.3) — idle timeout, buffering off, 503 over-limit,
      rolling deploy, heartbeat 15s, fallback polling 3s, WS fan-out, HPA, cap WS/pod
- [ ] SSE event <5s; WS <3s; heartbeat `ping` 15s

### 4.6 Operasional
- [ ] `/health` & `/api/v1/config` OK di stack rilis
- [ ] Log terstruktur (pino) tanpa PII berlebih; request-id terpasang
- [ ] Monitoring & alert dasar aktif (ops — @devops-engineer)
- [ ] Uptime target >99.5% (exclude maintenance 02:00–04:00 WIB)

---

## 5. Temuan Bug (dilaporkan, TIDAK diperbaiki di PR ini)

Sesuai aturan #18, QA **tidak** mengubah kode produksi. Temuan berikut dilaporkan ke PO
untuk ditugaskan ke role terkait:

| ID | Severity | Ringkasan | Bukti | Status |
|----|----------|-----------|-------|--------|
| #18-1 | High | Modul `payment` masih **stub**: tidak ada verifikasi signature webhook, tidak ada idempotency store, tidak ada klien Midtrans | `apps/api/src/modules/payment/payment.routes.ts` | ✅ **SELESAI** — #7 (payment) merged `ee3a2bf6`. Kini: verifikasi signature sha512, idempotency `Idempotency-Key`+`transaction_id`, klien Midtrans. Test `payment.routes.test.ts` + `payment.security-gaps.test.ts` jadi regression guard aktif (tidak lagi `.skip`). |

> **Tidak ada temuan lain.** `apps/web/src/lib/api.ts:18` diverifikasi utuh
> (`Authorization: Bearer ${token}`) — `***` yang tampak di diff hanyalah penyaringan
> secret pada tooling, bukan kode rusak. Test `api.test.ts` meng-assert header
> `Authorization` mengandung token dan **hijau**.

---

## 6. Coverage

Diukur dengan `vitest run --coverage` (provider v8).

| Workspace | Baseline (main) | Sesudah (#18) | Δ |
|-----------|-----------------|---------------|---|
| `apps/api` — % Stmts | 38.75% | **66.2%** | +27.4 pp |
| `apps/api` — % Branch | 71.59% | **76.99%** | +5.4 pp |
| `apps/api` — % Funcs | 65.42% | **71.34%** | +5.9 pp |
| `apps/web` — % Stmts | 9.77% | **39.05%** | +29.28 pp |
| `apps/web` — % Branch | 63.33% | **83.78%** | +20.45 pp |
| `apps/web` — % Funcs | 38.63% | **67.69%** | +29.06 pp |

**Jumlah test:** API 121 → **243** (+122, termasuk regression guard payment #7); Web 25 → **103** (+78); total **146 → 346** (+200).

> Angka *sebelum* diukur dengan menyingkirkan sementara file test baru; angka *sesudah*
> dari suite penuh. Coverage mode **wajib** dijalankan setelah `npx prisma generate`
> (menghindari `Prisma.Decimal is not a constructor`).

---

## 7. Prosedur Rilis (ringkas)

1. Semua gate §1 hijau; checklist §4 penuh `[x]`.
2. PO menyetujui PR & menandatangani gate ini.
3. @devops-engineer men-deploy kandidat ke staging; jalankan §3.3 smoke + §4.5 realtime.
4. Canary/blue-green (opsional), pantau error rate & latency 30 menit.
5. Bila ada regresi → rollback ke image sebelumnya; buka bug Critical.

---

## 8. Riwayat

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| 1.0 | 11 Okt 2026 | Dokumen awal gate rilis MVP (#18): 10 gate, checklist 6 seksi, temuan bug, coverage before/after |
| 1.1 | 11 Okt 2026 | **Fix isolasi DB**: test migrasi memakai DB sementara per-test (`withIsolatedDb`) — hilangkan regresi 7 test checkout saat suite paralel dengan `QA_TEST_DATABASE_URL` |
| 1.2 | 12 Okt 2026 | **#7 payment merged** (`ee3a2bf6`): perbarui 8 test kontrak payment ke perilaku nyata (validasi input, idempotency `Idempotency-Key`, signature webhook); aktifkan 6 regression guard `.skip` di `payment.security-gaps.test.ts` (invalid signature → 400). Temuan #18-1 **SELESAI**. G2 API 243 lulus / 0 skip (+DB), paralel. |
