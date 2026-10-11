# 🛠️ DEVOPS — CI/CD, Security & Observability

> Panduan operasional untuk repo `coffibeshop`.
> Melengkapi `docs/PRD-BACKEND-DEVOPS.md` (desain) dengan **cara menjalankannya**.
> Issue: **#17 — Sprint 2/Infra (CI/CD & observability)**.

---

## 1. Peta Pipeline

| Workflow | File | Trigger | Fungsi |
|----------|------|---------|--------|
| **CI** | `.github/workflows/ci.yml` | PR/push ke `main`, `develop` | Lint · Test · Build · **migration-drift gate** · **Trivy** · **coverage** |
| **CD Staging** | `.github/workflows/cd-staging.yml` | push `main` / manual | Build+push image → deploy staging → **smoke test** |
| **Release** | `.github/workflows/release.yml` | tag | Rilis versi |

### Gate di CI (semua wajib hijau)

| # | Job | Apa yang diperiksa | Gagal bila |
|---|-----|--------------------|------------|
| 1 | `lint-test-build` | ESLint, unit test, build | ada error lint/test/build |
| 2 | **`migration-drift`** | Postgres bersih → `prisma migrate deploy` → cek **index pg_trgm** + drift schema | **index `products_name_trgm_idx` / `products_description_trgm_idx` hilang**, atau schema≠migrations |
| 3 | `coverage` | Coverage api & web | (belum fail — dilaporkan + artifact) |
| 4 | `docker` | Build image api/web | build gagal |
| 5 | **`trivy`** | Scan image (api/web) + filesystem | ada CVE **HIGH/CRITICAL** yang **tidak** ada di baseline (`.trivyignore`) |

> **Kenapa gate migration-drift ada?** Bug nyata: folder migration yang *drift* menghapus 2 index pg_trgm di **setiap deployment baru** dan tidak terdeteksi CI (pencarian jadi lambat tanpa error). Gate ini mereproduksi deployment dari nol dan **gagal** kalau index hilang.

---

## 2. Menjalankan CI secara Lokal

Semua langkah di bawah bisa dijalankan di mesin dev (Docker wajib untuk gate migration & Trivy).

```bash
# 0) Prasyarat
node -v            # >= 20
docker info        # daemon jalan
npm ci

# 1) Lint · Test · Build (sama seperti job lint-test-build)
npm run lint
npm run test
npm run build

# 2) GATE MIGRATION-DRIFT (paling penting)
#    Spin Postgres bersih, terapkan semua migration, verifikasi index pg_trgm.
bash scripts/ci-migration-check.sh

# 3) Trivy (image + filesystem)
docker build -f apps/api/Dockerfile -t coffibeshop/api:ci .
docker build -f apps/web/Dockerfile -t coffibeshop/web:ci .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/.trivyignore:/tmp/.trivyignore" aquasec/trivy:latest image \
  --ignorefile /tmp/.trivyignore --severity HIGH,CRITICAL --exit-code 1 coffibeshop/api:ci
docker run --rm -v "$PWD:/src" -w /src aquasec/trivy:latest fs \
  --ignorefile .trivyignore --severity HIGH,CRITICAL --exit-code 1 .

# 4) Smoke test lokal (stack berjalan)
docker compose up -d --build
bash scripts/smoke-test.sh          # /health + /api/v1/config + katalog + cart→checkout→track
```

> Windows/macOS: jalankan `scripts/ci-migration-check.sh` lewat Git Bash / WSL.

---

## 3. Gate Migration-Drift — Detail

`scripts/ci-migration-check.sh` melakukan:

1. **Postgres bersih** (container ephemeral / `services:` di CI).
2. `prisma migrate deploy` — menerapkan **semua** migration dari nol (persis seperti deployment baru).
3. **Assert index trgm** ada di `pg_indexes`:
   - `products_name_trgm_idx`
   - `products_description_trgm_idx`
   Jika salah satu hilang → **exit 1**.
4. **Assert drift schema ↔ migrations** (`prisma migrate diff`) → tidak boleh ada perbedaan.

Menambah index/kolom baru? Pastikan **selalu** lewat folder migration (`prisma migrate dev`), bukan langsung di DB, agar gate tetap hijau.

---

## 4. Security Scan (Trivy)

- **Scope:** image `api` & `web` + filesystem (dependensi npm).
- **Severity:** `HIGH,CRITICAL`, `--ignore-unfixed` (hanya CVE yang punya perbaikan).
- **Fail-on-high:** `--exit-code 1` → CI **merah** kalau ada temuan baru.
- **Baseline:** `.trivyignore` memuat CVE dari base image yang **belum bisa diperbaiki di dalam scope ini** (lihat komentar di file untuk alasannya + cara menghapus).
- **Cara memperbaiki temuan baru:**
  1. Lihat log job `trivy` → catat `CVE-ID` + paket.
  2. Update dependensi (`npm audit fix`, bump versi) atau base image (butuh perubahan `Dockerfile` → koordinasi @backend-engineer / @qa).
  3. Kalau benar-benar belum ada fix, tambahkan ke `.trivyignore` **dengan komentar + tanggal** (review berkala).

