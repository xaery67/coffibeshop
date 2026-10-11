# ☕ CoffeeShop Online — `coffibeshop`

> Pesan kopi tanpa antre. **PWA Customer** + **Web Admin** (Owner/Manager/Staff) dengan otomatisasi pencatatan administrasi bulanan.

[![CI](https://github.com/xaery67/coffibeshop/actions/workflows/ci.yml/badge.svg)](https://github.com/xaery67/coffibeshop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## 📐 Arsitektur Singkat

```
Customer (PWA) ─┐
                ├─▶ API Gateway (Kong) ─▶ Modular API (Node/TS, 9 domain service)
Staff (Admin) ──┘                              │
                                               ├─▶ PostgreSQL (Supabase)
                                               ├─▶ Redis cache (Upstash)
                                               ├─▶ Redis queue (BullMQ)
                                               └─▶ SSE / WebSocket (realtime)
```

| Layer | Teknologi |
|-------|-----------|
| **Frontend** | React 18 · TypeScript · Vite · Tailwind · TanStack Query · Zustand · PWA |
| **Backend** | Node.js · TypeScript · Express · Prisma · BullMQ · pino · Zod |
| **Database** | PostgreSQL via **Supabase** (Auth + Storage + Realtime) |
| **Cache/Queue** | **Upstash Redis** (cache `allkeys-lru` + queue `noeviction`) |
| **Container** | Docker multi-stage → distroless |
| **CI/CD** | GitHub Actions (lint → test → build → Trivy → push) |

## 🚀 Quick Start

### 1. Prasyarat
- Node.js ≥ 20 · npm ≥ 10
- Docker & Docker Compose (opsional, untuk stack penuh)

### 2. Setup
```bash
git clone https://github.com/xaery67/coffibeshop.git
cd coffibeshop
cp .env.example .env          # lalu isi kredensial Supabase & Redis
npm install
```

### 3. Jalankan (dev)
```bash
# Terminal 1 — API
npm run dev:api               # http://localhost:4000

# Terminal 2 — Web
npm run dev:web               # http://localhost:5173
```

### 4. Jalankan via Docker (stack penuh)
```bash
docker compose up -d --build
# API  → http://localhost:4000/health
# Web  → http://localhost:5173
# Redis & Postgres lokal ikut terangkat
```

## 📁 Struktur Monorepo

```
coffibeshop/
├── apps/
│   ├── api/          # Backend — modular monolith (9 domain service)
│   └── web/          # Frontend — PWA Customer + Admin
├── packages/
│   └── shared/       # Tipe & kontrak API bersama (DTO, enum, validasi Zod)
├── docs/             # PRD, arsitektur, diagram, ADR
├── .github/          # CI/CD, issue & PR template
├── docker-compose.yml
└── .env.example
```

## 🧩 9 Domain Service (Backend)

Auth · Catalog · Order · Payment · Inventory · Loyalty · Reporting · Notification · Admin

Status order kanonik:
`PENDING → PAID → CONFIRMED → BEING_PREPARED → READY → COMPLETED / CANCELLED`

## 📚 Dokumentasi

Seluruh dokumen perencanaan (PRD Backend/Frontend/UX/QA/DevOps) tersedia di [`docs/`](./docs).

## 🧪 Testing

```bash
npm run test              # unit + integration (semua workspace)
npm run lint              # ESLint
```

## 📄 Lisensi

MIT © 2026 CoffeeShop Online
