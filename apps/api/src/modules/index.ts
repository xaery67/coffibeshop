import { Router } from 'express';
import { authRouter } from './auth/auth.routes.js';
import { catalogRouter } from './catalog/catalog.routes.js';
import { orderRouter } from './order/order.routes.js';
import { paymentRouter } from './payment/payment.routes.js';
import { inventoryRouter } from './inventory/inventory.routes.js';
import { loyaltyRouter } from './loyalty/loyalty.routes.js';
import { reportingRouter } from './reporting/reporting.routes.js';
import { notificationRouter } from './notification/notification.routes.js';
import { adminRouter } from './admin/admin.routes.js';

/** Router utama /api/v1 — 9 domain service (PRD-BACKEND §2). */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/catalog', catalogRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/loyalty', loyaltyRouter);
apiRouter.use('/reports', reportingRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/admin', adminRouter);
