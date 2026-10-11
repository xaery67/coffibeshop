import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Header, CartFAB, Footer } from './components/layout/Shell.js';
import { ProductCardSkeleton } from './components/domain/ProductCard.js';

/**
 * Route-level code splitting (PRD-FRONTEND §5.3) — semua halaman di-lazy load
 * agar bundle awal customer tetap kecil. Shell (Header/CartFAB/Footer) dimuat sinkron.
 */
const HomePage = lazy(() => import('./routes/HomePage.js').then((m) => ({ default: m.HomePage })));
const MenuPage = lazy(() => import('./routes/MenuPage.js').then((m) => ({ default: m.MenuPage })));
const ProductDetailPage = lazy(() =>
  import('./routes/ProductDetailPage.js').then((m) => ({ default: m.ProductDetailPage })),
);
const CartPage = lazy(() => import('./routes/CartPage.js').then((m) => ({ default: m.CartPage })));
const TrackPage = lazy(() => import('./routes/TrackPage.js').then((m) => ({ default: m.TrackPage })));
const AdminPage = lazy(() => import('./routes/AdminPage.js').then((m) => ({ default: m.AdminPage })));

/** Fallback skeleton saat chunk halaman dimuat. */
function RouteFallback() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Memuat halaman">
      {Array.from({ length: 3 }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Shell aplikasi — CustomerShell (PRD-FRONTEND §2.1). */
export function App() {
  return (
    <div className="flex min-h-screen flex-col bg-brand-50 text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-fg"
      >
        Lompat ke konten utama
      </a>
      <Header />

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/product/:id" element={<ProductDetailPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/track/:token?" element={<TrackPage />} />
            <Route path="/admin" element={<AdminPage />} />
            {/* Placeholder route lain (Sprint berikutnya) — arahkan ke halaman terkait. */}
            <Route path="/orders" element={<Navigate to="/menu" replace />} />
            <Route path="/profile" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <CartFAB />
      <Footer />
    </div>
  );
}
