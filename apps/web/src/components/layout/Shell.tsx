import { NavLink, Link } from 'react-router-dom';
import { useCartStore } from '../../stores/cart.store.js';

// M9 (audit): nav hanya untuk halaman yang SUDAH ada & patuh. `/orders`, `/profile`
// (Sprint 3/#12) dan `/track` (TrackPage masih non-token — audit T2/T3/T4, Sprint 3)
// tidak ditampilkan agar tidak ada tautan menyesatkan / halaman belum patuh.
const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/menu', label: 'Menu' },
];

/** Header + navigasi utama CustomerShell (PRD-FRONTEND §2.1). */
export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-brand-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link to="/" className="text-lg font-bold text-brand" aria-label="CoffeeShop Online — beranda">
          ☕ CoffeeShop
        </Link>
        <nav aria-label="Navigasi utama" className="ml-auto flex items-center gap-1 text-sm">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'rounded-lg px-3 py-2 min-h-[44px] inline-flex items-center transition',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
                  isActive ? 'bg-brand-50 font-semibold text-brand' : 'text-text hover:bg-brand-50',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

/** CartFAB — tombol keranjang melayang dengan badge qty realtime (PRD §2.1). */
export function CartFAB() {
  const count = useCartStore((s) => s.items.reduce((n, i) => n + i.qty, 0));
  return (
    <Link
      to="/cart"
      aria-label={`Keranjang, ${count} item`}
      className="fixed bottom-6 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-elev-fab transition hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span aria-hidden="true" className="text-xl">
        🛒
      </span>
      {count > 0 && (
        <span
          className="tabular-nums absolute -right-1 -top-1 min-w-[22px] rounded-full bg-error px-1.5 text-center text-xs font-bold text-white"
          aria-hidden="true"
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/** Footer CustomerShell. */
export function Footer() {
  return (
    <footer className="border-t border-brand-100 py-6 text-center text-xs text-text-muted">
      © 2026 CoffeeShop Online · MVP v0.1
    </footer>
  );
}
