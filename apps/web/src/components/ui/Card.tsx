import type { HTMLAttributes, ReactNode } from 'react';

type CardVariant = 'product' | 'order' | 'kpi';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  interactive?: boolean;
  children: ReactNode;
}

/**
 * Card — primitive design system (PRD-FRONTEND §6.2, UX §3.5).
 * Radius md (12px), elev-1, rasio gambar 1:1 / 4:3 pada kartu produk.
 */
export function Card({
  variant = 'product',
  interactive = false,
  className = '',
  children,
  ...rest
}: CardProps) {
  const base = 'rounded-card border border-brand-100 bg-white shadow-elev1';
  const interactiveCls = interactive
    ? 'transition hover:border-brand-500/40 hover:shadow-hover focus-within:border-brand-500/40'
    : '';
  const variantCls = variant === 'kpi' ? 'p-5' : 'p-4';

  return (
    <div className={[base, interactiveCls, variantCls, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
