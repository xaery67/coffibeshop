# Setup & Konfigurasi — CoffeeShop Online

Panduan ini menjelaskan cara menjalankan proyek secara lokal dan cara
menghubungkannya ke **Supabase** (database produksi) serta **Upstash Redis**.

---

## 1. Prasyarat

| Alat     | Versi minimum | Cek              |
|----------|---------------|------------------|
| Node.js  | 20 LTS        | `node -v`        |
| npm      | 10            | `npm -v`         |
| Docker   | 24 + Compose  | `docker compose version` |
| Git      | 2.40          | `git --version`  |

---

## 2. Menjalankan lokal (Docker)

```bash
docker compose up -d --build
```

| Layanan | URL                             |
|---------|---------------------------------|
| Web     | http://localhost:5173           |
| API     | http://localhost:4000/health    |
| Postgres| localhost:5432 (user/pass: coffibeshop) |
| Redis   | localhost:6379                  |

Migrasi + seed (dari host, image api memakai distroless tanpa shell):

```bash
npm install
npm run -w @coffibeshop/api prisma:migrate
npm run -w @coffibeshop/api prisma:seed
```

Akun seed: `owner@coffibeshop.id`

### 2.1 Bagaimana `.env` sampai ke container

`.env` **tidak dibake ke image** (diblokir `.dockerignore`) dan **bukan** di-`env_file` mentah.
Variabel diteruskan **satu per satu** lewat substitusi `${VAR}` di `docker-compose.yml`,
mis. `MIDTRANS_SERVER_KEY: ${MIDTRANS_SERVER_KEY:-}` — nilainya dibaca dari `.env` saat
`docker compose up`.

> **Kenapa tidak `env_file: - .env`?** Karena `.env` memuat placeholder Supabase/Upstash
> (`<project-ref>`, dst). Bila diteruskan mentah, `apps/api/src/config/env.ts` akan
> **gagal boot** (`❌ Invalid environment variables: { SUPABASE_URL: ['Invalid url'] }`).
> Jadi hanya variabel yang **sudah nyata** yang diteruskan; tambahkan baris pass-through
> baru begitu kredensial Supabase/Upstash benar-benar diisi.

Untuk meneruskan variabel baru: tambahkan `${NAMA_VAR:-default}` di blok `environment:`
service `api`, lalu `docker compose up -d --build api`.

---


## 3. Konfigurasi Supabase (produksi / staging)

### 3.1 Buat project

1. Buka https://supabase.com/dashboard → **New project**
2. Catat **project ref** (mis. `abcdefghijklmnop`) dan **region**
3. **Settings → Database → Connection string** → ambil dua URL:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`
   - **Session / direct** (port `5432`) → `DIRECT_URL`

### 3.2 Ambil API keys

**Settings → API**:
- `Project URL`        → `SUPABASE_URL`
- `anon public`        → `SUPABASE_ANON_KEY`
- `service_role`       → `SUPABASE_SERVICE_ROLE_KEY` (JANGAN ke frontend!)
- `JWT Secret`         → `SUPABASE_JWT_SECRET`

### 3.3 Isi `.env`

Salin nilai di atas ke file berikut (semua sudah ada, ter-ignore git):

| File               | Untuk                |
|--------------------|----------------------|
| `.env`             | referensi lengkap    |
| `apps/api/.env`    | runtime backend      |
| `apps/web/.env`    | runtime frontend (hanya `VITE_*` publik) |

Contoh minimal `apps/api/.env`:

```env
NODE_ENV=production
API_PORT=4000
DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
REDIS_CACHE_URL=rediss://default:<PASSWORD>@<host>.upstash.io:6379
REDIS_QUEUE_URL=rediss://default:<PASSWORD>@<host>.upstash.io:6379
JWT_PRIVATE_KEY=<PEM RS256 — atau biarkan kosong & pakai .keys/ lokal>
JWT_PUBLIC_KEY=<PEM RS256 publik — pasangan JWT_PRIVATE_KEY>
MIDTRANS_SERVER_KEY=<midtrans-server-key>
MIDTRANS_CLIENT_KEY=<midtrans-client-key>
MIDTRANS_IS_PRODUCTION=false
```

> **Penting — Prisma + Supavisor:** `DATABASE_URL` (port 6543, pgbouncer)
> wajib `?pgbouncer=true&connection_limit=1`; migrasi memakai `DIRECT_URL`
> (port 5432). Ini sudah diset di `apps/api/prisma/schema.prisma`.

### 3.4 Migrasi ke Supabase

```bash
cd apps/api
npx prisma migrate deploy   # memakai DIRECT_URL
npx prisma db seed
```

### 3.5 Supabase Storage (untuk upload gambar produk — Issue #15)

Endpoint upload: `POST /api/v1/catalog/products/:id/image` (RBAC owner/manager).

1. **Buat bucket di dashboard Supabase**
   - Buka **Storage → Create bucket**
   - Nama: `cs-dev-products` (atau sesuai `SUPABASE_STORAGE_BUCKET` di `.env`)
   - Public: **YES** (agar public URL bisa diakses frontend)
   - File size limit: `5MB` (opsional, validasi juga di backend)
   - Allowed MIME types: `image/jpeg`, `image/png`, `image/webp` (opsional, validasi juga di backend)

2. **Isi kredensial di `.env` / `apps/api/.env`**
   ```env
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # HANYA backend!
   ```

3. **Verifikasi konfigurasi**
   ```bash
   node scripts/verify-supabase.mjs
   ```
   Skrip melakukan:
   - **Ping REST API** (list buckets)
   - **Cek bucket** `SUPABASE_STORAGE_BUCKET` (default `cs-dev-products`) ada
   - **Upload + delete** file test round-trip

   **Exit code:**
   - `0` = semua lolos
   - `1` = kegagalan nyata (bucket tidak ada, kredensial salah, network error)
   - `2` = **SKIP** (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi)

4. **Behavior endpoint**
   - Multipart form field: `image`
   - Max size: 5MB (multer + manual check)
   - MIME: `image/jpeg` (ext `.jpg`), `image/png` (`.png`), `image/webp` (`.webp`)
   - Path di bucket: `products/{productId}/{timestamp}.{ext}`
   - Response: `{ product_id, image_url, product }` — `image_url` disimpan ke `Product.image_url`
   - Bila Supabase belum dikonfigurasi → 503 SERVICE_UNAVAILABLE dengan pesan jelas
   - RBAC: hanya `owner` & `manager` yang boleh upload

---

## 4. Upstash Redis

Dua database terpisah (sesuai PRD-BACKEND-DEVOPS §1.4):

| Keperluan      | Policy        | Env                |
|----------------|---------------|--------------------|
| Cache (cart, katalog) | `allkeys-lru` | `REDIS_CACHE_URL` |
| Queue (BullMQ) | `noeviction`  | `REDIS_QUEUE_URL` |

Buat 2 database di https://console.upstash.com → salin `rediss://` URL.

