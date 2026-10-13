import { Link, useNavigate } from 'react-router-dom';
import type { OutletDTO } from '@coffibeshop/shared';
import { RoleBadge } from './RoleBadge.js';
import { OutletSwitcher } from './OutletSwitcher.js';
import { useAuth } from '../../hooks/useAuth.js';

/** AdminTopbar — judul + outlet switcher + badge role + keluar sesi/toko (PRD-FRONTEND §2.4). */
export function AdminTopbar({
  title,
  outlets,
  outletId,
  outletName,
  onOutletChange,
  outletLocked,
  role,
}: {
  title: string;
  outlets: OutletDTO[];
  outletId: string | null;
  outletName?: string | null;
  onOutletChange: (id: string) => void;
  outletLocked: boolean;
  role?: string | null;
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  /** Keluar sesi staf/owner (issue #64) — hapus sesi lalu kembali ke halaman login. */
  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-20 border-b border-brand-100 bg-white/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <h1 className="text-h2 text-text">{title}</h1>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <OutletSwitcher
            outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
            value={outletId}
            onChange={onOutletChange}
            locked={outletLocked}
          />
          <RoleBadge role={role} outletName={outletName} />
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Keluar"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-text hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          >
            <span aria-hidden="true">🚪</span>
            Keluar
          </button>
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 text-sm text-text hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          >
            ← Toko
          </Link>
        </div>
      </div>
    </header>
  );
}