---

## 5. Coverage Report

- **API:** `vitest run --coverage` (provider `v8`, reporter `text` + `lcov`).
- **Web:** `vitest run --coverage`.
- Output: `apps/api/coverage/`, `apps/web/coverage/` (lcov).
- CI mengunggah artifact `coverage-api`, `coverage-web` + menulis ringkasan ke **GitHub Step Summary**.
- Coverage **belum** memblok merge (baseline dulu); target minimum menyusul di sprint berikutnya.

---

## 6. Deploy Staging & Smoke Test

`cd-staging.yml`:
1. Build & push image ke registry (kalau `secrets.REGISTRY_URL` dikonfigurasi; kalau tidak, langkah deploy dilewati dengan notice).
2. Deploy (placeholder → `kubectl set image` / `helm upgrade`, lihat `PRD-BACKEND-DEVOPS.md` §3).
3. **Smoke test** (`scripts/smoke-test.sh`) terhadap `STAGING_BASE_URL`:
   - tunggu container sehat (`/health` → `status:ok`),
   - `GET /api/v1/config` → `success:true`,
   - `GET /api/v1/catalog/products` → `success:true`.
   Gagal → job merah (blok promote ke prod).

Set secret `STAGING_BASE_URL` (mis. `https://staging.coffibeshop.example`) agar smoke test berjalan di CI. Tanpa itu, smoke test lokal pakai `http://localhost:4000`.

---

## 7. Observability

| Aspek | Implementasi | Lokasi |
|-------|--------------|--------|
| **Logging terstruktur (JSON)** | `pino` + `pino-http`, redaksi field sensitif | `apps/api/src/config/logger.ts`, `app.ts` |
| **Correlation id** | header `x-request-id` (middleware + di-log) | `apps/api/src/middleware/requestId.ts` |
| **Liveness** | `GET /health` (selalu cepat) | `apps/api/src/routes/health.ts` |
| **Readiness** | `GET /ready` (cek DB + Redis) | `apps/api/src/routes/health.ts` |
| **Metrics (Prometheus)** | `GET /metrics` (prom-client: default + `http_request_duration_seconds`) | `apps/api/src/observability/metrics.ts` |

- `/metrics` **tidak** di-log (di-ignore oleh `pino-http`) dan sebaiknya hanya diakses dari jaringan internal / service monitor.
- **Rencana lanjutan (belum di scope #17):** OpenTelemetry tracing, Grafana/Loki, alerting — lihat `PRD-BACKEND-DEVOPS.md` §4.

---

## 8. Rotasi Secret

**Prinsip:** tidak ada secret di repo / image / `.env` yang di-commit. Produksi via **GitHub Actions secrets** + **Secrets Manager** (lihat `PRD-BACKEND-DEVOPS.md` §2.2 & §5.4).

### 8.1 Menambah / mengubah secret CI
```bash
gh secret set REGISTRY_URL      --repo xaery67/coffibeshop
gh secret set REGISTRY_USERNAME --repo xaery67/coffibeshop
gh secret set REGISTRY_PASSWORD --repo xaery67/coffibeshop
gh secret set STAGING_BASE_URL  --repo xaery67/coffibeshop
```

### 8.2 Rotasi kredensial aplikasi (DB, Redis, payment, JWT)
1. **Buat kredensial baru** di provider (Supabase/Upstash/Midtrans/Xendit/Secrets Manager).
2. **Update** nilai di Secrets Manager (bukan di repo).
3. **Restart** service agar env baru ter-load (rolling deploy).
4. **Cabut** kredensial lama setelah verifikasi.
5. **Catat** tanggal rotasi di changelog internal.

| Secret | Rotasi | Catatan |
|--------|--------|---------|
| `DATABASE_URL` / `DIRECT_URL` | 90 hari | pooler (6543) untuk app, direct (5432) untuk migrasi |
| `REDIS_CACHE_URL` / `REDIS_QUEUE_URL` | 90 hari | cache (`allkeys-lru`) & queue (`noeviction`) terpisah |
| `MIDTRANS_*` / `XENDIT_*` | 180 hari | sandbox ↔ live dipisah per environment |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | 180 hari | RS256; rotasi bertahap (publish `kid` baru, overlap) |

### 8.3 Aturan
- **JANGAN** cetak nilai secret di log/CI output/chat.
- **JANGAN** commit `.env` (sudah di `.gitignore`); pakai `.env.example` sebagai template.
- Akses secret = least-privilege per service.

---

## 9. Referensi
- Desain lengkap: `docs/PRD-BACKEND-DEVOPS.md` (§1 infrastruktur, §3 CI/CD, §4 observability, §5 keamanan).
- Setup lokal: `SETUP.md`, `docs/CONTRIBUTING.md`.
- Script: `scripts/ci-migration-check.sh`, `scripts/smoke-test.sh`.