### 4.1 Verifikasi konektivitas Upstash

Setelah `REDIS_CACHE_URL` & `REDIS_QUEUE_URL` diisi di `.env`, verifikasi keduanya
dengan satu perintah (TIDAK menuliskan kredensial ke output):

```bash
node scripts/verify-upstash.mjs
```

Skrip memeriksa, per instance:

| # | Langkah | Lolos bila |
|---|---------|-----------|
| 1 | **PING** cache & queue | balasan `PONG` |
| 2 | **maxmemory-policy** | cache = `allkeys-lru`, queue = `noeviction` |
| 3 | **Round-trip BullMQ** | job `verify.ping` ke queue `reporting` diproses worker lokal (≤15s) lalu dihapus |

**Exit code:** `0` = semua lolos · `1` = ada kegagalan nyata · `2` = **SKIP** (kredensial belum diisi).

> **Catatan Upstash terkelola:** Upstash bisa **menolak perintah `CONFIG`**. Bila itu
> terjadi, langkah maxmemory-policy ditandai *"tidak dapat diverifikasi (dikelola)"*
> (⚠️ WARN, bukan gagal) — set policy lewat dashboard Upstash bila perlu.
>
> Jalankan ulang kapan pun setelah mengganti kredensial atau membuat database baru.

---

## 5. Environment variables (referensi lengkap)

Lihat `.env.example` di root. Kelompok:

- **Core**: `NODE_ENV`, `API_PORT`, `API_BASE_URL`, `CORS_ORIGIN`
- **Database**: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_*`
- **Redis**: `REDIS_CACHE_URL`, `REDIS_QUEUE_URL`
- **Auth**: `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (RS256, PEM inline) atau `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`
- **Payment**: `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION`, `XENDIT_SECRET_KEY`, `XENDIT_CALLBACK_TOKEN`
- **Notification**: `FCM_SERVER_KEY`, `TWILIO_*`, `SENDGRID_API_KEY`
- **Realtime**: `SSE_MAX_CONNECTIONS_PER_POD`, `WS_MAX_CONNECTIONS_PER_POD`, `TRACKING_POLL_INTERVAL_MS`
- **Frontend** (hanya `VITE_*`): `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## 6. CI/CD

Workflow di `.github/workflows/`:

| Workflow        | Trigger            | Fungsi                              |
|-----------------|--------------------|-------------------------------------|
| `ci.yml`        | push / PR ke main  | lint → test → build → docker + Trivy |
| `cd-staging.yml`| push ke main       | build & push image (skip jika secrets kosong) |
| `release.yml`   | tag `v*`           | build artefak rilis                 |

Secrets yang perlu diisi di **Settings → Secrets and variables → Actions**:

```
REGISTRY_URL, REGISTRY_USERNAME, REGISTRY_PASSWORD
```

---

## 7. Troubleshooting

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| `api` unhealthy di Docker | healthcheck `node` tidak ada di PATH distroless | sudah diperbaiki (pakai `/nodejs/bin/node`) |
| Prisma error `Query engine binary not found` | binaryTargets kurang | pastikan `binaryTargets` memuat `debian-openssl-3.0.x` |
| Prisma `prepared statement already exists` | pooler tanpa pgbouncer flag | tambahkan `?pgbouncer=true&connection_limit=1` |
| SSE terputus ~60s di produksi | idle timeout LB/proxy | lihat PRD-BACKEND-DEVOPS §1.6 (ALB ≥120s) |
