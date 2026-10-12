import { useState } from 'react';
import { formatIDR } from '../../lib/pricing.js';

export interface SummaryItem {
  id?: string;
  product_name?: string;
  qty?: number;
  unit_price?: number;
}

/**
 * OrderItemsSummary — ringkasan item order, collapsible (UX-FLOWS §5).
 * `aria-expanded` pada tombol; daftar `<ul>` agar terbaca screen reader.
 */
export function OrderItemsSummary({ items }: { items: SummaryItem[] }) {
  const [open, setOpen] = useState(false);
  const count = items.reduce((n, i) => n + (i.qty ?? 0), 0);

  return (
    <div className="rounded-card border border-brand-100 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
      >
        <span>▸ Ringkasan item ({count})</span>
        <span aria-hidden="true" className="text-text-muted">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-brand-100 border-t border-brand-100">
          {items.map((i, idx) => (
            <li key={i.id ?? idx} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span className="text-text">
                {i.qty ?? 1}× {i.product_name ?? 'Item'}
              </span>
              {typeof i.unit_price === 'number' && (
                <span className="tabular-nums text-text-muted">
                  {formatIDR((i.unit_price ?? 0) * (i.qty ?? 1))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
