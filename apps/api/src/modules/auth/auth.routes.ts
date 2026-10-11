import { Router } from 'express';
import { asyncHandler, sendOk } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { AuthService } from './auth.service.js';

export const authRouter = Router();
const service = new AuthService();

/** POST /api/v1/auth/register — registrasi member; merge guest cart via X-Guest-Id (ADR-011). */
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const result = await service.register(req.body, req.headers['x-guest-id'] as string);
    sendOk(res, result, 201);
  }),
);

/** POST /api/v1/auth/login — login; auto-merge guest cart bila header X-Guest-Id ada. */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const result = await service.login(req.body, req.headers['x-guest-id'] as string);
    sendOk(res, result);
  }),
);

/** POST /api/v1/auth/refresh */
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => sendOk(res, await service.refresh(req.body.refresh_token))),
);

/** POST /api/v1/auth/logout */
authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await service.logout((req as any).user.id);
    sendOk(res, { message: 'Logged out' });
  }),
);

/** GET /api/v1/auth/me */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => sendOk(res, await service.me((req as any).user.id))),
);
