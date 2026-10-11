import { useState } from 'react';
import { useProducts } from '../hooks/useProducts.js';
import { useCartStore } from '../stores/cart.store.js';

export function MenuPage() {
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useProducts(q);
  const add = useCartStore((s) => s.add);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-brand">Menu</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari kopi…"
          className="w-56 rounded-lg border border-brand-100 px-3 py-2 text-sm"
        />
      </div>

      {isLoading && <p className="text-sm text-neutral-500">Memuat menu…</p>}
      {error && <p className="text-sm text-error">Gagal memuat menu. Pastikan API berjalan.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.data?.map((p) => (
          <article key={p.id} className="flex flex-col rounded-card border border-brand-100 bg-white p-4">
            <h3 className="font-semibold">{p.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{p.description}</p>
            <p className="mt-2 font-semibold tabular-nums text-brand">
              Rp {Number(p.base_price).toLocaleString('id-ID')}
            </p>
            <button
              onClick={() =>
                add({
                  product_id: p.id,
                  product_name: p.name,
                  option_ids: [],
                  qty: 1,
                  unit_price: Number(p.base_price),
                })
              }
              className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand-600"
            >
              Tambah
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
