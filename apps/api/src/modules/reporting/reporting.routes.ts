import { Router } from 'express';
import { asyncHandler, sendOk } from '../../lib/http.js';
import { requireAuth, requireMinRole, requireRole } from '../../middleware/auth.js';
import { ReportingService } from './reporting.service.js';

/**
 * Reporting routes (F-014, PRD-BACKEND §2.7) — di-mount pada `/api/v1/reports`.
 * Kontrak path PERSIS seperti `docs/PRD-BACKEND.md` §2.7 & `apps/web/src/lib/admin.ts`.
 */
export const reportingRouter = Router();
const service = new ReportingService();

/** Ambil outlet dari JWT (staff ter-scope) atau query (owner lintas outlet). */
function outletOf(req: { user?: { outlet_id?: string | null }; query: Record<string, unknown> }): string | null {
  const fromUser = req.user?.outlet_id ?? null;
  const fromQuery = typeof req.query.outlet_id === 'string' ? req.query.outlet_id : null;
  return fromUser ?? fromQuery;
}

/** GET /api/v1/reports/daily?outlet_id=&date= — laporan harian (owner/manager/finance). */
reportingRouter.get(
  '/daily',
  requireAuth,
  requireRole('owner', 'manager', 'finance'),
  asyncHandler(async (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    sendOk(res, await service.getDailyReport(outletOf(req as never), date));
  }),
);

/** GET /api/v1/reports/monthly?outlet_id=&month=&year= — laporan bulanan (owner/manager/finance). */
reportingRouter.get(
  '/monthly',
  requireAuth,
  requireRole('owner', 'manager', 'finance'),
  asyncHandler(async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const month = req.query.month ? Number(req.query.month) : undefined;
    sendOk(res, await service.getMonthlyReport(outletOf(req as never), year, month));
  }),
);

/** GET /api/v1/reports/top-products?outlet_id=&period=7d|30d — produk terlaris (owner/manager/finance). */
reportingRouter.get(
  '/top-products',
  requireAuth,
  requireRole('owner', 'manager', 'finance'),
  asyncHandler(async (req, res) => {
    const period = req.query.period === '30d' ? '30d' : '7d';
    sendOk(res, await service.getTopProducts(outletOf(req as never), period));
  }),
);

/**
 * GET /api/v1/reports/kpi?outlet_id=&date= — KPI dashboard admin.
 * Minimal kasir: dashboard `/admin` dipakai SEMUA staf (kasir/barista butuh
 * ringkasan operasional). Laporan keuangan detail di endpoint lain dibatasi
 * ke owner/manager/finance (lihat ADMIN-WEB.md §RBAC).
 */
reportingRouter.get(
  '/kpi',
  requireAuth,
  requireMinRole('kasir'),
  asyncHandler(async (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    sendOk(res, await service.getKpi(outletOf(req as never), date));
  }),
);

/** GET /api/v1/reports/export/accounting?outlet_id=&year=&month=&format=csv — owner/manager/finance. */
reportingRouter.get(
  '/export/accounting',
  requireAuth,
  requireRole('owner', 'manager', 'finance'),
  asyncHandler(async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const month = req.query.month ? Number(req.query.month) : undefined;
    const { filename, content } = await service.exportAccountingCsv(outletOf(req as never), year, month);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(content);
  }),
);
