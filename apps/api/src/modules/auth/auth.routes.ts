import { Router } from 'express';
import { asyncHandler, sendOk } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, getGuestId } from '../../middleware/auth.js';
import { AuthService } from './auth.service.js';
import {
  RegisterInput,
  LoginInput,
  RefreshInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  UpdateProfileInput,
  AddressInput,
} from '@coffibeshop/shared';

export const authRouter = Router();
const service = new AuthService();

/** Ambil token dari header Authorization: Bearer <token>. */
function bearer(req: any): string | undefined {
  const h = req.headers.authorization as string | undefined;
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
}

/**
 * POST /api/v1/auth/register — registrasi member.
 * Header opsional `X-Guest-Id` → merge guest cart otomatis (ADR-011).
 */
authRouter.post(
  '/register',
  validate(RegisterInput),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.register(req.body, getGuestId(req)), 201);
  }),
);

/**
 * POST /api/v1/auth/login — login (email ATAU nomor HP).
 * Header opsional `X-Guest-Id` → auto-merge cart (`cart_merged`, `cart_item_count`).
 */
authRouter.post(
  '/login',
  validate(LoginInput),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.login(req.body, getGuestId(req)));
  }),
);

/** POST /api/v1/auth/refresh — rotasi refresh token (yang lama dicabut). */
authRouter.post(
  '/refresh',
  validate(RefreshInput),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.refresh(req.body.refresh_token));
  }),
);

/**
 * POST /api/v1/auth/logout — cabut token (ADR-005: Redis blocklist).
 * Body opsional `{ refresh_token }`; access token diambil dari header.
 */
authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendOk(
      res,
      await service.logout((req as any).user.id, {
        accessToken: bearer(req),
        refreshToken: req.body?.refresh_token,
      }),
    );
  }),
);

/** POST /api/v1/auth/logout-all — cabut SEMUA sesi pengguna. */
authRouter.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendOk(res, await service.logoutAll((req as any).user.id));
  }),
);

/** GET /api/v1/auth/me — profil pengguna login (opsional `?addresses=true`). */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const withAddr = req.query.addresses === 'true';
    sendOk(res, await service.me((req as any).user.id, withAddr));
  }),
);

/** PATCH /api/v1/auth/me — perbarui profil (nama / nomor HP). */
authRouter.patch(
  '/me',
  requireAuth,
  validate(UpdateProfileInput),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.updateMe((req as any).user.id, req.body));
  }),
);

/** POST /api/v1/auth/change-password — ganti password (cabut semua sesi). */
authRouter.post(
  '/change-password',
  requireAuth,
  validate(ChangePasswordInput),
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body;
    sendOk(
      res,
      await service.changePassword((req as any).user.id, current_password, new_password),
    );
  }),
);

/** POST /api/v1/auth/forgot-password — kirim tautan reset (selalu 200). */
authRouter.post(
  '/forgot-password',
  validate(ForgotPasswordInput),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.forgotPassword(req.body.email));
  }),
);

/** POST /api/v1/auth/reset-password — reset password dengan token. */
authRouter.post(
  '/reset-password',
  validate(ResetPasswordInput),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.resetPassword(req.body.token, req.body.new_password));
  }),
);

/** GET /api/v1/auth/me/addresses — daftar alamat pengguna. */
authRouter.get(
  '/me/addresses',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendOk(res, await service.getAddresses((req as any).user.id));
  }),
);

/** POST /api/v1/auth/me/addresses — tambah alamat. */
authRouter.post(
  '/me/addresses',
  requireAuth,
  validate(AddressInput),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.createAddress((req as any).user.id, req.body), 201);
  }),
);

/** PUT /api/v1/auth/me/addresses/:id — update alamat. */
authRouter.put(
  '/me/addresses/:id',
  requireAuth,
  validate(AddressInput),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.updateAddress((req as any).user.id, req.params.id, req.body));
  }),
);

/** DELETE /api/v1/auth/me/addresses/:id — hapus alamat. */
authRouter.delete(
  '/me/addresses/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendOk(res, await service.deleteAddress((req as any).user.id, req.params.id));
  }),
);
