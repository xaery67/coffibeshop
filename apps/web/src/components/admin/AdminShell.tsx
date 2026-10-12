import { createContext, Suspense, useContext } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useOutlets } from '../../hooks/useOutlets.js';
import { useOutletScope } from '../../hooks/useOutletScope.js';
import { useAuth } from '../../hooks/useAuth.js';
import { AdminSidebar } from './AdminSidebar.js';
import { AdminTopbar } from './AdminTopbar.js';

/** Judul per route admin (PRD-FRONTEND §2.2). */
const TITLES: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/orders': 'Antrian Pesanan',
  '/admin/menu': 'Manajemen Menu',
  '/admin/reports': 'Laporan',
};

export interface AdminOutletCtx {
  outletId: string | null;
  outletName: string | null;
}

export const OutletCtx = createContext<AdminOutletCtx>({ outletId: null, outletName: null });

/** Outlet aktif di dalam AdminShell (dipakai halaman anak). */
export function useAdminOutlet(): AdminOutletCtx {
  return useContext(OutletCtx);
}

/**
 * AdminShell — shell admin terpisah dari customer (PRD-FRONTEND §2.1/§2.4).
 *
 * Dimuat lazy di `App.tsx` → bundle admin tidak masuk ke customer. Berisi
 * Sidebar (RBAC-aware), Topbar (OutletSwitcher + RoleBadge), dan `<Outlet/>`.
 * Outlet aktif di-resolve lewat `useOutletScope` (owner bebas, kasir terkunci).
 */
export function AdminShell() {
  const location = useLocation();
  const { user } = useAuth();
  const outlets = useOutlets();
  const scope = useOutletScope(outlets.data);

  const title = TITLES[location.pathname] ?? 'Admin';
  const outletCtx: AdminOutletCtx = { outletId: scope.outletId, outletName: scope.outlet?.name ?? null };

  return (
    <div className="flex min-h-screen flex-col bg-brand-50 text-text lg:flex-row">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-fg"
      >
        Lompat ke konten admin
      </a>

      <aside className="shrink-0 border-b border-brand-100 bg-white lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <span aria-hidden="true" className="text-lg">
            ☕
          </span>
          <span className="font-bold text-brand">CoffeeShop Admin</span>
        </div>
        <AdminSidebar role={user?.role} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar
          title={title}
          outlets={outlets.data ?? []}
          outletId={scope.outletId}
          outletName={scope.outlet?.name ?? null}
          onOutletChange={scope.setOutlet}
          outletLocked={scope.locked}
          role={user?.role}
        />

        <main id="admin-main" className="flex-1 p-4">
          {scope.outletId ? (
            <Suspense fallback={<p className="text-sm text-text-muted">Memuat…</p>}>
              <OutletCtx.Provider value={outletCtx}>
                <Outlet />
              </OutletCtx.Provider>
            </Suspense>
          ) : (
            <p className="text-sm text-text-muted">Pilih outlet untuk mulai.</p>
          )}
        </main>
      </div>
    </div>
  );
}
