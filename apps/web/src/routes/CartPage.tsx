import { Link } from 'react-router-dom';
import { useCartStore } from '../stores/cart.store.js';
import { useConfig } from '../hooks/useConfig.js';

export function CartPage() {
  const { items, setQty, remove, fulfillment, setFulfillment } = useCartStore();
  const { data: config } = useConfig();

  const subtotal = items.reduce((n, i) => n + i.unit_price * i.qty, 0);
  const tax = Math.round(subtotal * (config?.tax_rate ?? 0.11));
  const shipping = fulfillment === 'delivery' ? config?.shipping_flat_fee ?? 0 : 0;
  const total = subtotal + tax + shipping;

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold text-brand">Keranjang</h1>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Keranjang kosong. <Link to="/menu" className="text-brand underline">Lihat menu</Link>
        </p>
      ) : (
        <>
          <ul className="divide-y divide-brand-100 rounded-card border border-brand-100 bg-white">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="font-medium">{i.product_name}</p>
                  <p className="text-sm tabular-nums text-neutral-500">
                    Rp {i.unit_price.toLocaleString('id-ID')}
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  value={i.qty}
                  onChange={(e) => setQty(i.id, Number(e.target.value))}
                  className="w-16 rounded border border-brand-100 px-2 py-1 text-center"
                />
                <button onClick={() => remove(i.id)} className="text-sm text-error hover:underline">
                  Hapus
                </button>
              </li>
            ))}
          </ul>

          <div className="rounded-card border border-brand-100 bg-white p-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={fulfillment === 'pickup'}
                onChange={() => setFulfillment('pickup')}
              />
              Ambil di outlet
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={fulfillment === 'delivery'}
                onChange={() => setFulfillment('delivery')}
              />
              Delivery
            </label>
          </div>

          <div className="space-y-1 rounded-card border border-brand-100 bg-white p-4 text-sm tabular-nums">
            <div className="flex justify-between"><span>Subtotal</span><span>Rp {subtotal.toLocaleString('id-ID')}</span></div>
            <div className="flex justify-between"><span>Pajak</span><span>Rp {tax.toLocaleString('id-ID')}</span></div>
            {shipping > 0 && <div className="flex justify-between"><span>Ongkir</span><span>Rp {shipping.toLocaleString('id-ID')}</span></div>}
            <div className="flex justify-between border-t border-brand-100 pt-1 font-bold text-brand">
              <span>Total</span><span>Rp {total.toLocaleString('id-ID')}</span>
            </div>
          </div>

          <button className="w-full rounded-lg bg-brand py-3 font-semibold text-brand-fg hover:bg-brand-600">
            Checkout
          </button>
        </>
      )}
    </section>
  );
}
