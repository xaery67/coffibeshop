# 🏗️ Arsitektur Sistem — CoffeeShop Online

## Ringkasan

```
┌──────────────┐     ┌──────────────┐
│  Customer    │     │  Staff/Admin │
│  PWA (React) │     │  Web (React) │
└──────┬───────┘     └──────┬───────┘
       │  HTTPS / SSE / WS   │
       └──────────┬──────────┘
                  ▼
         ┌─────────────────┐
         │  Cloudflare     │  CDN + WAF
         └────────┬────────┘
                  ▼
         ┌─────────────────┐
         │  API Gateway    │  Kong (rate limit, JWT, routing)
         └────────┬────────┘
                  ▼
   ┌──────────────────────────────┐
   │  Modular API (Node.js/TS)    │
   │  9 domain service            │
   │  + BullMQ worker             │
   │  + SSE / WebSocket           │
   └───┬───────────┬──────────┬───┘
       ▼           ▼          ▼
  ┌─────────┐ ┌─────────┐ ┌─────────┐
  │Supabase │ │ Upstash │ │ Upstash │
  │Postgres │ │ cache   │ │ queue   │
  │(RLS)    │ │(lru)    │ │(noevict)│
  └─────────┘ └─────────┘ └─────────┘
```

## Komponen

| Komponen | Teknologi | Peran |
|----------|-----------|-------|
| Customer PWA | React 18 + Vite + Workbox | Pesan, kustomisasi, checkout, lacak |
| Admin Web | React 18 + Vite | Dashboard, menu, order queue, laporan |
| API | Node.js + TypeScript + Express | 9 domain service (REST `/api/v1`) |
| Realtime | SSE + WebSocket | Pelacakan order, antrian staff |
| Queue | BullMQ (Redis) | Payment, notifikasi, loyalty, reporting async |
| Database | PostgreSQL (Supabase) | Data inti, trigger inventory |
| Cache | Redis (Upstash) | Session, cart, menu cache, rate limit |

## 9 Domain Service

`Auth` · `Catalog` · `Order` · `Payment` · `Inventory` · `Loyalty` · `Reporting` · `Notification` · `Admin`

## Status Order Kanonik

```
PENDING → PAID → CONFIRMED → BEING_PREPARED → READY → COMPLETED
                                                     ↘ CANCELLED
```

## Keputusan Arsitektur (ADR)

13 ADR tercatat di [`PRD-BACKEND.md`](./PRD-BACKEND.md) — termasuk guest cart hybrid (ADR-006),
config publik (ADR-007), tracking token (ADR-008), SSE realtime (ADR-009), reorder (ADR-010),
merge cart (ADR-011), customer cancel (ADR-012), address book (ADR-013).

## Detail Lengkap

Lihat [`PRD-BACKEND-DEVOPS.md`](./PRD-BACKEND-DEVOPS.md) untuk infra, CI/CD, observability,
keamanan, dan konfigurasi SSE per-hop (ALB/Kong/K8s).
