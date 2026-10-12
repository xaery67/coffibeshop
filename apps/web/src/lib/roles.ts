/**
 * RBAC klien (PRD-BACKEND §5, PRD-FRONTEND §2.1). Selaras `requireRole` backend:
 * `owner` selalu lolos; sisanya harus ada di daftar.
 */

/** Role yang boleh masuk AdminShell (staff outlet + owner). */
export const ADMIN_ROLES = ['owner', 'manager', 'kasir', 'barista'] as const;

/** Role yang boleh melihat laporan & dashboard keuangan. */
export const REPORT_ROLES = ['owner', 'manager', 'finance'] as const;

/** Role yang boleh menulis katalog (menu). */
export const MENU_WRITE_ROLES = ['owner', 'manager'] as const;

/** Role yang outlet-nya terkunci ke `user.outlet_id` (tidak boleh ganti outlet). */
export const OUTLET_LOCKED_ROLES = ['kasir', 'barista'] as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  finance: 'Finance',
  kasir: 'Kasir',
  barista: 'Barista',
  member: 'Member',
  guest: 'Tamu',
};

/** `owner` selalu lolos (mirror `requireRole` backend). */
export function hasRole(role: string | null | undefined, allowed: readonly string[]): boolean {
  if (!role) return false;
  if (role === 'owner') return true;
  return (allowed as readonly string[]).includes(role);
}

export function isStaff(role?: string | null): boolean {
  return hasRole(role, ADMIN_ROLES);
}

export function isOwner(role?: string | null): boolean {
  return role === 'owner';
}

export function canAccessReports(role?: string | null): boolean {
  return hasRole(role, REPORT_ROLES);
}

export function canWriteMenu(role?: string | null): boolean {
  return hasRole(role, MENU_WRITE_ROLES);
}

export function roleLabel(role?: string | null): string {
  if (!role) return 'Tamu';
  return ROLE_LABELS[role] ?? role;
}
