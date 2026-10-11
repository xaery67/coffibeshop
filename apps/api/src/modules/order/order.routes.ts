import { Router } from 'express';
import { asyncHandler, sendOk, BadRequest } from '../../lib/http.js';
import { optionalAuth, requireAuth, getGuestId, requireRole } from '../../middleware/auth.js';
import { OrderService } from './order.service.js';
import { streamOrderEvents } from './sse.controller.js';

export const orderRouter = Router();
const service = new OrderService();

/** GET /api/v1/orders/cart — cart aktif (member via JWT, guest via X-Guest-Id). */
orderRouter.get(
  '/cart',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.id;
    sendOk(res, await service.getCart(userId, getGuestId(req)));
  }),
);

/** POST /api/v1/orders/cart/items — tambah item. */
orderRouter.post(
  '/cart/items',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.id;
    sendOk(res, await service.addItem(userId, getGuestId(req), req.body), 201);
  }),
);

/** PUT /api/v1/orders/cart/items/:id — ubah qty. */
orderRouter.put(
  '/cart/items/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.id;
    sendOk(res, await service.updateItem(userId, getGuestId(req), req.params.id, req.body));
  }),
);

/** DELETE /api/v1/orders/cart/items/:id */
orderRouter.delete(
  '/cart/items/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.id;
    sendOk(res, await service.removeItem(userId, getGuestId(req), req.params.id));
  }),
);

/** POST /api/v1/orders/cart/voucher — terapkan voucher + poin. */
orderRouter.post(
  '/cart/voucher',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.id;
    sendOk(res, await service.applyVoucher(userId, getGuestId(req), req.body));
  }),
);

/** POST /api/v1/orders/cart/merge — merge guest cart (fallback eksplisit, ADR-011). */
orderRouter.post(
  '/cart/merge',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.body?.guest_id) throw BadRequest('guest_id wajib diisi');
    sendOk(res, await service.merge((req as any).user.id, req.body.guest_id));
  }),
);

/** POST /api/v1/orders/checkout — buat order + tracking_token (ADR-008). */
orderRouter.post(
  '/checkout',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.id;
    sendOk(res, await service.checkout(userId, getGuestId(req), req.body), 201);
  }),
);

/** GET /api/v1/orders — riwayat order member. */
orderRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => sendOk(res, await service.history((req as any).user.id, req.query))),
);

/** GET /api/v1/orders/queue — antrian staff (RBAC). */
orderRouter.get(
  '/queue',
  requireAuth,
  requireRole('owner', 'manager', 'kasir', 'barista'),
  asyncHandler(async (req, res) => sendOk(res, await service.queue(req.query))),
);

/** GET /api/v1/orders/track/:token — lacak guest (PUBLIK, ADR-008). */
orderRouter.get(
  '/track/:token',
  asyncHandler(async (req, res) => sendOk(res, await service.trackByToken(req.params.token))),
);

/** GET /api/v1/orders/track/:token/events — SSE guest (PUBLIK). */
orderRouter.get('/track/:token/events', streamOrderEvents);

/** GET /api/v1/orders/:id */
orderRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => sendOk(res, await service.detail((req as any).user.id, req.params.id))),
);

/** GET /api/v1/orders/:id/events — SSE member (ADR-009). */
orderRouter.get('/:id/events', requireAuth, streamOrderEvents);

/** POST /api/v1/orders/:id/reorder — reorder 1-klik (ADR-010). */
orderRouter.post(
  '/:id/reorder',
  requireAuth,
  asyncHandler(async (req, res) => sendOk(res, await service.reorder((req as any).user.id, req.params.id))),
);

/** POST /api/v1/orders/:id/cancel — customer cancel (ADR-012). */
orderRouter.post(
  '/:id/cancel',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.id;
    sendOk(res, await service.cancel(userId, req.params.id, req.body?.reason));
  }),
);

/** PUT /api/v1/orders/:id/status — update status (staff). */
orderRouter.put(
  '/:id/status',
  requireAuth,
  requireRole('owner', 'manager', 'kasir', 'barista'),
  asyncHandler(async (req, res) => sendOk(res, await service.updateStatus(req.params.id, req.body))),
);
