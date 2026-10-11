import { Router } from 'express';
import { asyncHandler, sendOk, BadRequest, NotFound } from '../../lib/http.js';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { requireAuth, requireRole, requireMinRole } from '../../middleware/auth.js';

export const adminRouter = Router();

/**
 * GET /api/v1/admin/config — KONFIG PUBLIK (ADR-007).
 * Dipakai FE pricing engine: tax, point value, metode bayar, ongkir flat.
 * (Catatan: juga tersedia di /api/v1/config untuk kompatibilitas.)
 */
adminRouter.get('/config', asyncHandler(async (_req, res) =>
  sendOk(res, {
    tax_rate: env.TAX_RATE,
    point_value: env.POINT_VALUE,
    currency: env.CURRENCY,
    active_payment_methods: ['qris', 'gopay', 'ovo', 'dana', 'linkaja', 'shopeepay', 'virtual_account', 'credit_card', 'apple_pay', 'google_pay'],
    shipping_flat_fee: env.SHIPPING_FLAT_FEE,
    sse_heartbeat_interval_ms: env.SSE_HEARTBEAT_INTERVAL_MS,
    tracking_poll_interval_ms: env.TRACKING_POLL_INTERVAL_MS,
  }),
));

adminRouter.get('/_status', asyncHandler(async (_req, res) =>
  sendOk(res, { service: 'admin', status: 'scaffolded' }),
));

// ─────────────────────────────────────────────────────────────────────
//  Manajemen pengguna — OWNER ONLY (PRD-BACKEND §5)
//  Endpoint di bawah sudah menegakkan RBAC; UI admin menyusul di Sprint 4.
// ─────────────────────────────────────────────────────────────────────

/** GET /api/v1/admin/users — daftar pengguna (owner). */
adminRouter.get(
  '/users',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const role = req.query.role as string | undefined;

    const where = role ? { role: role as any } : {};
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true, email: true, phone: true, full_name: true,
          role: true, outlet_id: true, is_active: true, created_at: true,
        },
      }),
    ]);

    sendOk(res, {
      data: users,
      meta: { page, limit, total, total_pages: Math.ceil(total / limit) || 1 },
    });
  }),
);

/** PATCH /api/v1/admin/users/:id/role — ubah role pengguna (owner). */
adminRouter.patch(
  '/users/:id/role',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { role, outlet_id } = req.body ?? {};
    const VALID = ['owner', 'manager', 'kasir', 'barista', 'finance', 'guest', 'member'];
    if (!role || !VALID.includes(role)) {
      throw BadRequest(`role wajib salah satu dari: ${VALID.join(', ')}`);
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw NotFound('Pengguna tidak ditemukan');

    // Jangan biarkan owner terakhir dicabut (mencegah lockout).
    if (target.role === 'owner' && role !== 'owner') {
      const owners = await prisma.user.count({ where: { role: 'owner', is_active: true } });
      if (owners <= 1) throw BadRequest('Tidak bisa menurunkan owner terakhir');
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: role as any, outlet_id: outlet_id ?? null },
      select: { id: true, email: true, role: true, outlet_id: true },
    });
    sendOk(res, updated);
  }),
);

/** PATCH /api/v1/admin/users/:id/active — aktif/nonaktifkan akun (owner). */
adminRouter.patch(
  '/users/:id/active',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { is_active } = req.body ?? {};
    if (typeof is_active !== 'boolean') throw BadRequest('is_active wajib boolean');
    if (req.params.id === (req as any).user.id && is_active === false) {
      throw BadRequest('Tidak bisa menonaktifkan akun sendiri');
    }
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { is_active },
      select: { id: true, email: true, is_active: true },
    });
    sendOk(res, updated);
  }),
);

/** GET /api/v1/admin/audit — ringkasan audit (owner/manager). */
adminRouter.get(
  '/audit',
  requireAuth,
  requireMinRole('manager'),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const logs = await prisma.orderStatusLog.findMany({
      take: limit,
      orderBy: { created_at: 'desc' },
      include: { order: { select: { order_number: true, status: true } } },
    });
    sendOk(res, { data: logs, meta: { limit, count: logs.length } });
  }),
);
