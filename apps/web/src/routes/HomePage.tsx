import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="space-y-6">
      <div className="rounded-card bg-brand p-8 text-brand-fg">
        <h1 className="text-2xl font-bold sm:text-3xl">Pesan kopi favoritmu, tanpa antre ☕</h1>
        <p className="mt-2 max-w-xl text-brand-100">
          Pesan online, bayar QRIS, lacak pesanan real-time, ambil saat siap. Selesai &lt; 90 detik.
        </p>
        <Link
          to="/menu"
          className="mt-4 inline-block rounded-lg bg-white px-5 py-2.5 font-semibold text-brand hover:bg-brand-50"
        >
          Lihat Menu
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { t: 'Pesan Cepat', d: 'Checkout ≤ 5 langkah dari cart.' },
          { t: 'Lacak Real-time', d: 'Status pesanan via SSE, update < 5 detik.' },
          { t: 'Poin Loyalty', d: 'Kumpulkan poin tiap transaksi.' },
        ].map((f) => (
          <div key={f.t} className="rounded-card border border-brand-100 bg-white p-5">
            <h3 className="font-semibold text-brand">{f.t}</h3>
            <p className="mt-1 text-sm text-neutral-600">{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
