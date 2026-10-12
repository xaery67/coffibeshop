import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { isStaff } from '../../lib/roles.js';

/**
 * RoleGuard — penjaga route admin (PRD-FRONTEND §2.1, RBAC).
 *
 * - Belum login → redirect `/login?next=<path>`.
 * - Login tapi bukan staff → tampilkan 403 (tidak melempar ke customer).
 * - Staff/owner → render anak.
 *
 * `allowed` (opsional) mempersempit lebih lanjut (mis. laporan hanya owner/manager).
 */
export function RoleGuard({
  children,
  allowed,
  fallback,
}: {
  children: ReactNode;
  /** Daftar role tambahan yang diizinkan; `owner` selalu lolos. */
  allowed?: readonly string[];
  /** Konten alternatif bila role kurang (default: kartu 403). */
  fallback?: ReactNode;
}) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const role = user?.role;
  const ok = allowed
    ? isStaff(role) && (role === 'owner' || allowed.includes(role ?? ''))
    : isStaff(role);

  if (!ok) {
    return (
      <>
        {fallback ?? (
          <section role="alert" className="mx-auto max-w-md space-y-2 rounded-card border border-error/30 bg-white p-6 text-center">
            <p className="text-2xl" aria-hidden="true">
              🔒
            </p>
            <h1 className="text-h2 text-text">Akses ditolak</h1>
            <p className="text-sm text-text-muted">
              Halaman ini hanya untuk staf outlet. Hubungi owner bila Anda butuh akses.
            </p>
          </section>
        )}
      </>
    );
  }

  return <>{children}</>;
}
