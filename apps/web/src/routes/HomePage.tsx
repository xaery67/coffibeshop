import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts.js';
import { ProductCard, ProductCardSkeleton } from '../components/domain/ProductCard.js';
import { EmptyState, ErrorState } from '../components/domain/States.js';
import { buttonClasses } from '../components/ui/Button.js';

const VALUE_PROPS = [
  { icon: '⚡', t: 'Pesan Cepat', d: 'Checkout ≤ 5 langkah dari keranjang.' },
  { icon: '📍', t: 'Lacak Real-time', d: 'Status pesanan update < 5 detik.' },
  { icon: '⭐', t: 'Poin Loyalty', d: 'Kumpulkan poin tiap transaksi.' },
];

/** Home / Rekomendasi (PRD-FRONTEND §2.3-A) — hero + value props + rekomendasi. */
export function HomePage() {
  const { data, isLoading, error, refetch } = useProducts();
  const featured = data?.data?.slice(0, 3) ?? [];

  return (
    <section className="space-y-8">
      {/* Hero */}
      <div className="rounded-card bg-brand p-8 text-brand-fg">
        <h1 className="text-display">Pesan kopi favoritmu, tanpa antre ☕</h1>
        <p className="mt-2 max-w-xl text-brand-fg/90">
          Pesan online, bayar QRIS, lacak pesanan real-time, ambil saat siap. Selesai &lt; 90 detik.
        </p>
        <Link
          to="/menu"
          className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'mt-5' })}
        >
          Lihat Menu
        </Link>
      </div>

      {/* Value props */}
      <div className="grid gap-4 sm:grid-cols-3">
        {VALUE_PROPS.map((f) => (
          <div key={f.t} className="rounded-card border border-brand-100 bg-white p-5 shadow-elev1">
            <span className="text-2xl" aria-hidden="true">
              {f.icon}
            </span>
            <h2 className="mt-1 text-h3 font-semibold text-brand">{f.t}</h2>
            <p className="mt-1 text-sm text-text-muted">{f.d}</p>
          </div>
        ))}
      </div>

      {/* Rekomendasi */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-h2 font-bold text-text">Rekomendasi untukmu</h2>
          <Link to="/menu" className="text-sm font-medium text-brand hover:underline">
            Lihat semua
          </Link>
        </div>
        {error ? (
          <ErrorState message="Gagal memuat rekomendasi." onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <EmptyState title="Belum ada rekomendasi" description="Cek menu lengkap kami, ya." />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {featured.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </section>
  );
}
