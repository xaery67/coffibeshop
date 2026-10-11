import { Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './routes/HomePage.js';
import { MenuPage } from './routes/MenuPage.js';
import { CartPage } from './routes/CartPage.js';
import { TrackPage } from './routes/TrackPage.js';
import { AdminPage } from './routes/AdminPage.js';
import { useCartStore } from './stores/cart.store.js';

/** Shell aplikasi — CustomerShell + AdminShell (PRD-FRONTEND §2). */
export function App() {
  const count = useCartStore((s) => s.items.reduce((n, i) => n + i.qty, 0));

  return (
    <div className="min-h-screen bg-brand-50 text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-brand-100 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link to="/" className="font-bold text-brand">☕ CoffeeShop</Link>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <Link to="/menu" className="hover:text-brand">Menu</Link>
            <Link to="/track" className="hover:text-brand">Lacak</Link>
            <Link to="/admin" className="hover:text-brand">Admin</Link>
            <Link to="/cart" className="relative hover:text-brand">
              Cart
              {count > 0 && (
                <span className="absolute -right-4 -top-2 rounded-full bg-brand px-1.5 text-xs text-white">
                  {count}
                </span>
              )}
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/track/:token?" element={<TrackPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>

      <footer className="border-t border-brand-100 py-6 text-center text-xs text-neutral-500">
        © 2026 CoffeeShop Online · MVP v0.1
      </footer>
    </div>
  );
}
