import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Header, CartFAB, Footer } from './components/layout/Shell.js';
import { ProductCardSkeleton } from './components/domain/ProductCard.js';

/**
 * Route-level code splitting (PRD-FRONTEND §5.3) — semua halaman di-lazy load.
 * AdminShell di-`import()` terpisah → bundle admin TIDAK masuk ke bundle customer.
 */
const HomePage = lazy(() => import('./routes/HomePage.js').then((m) => ({ default: m.HomePage })));
const MenuPage = lazy(() => import('./routes/MenuPage.js').then((m) => ({ default: m.MenuPage })));
const ProductDetailPage = lazy(() =>
  import('./routes/ProductDetailPage.js').then((m) => ({ default: m.ProductDetailPage })),
);
const CartPage = lazy(() => import('./routes/CartPage.js').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() =>
  import('./routes/CheckoutPage.js').then((m) => ({ default: m.CheckoutPage })),
);
const PaymentPage = lazy(() =>
  import('./routes/PaymentPage.js').then((m) => ({ default: m.PaymentPage })),
);
const TrackPage = lazy(() => import('./routes/TrackPage.js').then((m) => ({ default: m.TrackPage })));
const OrderHistoryPage = lazy(() =>
  import('./routes/OrderHistoryPage.js').then((m) => ({ default: m.OrderHistoryPage })),
);
const ProfilePage = lazy(() =>
  import('./routes/ProfilePage.js').then((m) => ({ default: m.ProfilePage })),
);
/** Login staff/owner — halaman mandiri (issue #60). */
const LoginPage = lazy(() => import('./routes/LoginPage.js').then((m) => ({ default: m.LoginPage })));

/** Admin — shell & halaman terpisah (bundle sendiri). */
const AdminRoutes = lazy(() => import('./routes/admin/AdminRoutes.js').then((m) => ({ default: m.AdminRoutes })));

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

/** CustomerShell — header, nav, cart FAB, footer (PRD-FRONTEND §2.1). */
function CustomerShell() {
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
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/payment/:orderId" element={<PaymentPage />} />
            <Route path="/track/:token?" element={<TrackPage />} />
            <Route path="/orders" element={<OrderHistoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <CartFAB />
      <Footer />
    </div>
  );
}

/**
 * Root aplikasi. Dua shell terpisah: `/admin/*` memakai `AdminShell` (lazy),
 * sisanya `CustomerShell`. `/login` mandiri (tanpa chrome customer) — issue #60.
 * Pemisahan route di level ini memastikan customer tidak pernah mengunduh kode admin.
 */
export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin/*" element={<AdminRoutes />} />
        <Route path="/*" element={<CustomerShell />} />
      </Routes>
    </Suspense>
  );
}
