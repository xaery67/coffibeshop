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
JWT_REFRESH_SECRET=<random-64-char>
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

---

## 4. Upstash Redis

Dua database terpisah (sesuai PRD-BACKEND-DEVOPS §1.4):

| Keperluan      | Policy        | Env                |
|----------------|---------------|--------------------|
| Cache (cart, katalog) | `allkeys-lru` | `REDIS_CACHE_URL` |
| Queue (BullMQ) | `noeviction`  | `REDIS_QUEUE_URL` |

Buat 2 database di https://console.upstash.com → salin `rediss://` URL.

---

## 5. Environment variables (referensi lengkap)

Lihat `.env.example` di root. Kelompok:

- **Core**: `NODE_ENV`, `API_PORT`, `API_BASE_URL`, `CORS_ORIGIN`
- **Database**: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_*`
- **Redis**: `REDIS_CACHE_URL`, `REDIS_QUEUE_URL`
- **Auth**: `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (RS256, PEM inline) atau `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`
- **Payment**: `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `XENDIT_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET`
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
