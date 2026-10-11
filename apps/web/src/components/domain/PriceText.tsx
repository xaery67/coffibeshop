import { formatIDR } from '../../lib/pricing.js';

/** PriceText — format Rupiah terpusat + tabular-nums (PRD-FRONTEND §6.3). */
export function PriceText({
  value,
  className = '',
  size = 'md',
}: {
  value: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeCls = { sm: 'text-sm', md: 'text-base', lg: 'text-xl' }[size];
  return (
    <span className={['tabular-nums font-bold text-brand', sizeCls, className].filter(Boolean).join(' ')}>
      {formatIDR(value)}
    </span>
  );
}
