import { Link } from 'react-router-dom';
import type { OutletDTO } from '@coffibeshop/shared';
import { RoleBadge } from './RoleBadge.js';
import { OutletSwitcher } from './OutletSwitcher.js';

/** AdminTopbar — judul + outlet switcher + badge role + keluar ke toko (PRD-FRONTEND §2.4). */
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
