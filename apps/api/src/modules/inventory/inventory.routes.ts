import { Router } from 'express';
import { asyncHandler, sendOk, BadRequest } from '../../lib/http.js';
import { requireAuth, requireRole, requireMinRole } from '../../middleware/auth.js';
import { InventoryService } from './inventory.service.js';

export const inventoryRouter = Router();
const service = new InventoryService();

/** GET /api/v1/inventory/_status */
inventoryRouter.get('/_status', asyncHandler(async (_req, res) =>
  sendOk(res, { service: 'inventory', status: 'ok' }),
));

/** GET /api/v1/inventory — daftar stok (staff/owner). */
inventoryRouter.get(
  '/',
  requireAuth,
  requireMinRole('kasir'),
  asyncHandler(async (req, res) => {
    const outletId = (req as any).user?.outlet_id ?? req.query.outlet_id as string | undefined;
    sendOk(res, await service.getInventory(outletId));
  }),
);

/** GET /api/v1/inventory/logs — riwayat mutasi stok. */
inventoryRouter.get(
  '/logs',
  requireAuth,
  requireMinRole('kasir'),
  asyncHandler(async (req, res) => {
    const outletId = (req as any).user?.outlet_id ?? req.query.outlet_id as string | undefined;
    const itemId = req.query.item_id as string | undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    sendOk(res, await service.getLogs(outletId, itemId, limit));
  }),
);

/** GET /api/v1/inventory/low-stock — item stok rendah. */
inventoryRouter.get(
  '/low-stock',
  requireAuth,
  requireMinRole('kasir'),
  asyncHandler(async (req, res) => {
    const outletId = (req as any).user?.outlet_id ?? req.query.outlet_id as string | undefined;
    sendOk(res, await service.getLowStock(outletId));
  }),
);

/** POST /api/v1/inventory — tambah item stok (manager/owner). */
inventoryRouter.post(
  '/',
  requireAuth,
  requireMinRole('manager'),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.createItem(req.body), 201);
  }),
);

/** PUT /api/v1/inventory/:id — update stok (restock/adjustment). */
inventoryRouter.put(
  '/:id',
  requireAuth,
  requireMinRole('kasir'),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.updateStock(req.params.id, req.body));
  }),
);

/** POST /api/v1/inventory/deduct/:orderId — deduksi stok untuk order (admin). */
inventoryRouter.post(
  '/deduct/:orderId',
  requireAuth,
  requireMinRole('manager'),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.deductForOrder(req.params.orderId));
  }),
);