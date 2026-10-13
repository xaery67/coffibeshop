import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  children: ReactNode;
}

/**
 * Button — primitive design system (PRD-FRONTEND §6.2, UX §3.5).
 * Target sentuh ≥ 44px (WCAG 2.5.5); varian & ukuran lewat props, bukan fork.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand-600 active:bg-brand-700',
  secondary: 'bg-brand-100 text-brand-700 hover:bg-brand-50',
  ghost: 'bg-transparent text-brand hover:bg-brand-50',
  danger: 'bg-error text-white hover:brightness-95',
};

const SIZES: Record<Size, string> = {
  sm: 'min-h-[44px] px-3 text-sm',
  md: 'min-h-[44px] px-4 text-sm',
  lg: 'min-h-[48px] px-6 text-base',
};

/**
 * Kelas tombol reusable — dipakai `Button` DAN elemen non-`<button>`
 * (mis. `<Link>`), agar tidak ada nested interactive `<a><button>` (audit T5).
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
}: {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
} = {}): string {
  return [
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    block ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const classes = buttonClasses({ variant, size, block, className });

  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
