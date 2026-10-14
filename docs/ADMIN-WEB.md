# Admin Web — Catatan Implementasi (Sprint 4)

> Sumber kontrak: `docs/PRD-BACKEND.md` §2.2/§2.3/§2.5/§2.7, `docs/PRD-FRONTEND.md` §2.1/§2.4/§5.3,
> `docs/SPRINT-PLAN.md` §5.2. Isu: #13.

## Struktur

```
apps/web/src/
├─ App.tsx                     # dua shell terpisah: /admin/* (lazy) vs customer
├─ routes/admin/
│  ├─ AdminRoutes.tsx          # peta route admin + RoleGuard
│  ├─ AdminDashboardPage.tsx   # KPI + grafik + top produk + low-stock
│  ├─ OrderQueuePage.tsx       # papan antrian realtime (WS)
│  ├─ MenuManagementPage.tsx   # CRUD menu outlet-scoped (DataTable)
│  └─ ReportsPage.tsx          # harian/bulanan + export CSV
├─ components/admin/
│  ├─ AdminShell.tsx           # Sidebar + Topbar + OutletSwitcher + RoleBadge + <Outlet/>
│  ├─ AdminSidebar.tsx         # nav RBAC-aware
│  ├─ AdminTopbar.tsx
│  ├─ OutletSwitcher.tsx       # terkunci untuk kasir/barista
│  ├─ RoleBadge.tsx
│  ├─ RoleGuard.tsx            # guard staff/owner (+ allowed opsional)
│  ├─ KpiCard.tsx / SalesChart.tsx / OrderTicketCard.tsx
├─ components/ui/DataTable.tsx # primitive sort/filter/pagination
├─ hooks/useAdminQueue.ts      # WS primary → polling fallback
├─ hooks/useAdminReports.ts    # KPI/laporan/low-stock
├─ hooks/useMenuAdmin.ts       # CRUD menu
├─ hooks/useOutletScope.ts     # resolusi outlet aktif (owner bebas, kasir terkunci)
├─ lib/admin.ts                # klien endpoint admin (HTTP)
├─ lib/admin.mock.ts           # mock selama backend belum merged
├─ lib/queue.ts                # state machine + transport WS + reduksi event
├─ lib/reporting.ts            # format, seri grafik, export CSV
└─ lib/roles.ts                # RBAC klien (paritas requireRole backend)
```

## Bundle terpisah

`App.tsx` memuat `AdminRoutes` via `React.lazy`. Build menghasilkan chunk admin
terpisah (`AdminRoutes`, `AdminDashboardPage`, `OrderQueuePage`,
`MenuManagementPage`, `ReportsPage`, `DataTable`, `SalesChart`, `reporting`)
sehingga pelanggan tidak mengunduh kode admin (PRD-FRONTEND §5.3).

## Mock ⇄ Backend

Endpoint yang **belum** merged (queue WS, reporting, KPI) dialihkan ke
`lib/admin.mock.ts` selama `VITE_ADMIN_MOCK !== 'false'` (default aktif).

Saat backend mendarat: set `VITE_ADMIN_MOCK=false` (atau hapus cabang mock di
`lib/admin.ts`) — **tanpa** mengubah UI maupun test. Endpoint katalog menu
(§2.2) & order status (§2.3) sudah memanggil HTTP nyata.

## RBAC

`lib/roles.ts` mencerminkan `requireRole` backend: **`owner` selalu lolos**.

| Kapabilitas | owner | manager | finance | kasir | barista |
|---|---|---|---|---|---|
| Akses AdminShell | ✔ | ✔ | ✔ | ✔ | ✔ |
| Laporan keuangan (`/admin/reports`, `/reports/daily\|monthly\|top-products\|export/*`) | ✔ | ✔ | ✔ | ✖ | ✖ |
| KPI dashboard (`/reports/kpi`) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Tulis menu | ✔ | ✔ | ✖ | ✖ | ✖ |
| Ganti outlet | ✔ | ✔ | ✔ | ✖ (terkunci) | ✖ (terkunci) |

> **KPI vs laporan:** `GET /reports/kpi` minimal **kasir** karena dashboard `/admin`
> dipakai semua staf untuk ringkasan operasional (pendapatan hari ini, pesanan,
> low-stock). Grafik tren & tabel produk terlaris bersumber dari
> `/reports/monthly` & `/reports/top-products` yang dibatasi **owner/manager/finance**,
> sehingga keduanya **disembunyikan** untuk kasir/barista (`AdminDashboardPage`).
> Backend menegakkan ini lewat `requireRole('owner','manager','finance')`.

## Gate

`tsc --noEmit` = 0 · `eslint` = 0 · `vitest` hijau · `vite build` OK.
