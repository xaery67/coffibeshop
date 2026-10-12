import { roleLabel } from '../../lib/roles.js';

/**
 * RoleBadge — pil identitas role staf di Topbar (PRD-FRONTEND §2.4).
 * Owner diberi warna berbeda; teks selalu ada (WCAG 1.4.1).
 */
export function RoleBadge({ role, outletName }: { role?: string | null; outletName?: string | null }) {
  const isOwner = role === 'owner';
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-caption font-semibold',
        isOwner ? 'bg-brand text-brand-fg' : 'bg-brand-100 text-brand-700',
      ].join(' ')}
      data-testid="role-badge"
    >
      <span aria-hidden="true">{isOwner ? '👑' : '🎫'}</span>
      {roleLabel(role)}
      {outletName && <span className="font-normal opacity-80">· {outletName}</span>}
    </span>
  );
}
