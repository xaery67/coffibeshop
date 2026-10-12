import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Outlet aktif untuk AdminShell (OutletSwitcher, PRD-FRONTEND §2.4).
 * Persist agar pilihan staff bertahan antar-sesi; staff ber-scope outlet
 * otomatis terkunci ke outlet miliknya (lihat `useOutletScope`).
 */
interface OutletState {
  outletId: string | null;
  setOutlet: (id: string | null) => void;
}

export const useOutletStore = create<OutletState>()(
  persist(
    (set) => ({
      outletId: null,
      setOutlet: (outletId) => set({ outletId }),
    }),
    { name: 'cs.adminOutlet' },
  ),
);
