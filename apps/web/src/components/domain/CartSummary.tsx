import type { Totals } from '../../lib/pricing.js';
import { formatIDR } from '../../lib/pricing.js';

/**
 * CartSummary — ringkasan harga (UX-FLOWS §2, DESIGN-SYSTEM §8.2).
 * Urutan: Subtotal → Voucher → Poin → Pajak → Ongkir → Total. `aria-live="polite"`.
 * `showPoints` menyembunyikan baris poin bila nol (agar tidak berisik).
 */
export function CartSummary({
  totals,
  showPoints = true,
}: {
  totals: Totals;
  showPoints?: boolean;
}) {
  return (
    <dl className="space-y-1 rounded-card border border-brand-100 bg-white p-4 text-sm tabular-nums" aria-live="polite">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd>{formatIDR(totals.subtotal)}</dd>
      </div>
      {totals.discount > 0 && (
        <div className="flex justify-between text-success">
          <dt>Voucher</dt>
          <dd>−{formatIDR(totals.discount)}</dd>
        </div>
      )}
      {showPoints && totals.pointsDiscount > 0 && (
        <div className="flex justify-between text-success">
          <dt>Poin</dt>
          <dd>−{formatIDR(totals.pointsDiscount)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt>Pajak</dt>
        <dd>{formatIDR(totals.tax)}</dd>
      </div>
      {totals.deliveryFee > 0 && (
        <div className="flex justify-between">
          <dt>Ongkir</dt>
          <dd>{formatIDR(totals.deliveryFee)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-brand-100 pt-1 font-bold text-brand">
        <dt>Total</dt>
        <dd>{formatIDR(totals.grandTotal)}</dd>
      </div>
    </dl>
  );
}
