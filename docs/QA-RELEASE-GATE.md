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

## 2. Status Saat Ini (snapshot PR #18)

Dijalankan pada branch `test/qa-suite-mvp` (base `main` = `24e0fcc`).

| Gate | Hasil | Keterangan |
|------|-------|------------|
| G1 Lint | ✅ **0 error, 0 warning** | `npm run lint` |
| G2 Test API | ✅ **217 lulus, 19 skip** (13 file) | 19 skip = test DB-guarded (E2E/migrasi) |
| G3 Test Web | ✅ **103 lulus** (8 file) | |
| G4 Build | ✅ **sukses** (API + Web + shared) | `npm run build` |
| G5 Migrasi DB segar | ✅ manual (lihat §3.2) | `cb_mig_test` → index trgm ada (6 test) |
| G6 Smoke E2E | ✅ manual E2E `checkout.e2e.test.ts` (7 kasus) | butuh Postgres |
| G7 Bug | ⚠️ lihat §5 (temuan #18-1) | 0 Critical; 1 High terbuka (payment stub) |
| G8 AC-1…AC-12 | ⏳ verifikasi PO | |
| G9 Realtime | ⏳ butuh lingkungan SSE/WS | |
| G10 Performance | ⏳ butuh uji beban | |

**Baseline test:** API 121 → **217** (+96); Web 25 → **103** (+78).

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

```bash
# 1) Siapkan DB kosong (sekali)
createdb cb_mig_test     # atau: docker exec coffibeshop-postgres createdb -U coffibeshop cb_mig_test

# 2) Jalankan test migrasi (dari apps/api)
cd apps/api
QA_TEST_DATABASE_URL='postgresql://coffibeshop:coffibeshop@localhost:5432/cb_mig_test' \
  npx vitest run src/db/migration.test.ts
```

Test ini: `prisma migrate deploy` dari DB kosong → assert tabel inti ada → assert
**index `trgm`** pada kolom pencarian ada → assert extension **`pg_trgm`** aktif.

### 3.3 Smoke E2E (G6)

```bash
# Stack berjalan
docker compose up -d --build
bash scripts/smoke-test.sh          # /health → /config → catalog → cart → checkout → track
```

### 3.4 E2E cart→checkout dengan DB test (G6 alternatif, offline dari stack penuh)

```bash
cd apps/api
QA_TEST_DATABASE_URL='postgresql://coffibeshop:coffibeshop@localhost:5432/cb_e2e_test' \
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
- [ ] Webhook signature **valid** diterima, **invalid** ditolak 401/403 (Midtrans sha512 / Xendit token)
- [ ] Idempotency: `Idempotency-Key` & `transaction_id` — replay tidak menggandakan order
- [ ] **JANGAN** memanggil provider pembayaran nyata saat test (mock/sandbox saja)
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
| #18-1 | High | Modul `payment` masih **stub**: tidak ada verifikasi signature webhook, tidak ada idempotency store, tidak ada klien Midtrans | `apps/api/src/modules/payment/payment.routes.ts`; spesifikasi eksekutabel di `payment.security-gaps.test.ts` (route-level di-`describe.skip` sampai gateway mendarat) | Terbuka → @backend-engineer |

> **Tidak ada temuan lain.** `apps/web/src/lib/api.ts:18` diverifikasi utuh
> (`Authorization: \`Bearer ${token}\``) — `***` yang tampak di diff hanyalah penyaringan
> secret pada tooling, bukan kode rusak. Test `api.test.ts` meng-assert header
> `Authorization` mengandung token dan **hijau**.

---

## 6. Coverage

Diukur dengan `vitest run --coverage` (provider v8).

| Workspace | Sebelum (baseline) | Sesudah (#18) | Δ |
|-----------|--------------------|---------------|---|
| `apps/api` — % Stmts | 38.75% | **66.32%** | +27.57 pp |
| `apps/api` — % Branch | 71.59% | **78.62%** | +7.03 pp |
| `apps/api` — % Funcs | 65.42% | **75.36%** | +9.94 pp |
| `apps/web` — % Stmts | 9.77% | **39.05%** | +29.28 pp |
| `apps/web` — % Branch | 63.33% | **83.78%** | +20.45 pp |
| `apps/web` — % Funcs | 38.63% | **67.69%** | +29.06 pp |

**Jumlah test:** API 121 → **217** (+96); Web 25 → **103** (+78); total **236 → 320** (+184).

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
