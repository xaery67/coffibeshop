import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminShell } from '../../components/admin/AdminShell.js';
import { RoleGuard } from '../../components/admin/RoleGuard.js';
import { REPORT_ROLES } from '../../lib/roles.js';

/**
 * AdminRoutes — peta route admin (PRD-FRONTEND §2.2), dimuat lazy oleh `App.tsx`.
 * Seluruh route dibungkus `RoleGuard` (staff/owner); laporan dipersempit lagi ke
 * owner/manager/finance.
 */
const AdminDashboardPage = lazy(() =>
  import('./AdminDashboardPage.js').then((m) => ({ default: m.AdminDashboardPage })),
);
const OrderQueuePage = lazy(() => import('./OrderQueuePage.js').then((m) => ({ default: m.OrderQueuePage })));
const MenuManagementPage = lazy(() =>
  import('./MenuManagementPage.js').then((m) => ({ default: m.MenuManagementPage })),
);
const ReportsPage = lazy(() => import('./ReportsPage.js').then((m) => ({ default: m.ReportsPage })));

export function AdminRoutes() {
  return (
    <Routes>
      <Route
        element={
          <RoleGuard>
            <AdminShell />
          </RoleGuard>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="orders" element={<OrderQueuePage />} />
        <Route path="menu" element={<MenuManagementPage />} />
        <Route
          path="reports"
          element={
            <RoleGuard allowed={REPORT_ROLES}>
              <ReportsPage />
            </RoleGuard>
          }
        />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
