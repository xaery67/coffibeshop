import { NavLink } from 'react-router-dom';
import { canAccessReports, canWriteMenu } from '../../lib/roles.js';

/**
 * AdminSidebar — navigasi vertikal AdminShell (PRD-FRONTEND §2.4).
 * Item yang butuh role lebih tinggi (menu tulis, laporan) disembunyikan sesuai RBAC.
 */
export interface SidebarItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

export function adminNavItems(role?: string | null): SidebarItem[] {
  const items: SidebarItem[] = [
    { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
    { to: '/admin/orders', label: 'Antrian Pesanan', icon: '🧾' },
  ];
  if (canWriteMenu(role)) items.push({ to: '/admin/menu', label: 'Manajemen Menu', icon: '☕' });
  if (canAccessReports(role)) items.push({ to: '/admin/reports', label: 'Laporan', icon: '📈' });
  return items;
}

export function AdminSidebar({ role }: { role?: string | null }) {
  const items = adminNavItems(role);
  return (
    <nav aria-label="Navigasi admin" className="flex flex-col gap-1 p-3">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            [
              'flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm transition',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
              isActive ? 'bg-brand text-brand-fg font-semibold' : 'text-text hover:bg-brand-50',
            ].join(' ')
          }
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
