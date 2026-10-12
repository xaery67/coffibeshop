import type { ReactNode } from 'react';

type BadgeVariant = 'bestseller' | 'promo' | 'success' | 'warning' | 'error' | 'neutral';

const VARIANTS: Record<BadgeVariant, string> = {
  bestseller: 'bg-accent text-accent-fg',
  promo: 'bg-brand text-brand-fg',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning-fg',
  error: 'bg-error/10 text-error',
  neutral: 'bg-brand-50 text-text-muted',
};

/**
 * Badge — pil status kecil (DESIGN-SYSTEM §5.4).
 * Status selalu disertai ikon/teks, bukan warna saja (WCAG 1.4.1).
 */
export function Badge({
  variant = 'neutral',
  icon,
  children,
  className = '',
}: {
  variant?: BadgeVariant;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-caption font-semibold',
        VARIANTS[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon && (
        <span aria-hidden="true" className="text-[1em] leading-none">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
