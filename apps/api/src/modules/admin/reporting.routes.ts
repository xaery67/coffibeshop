import { Router } from 'express';
import { asyncHandler, sendOk } from '../../lib/http.js';
import { requireAuth, requireMinRole } from '../../middleware/auth.js';
import { ReportingService } from './reporting.service.js';

export const reportingRouter = Router();
const service = new ReportingService();

/** GET /api/v1/admin/reports/_status */
reportingRouter.get('/_status', asyncHandler(async (_req, res) =>
  sendOk(res, { service: 'reporting', status: 'ok' }),
));

/** GET /api/v1/admin/reports/daily — laporan harian. */
reportingRouter.get(
  '/daily',
  requireAuth,
  requireMinRole('manager'),
  asyncHandler(async (req, res) => {
    const outletId = (req as any).user?.outlet_id ?? req.query.outlet_id as string | undefined;
    const date = req.query.date as string | undefined;
    sendOk(res, await service.getDailyReport(outletId, date));
  }),
);

/** GET /api/v1/admin/reports/monthly — laporan bulanan. */
reportingRouter.get(
  '/monthly',
  requireAuth,
  requireMinRole('manager'),
  asyncHandler(async (req, res) => {
    const outletId = (req as any).user?.outlet_id ?? req.query.outlet_id as string | undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const month = req.query.month ? Number(req.query.month) : undefined;
    sendOk(res, await service.getMonthlyReport(outletId, year, month));
  }),
);

/** GET /api/v1/admin/reports/export — export CSV/JSON untuk akuntansi. */
reportingRouter.get(
  '/export',
  requireAuth,
  requireMinRole('manager'),
  asyncHandler(async (req, res) => {
    const format = (req.query.format as 'csv' | 'json') ?? 'csv';
    const type = (req.query.type as 'daily' | 'monthly') ?? 'daily';
    const outletId = (req as any).user?.outlet_id ?? req.query.outlet_id as string | undefined;
    const date = req.query.date as string | undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const month = req.query.month ? Number(req.query.month) : undefined;

    const result = await service.exportReport(format, type, outletId, date, year, month);

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    });
    res.send(result.content);
  }),
);