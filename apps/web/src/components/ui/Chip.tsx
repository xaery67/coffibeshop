import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Chip — pola chip/segmented reusable (audit M6: hilangkan 3 duplikasi class).
 * Varian visual lewat props; peran ARIA (radio/checkbox/tab) ditentukan pemanggil.
 * Chip terpilih ditandai border + ikon ✓ (bukan warna saja — WCAG 1.4.1).
 */

export function chipClasses({
  selected = false,
  disabled = false,
  className = '',
}: {
  selected?: boolean;
  disabled?: boolean;
  className?: string;
} = {}): string {
  return [
    'inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border px-4 text-sm transition',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
    selected ? 'border-brand bg-brand-50 font-semibold text-brand' : 'border-border bg-white text-text',
    disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-brand-500/50',
    // Tanda ✓ terpilih lewat CSS (::before), bukan node teks: aksesibilitas tetap
    // dibawa `aria-checked`, sementara `textContent` chip bersih = label saja.
    selected && "before:content-['✓'] before:text-brand",
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  children: ReactNode;
}

export function Chip({ selected = false, disabled = false, className = '', children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={chipClasses({ selected, disabled, className })}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Container chip dengan peran ARIA eksplisit (radiogroup / group / tablist). */
export function ChipGroup({
  role,
  label,
  className = '',
  children,
  ...rest
}: {
  role?: 'radiogroup' | 'group' | 'tablist';
  label?: string;
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role={role}
      aria-label={label}
      className={['flex flex-wrap gap-2', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
