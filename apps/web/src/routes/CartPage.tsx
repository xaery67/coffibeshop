import { Link } from 'react-router-dom';
import { useCartStore, type Fulfillment } from '../stores/cart.store.js';
import { useConfig } from '../hooks/useConfig.js';
import { computeTotals, formatIDR, lineSubtotal } from '../lib/pricing.js';
import { Button } from '../components/ui/Button.js';
import { EmptyState } from '../components/domain/States.js';
import { QuantityStepper } from '../components/domain/QuantityStepper.js';

const FULFILLMENT_LABELS: { value: Fulfillment; label: string }[] = [
  { value: 'pickup', label: 'Ambil di outlet' },
  { value: 'dine_in', label: 'Dine-in' },
  { value: 'delivery', label: 'Delivery' },
];

/** Cart (PRD-FRONTEND §2.3-D) — memakai PricingEngine (satu sumber harga, §6.4). */
export function CartPage() {
  const { items, setQty, remove, fulfillment, setFulfillment } = useCartStore();
  const { data: config } = useConfig();

  const totals = computeTotals({
    lines: items.map((i) => ({
      basePrice: i.base_price,
      variantDelta: i.variant?.priceAdjustment ?? 0,
      options: i.options.map((o) => ({ priceAdjustment: o.priceAdjustment, qty: 1 })),
      quantity: i.qty,
    })),
    taxRate: config?.tax_rate ?? 0,
    deliveryFee: fulfillment === 'delivery' ? config?.shipping_flat_fee ?? 0 : 0,
  });

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold text-text">Keranjang</h1>

      {items.length === 0 ? (
        <EmptyState
          title="Keranjang masih kosong"
          description="Yuk pilih kopi favoritmu dulu."
          action={
            <Link to="/menu">
              <Button>Lihat Menu</Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-brand-100 rounded-card border border-brand-100 bg-white">
            {items.map((i) => (
              <li key={i.id} className="flex items-start gap-3 p-4">
                <div className="flex-1">
                  <p className="font-medium text-text">{i.product_name}</p>
                  {(i.variant || i.options.length > 0) && (
                    <p className="mt-0.5 text-xs text-text-muted">
                      {[i.variant?.name, ...i.options.map((o) => o.name)].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {i.note && <p className="mt-0.5 text-xs italic text-text-muted">“{i.note}”</p>}
                  <p className="mt-1 tabular-nums text-sm text-text-muted">
                    {formatIDR(i.unit_price)} × {i.qty} = <strong>{formatIDR(lineSubtotal({
                      basePrice: i.base_price,
                      variantDelta: i.variant?.priceAdjustment ?? 0,
                      options: i.options.map((o) => ({ priceAdjustment: o.priceAdjustment, qty: 1 })),
                      quantity: i.qty,
                    }))}</strong>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <QuantityStepper value={i.qty} onChange={(qty) => setQty(i.id, qty)} label={`Kuantitas ${i.product_name}`} />
                  <button
                    type="button"
                    onClick={() => remove(i.id)}
                    className="text-sm text-error hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <fieldset className="rounded-card border border-brand-100 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-text">Metode pengambilan</legend>
            <div className="flex flex-wrap gap-2">
              {FULFILLMENT_LABELS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={fulfillment === f.value}
                  onClick={() => setFulfillment(f.value)}
                  className={[
                    'min-h-[44px] rounded-pill border px-4 text-sm transition',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
                    fulfillment === f.value
                      ? 'border-brand bg-brand-50 font-semibold text-brand'
                      : 'border-border bg-white text-text hover:border-brand-500/50',
                  ].join(' ')}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1 rounded-card border border-brand-100 bg-white p-4 text-sm tabular-nums" aria-live="polite">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatIDR(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Pajak</span>
              <span>{formatIDR(totals.tax)}</span>
            </div>
            {totals.deliveryFee > 0 && (
              <div className="flex justify-between">
                <span>Ongkir</span>
                <span>{formatIDR(totals.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-brand-100 pt-1 font-bold text-brand">
              <span>Total</span>
              <span>{formatIDR(totals.grandTotal)}</span>
            </div>
          </div>

          <Button block size="lg">
            Checkout
          </Button>
        </>
      )}
    </section>
  );
}
