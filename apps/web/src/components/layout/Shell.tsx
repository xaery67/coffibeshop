import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useCartStore } from '../../stores/cart.store.js';
import { useAuth } from '../../hooks/useAuth.js';

// Nav utama customer (PRD-FRONTEND §7.2 — mobile-first: BottomNav, bukan header horizontal).
// Ikon + label; tab aktif ditandai warna brand + `aria-current` (dari NavLink).
const NAV = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/menu', label: 'Menu', icon: '☕', end: false },
  { to: '/orders', label: 'Pesanan', icon: '🧾', end: false },
  { to: '/profile', label: 'Profil', icon: '👤', end: false },
] as const;

const iconLinkCls =
  'relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-xl text-text transition hover:bg-brand-50 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]';

/**
 * Header customer (PRD-FRONTEND §7.2) — disederhanakan agar mobile-first.
 *
 * Hanya **logo** (kiri) + **ikon keranjang & akun** (kanan). Nav horizontal 4 item
 * DIPINDAH ke `BottomNav`, sehingga header tak lagi memaksa lebar ≥395 px
 * (akar overflow di HP 375 px, issue #65). Tombol akun menutup logout customer
 * (#64): tamu → ikon Masuk (tautan `/login`), sesi aktif → tombol Keluar.
 */
export function Header() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const count = useCartStore((s) => s.items.reduce((n, i) => n + i.qty, 0));

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-20 border-b border-brand-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
        <Link
          to="/"
          className="flex min-h-[44px] min-w-0 items-center gap-1.5 text-lg font-bold text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          aria-label="CoffeeShop Online — beranda"
        >
          <span aria-hidden="true">☕</span>
          <span className="truncate">CoffeeShop</span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Link to="/cart" aria-label={`Keranjang, ${count} item`} className={iconLinkCls}>
            <span aria-hidden="true">🛒</span>
            {count > 0 && (
              <span
                className="tabular-nums absolute -right-0.5 -top-0.5 min-w-[20px] rounded-full bg-error px-1 text-center text-caption font-bold text-white"
                aria-hidden="true"
              >
                {count}
              </span>
            )}
          </Link>

          {isAuthenticated ? (
            <button type="button" onClick={handleLogout} aria-label="Keluar" title="Keluar" className={iconLinkCls}>
              <span aria-hidden="true">🚪</span>
            </button>
          ) : (
            <Link to="/login" aria-label="Masuk" title="Masuk" className={iconLinkCls}>
              <span aria-hidden="true">👤</span>
            </Link>
          )}
        </div>
      </div>
      {isAuthenticated && user?.full_name && (
        <p className="sr-only">Masuk sebagai {user.full_name}</p>
      )}
    </header>
  );
}

/**
 * BottomNav — navigasi utama customer (PRD-FRONTEND §7.2: "bottom nav + sticky CTA").
 *
 * 4 tab; tab aktif berwarna brand + `aria-current="page"` (NavLink). Target sentuh
 * ≥44×44 px, aman dari home-indicator iOS via `env(safe-area-inset-bottom)`.
 * Hanya dirender di `CustomerShell` → otomatis tersembunyi di `/login` & `/admin/*`.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-100 bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-5xl items-stretch">
        {NAV.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-1.5 text-caption transition',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-focus)]',
                  isActive ? 'font-semibold text-brand' : 'text-text-muted hover:bg-brand-50',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span aria-hidden="true" className="text-xl leading-none">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  {isActive && <span className="sr-only">(halaman aktif)</span>}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** CartFAB — tombol keranjang melayang dengan badge qty realtime (PRD §2.1). */
export function CartFAB() {
  const count = useCartStore((s) => s.items.reduce((n, i) => n + i.qty, 0));
  return (
    <Link
      to="/cart"
      aria-label={`Keranjang, ${count} item`}
      className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-elev-fab transition hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
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
