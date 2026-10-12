import { useEffect } from 'react';
import { useOutletStore } from '../stores/outlet.store.js';
import { useAuth } from './useAuth.js';
import { isStaff, OUTLET_LOCKED_ROLES } from '../lib/roles.js';

/**
 * Outlet scope untuk AdminShell (PRD-BACKEND §5, RBAC outlet).
 *
 * - Owner/manager/finance: bebas memilih outlet (OutletSwitcher).
 * - kasir/barista (`OUTLET_LOCKED_ROLES`): terkunci ke `user.outlet_id`.
 * - Default: outlet pertama dari daftar bila belum ada pilihan.
 */
export function useOutletScope(outlets: { id: string; name: string }[] | undefined) {
  const { user } = useAuth();
  const { outletId, setOutlet } = useOutletStore();

  const locked = user ? OUTLET_LOCKED_ROLES.includes(user.role as never) : false;
  const lockedOutlet = locked ? (user?.outlet_id ?? null) : null;

  // Staff ber-scope: paksa ke outlet miliknya.
  useEffect(() => {
    if (locked && lockedOutlet && outletId !== lockedOutlet) setOutlet(lockedOutlet);
  }, [locked, lockedOutlet, outletId, setOutlet]);

  // Owner/manager tanpa pilihan: default ke outlet pertama.
  useEffect(() => {
    if (!locked && !outletId && outlets && outlets.length > 0) setOutlet(outlets[0].id);
  }, [locked, outletId, outlets, setOutlet]);

  const effective = locked ? lockedOutlet : outletId;
  const current = outlets?.find((o) => o.id === effective) ?? null;

  return {
    outletId: effective,
    outlet: current,
    locked,
    canSwitch: !locked && isStaff(user?.role),
    setOutlet,
  };
}
