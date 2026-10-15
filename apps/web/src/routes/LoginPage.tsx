import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AuthResultDTO } from '@coffibeshop/shared';
import { apiFetch } from '../lib/api.js';
import { setSession, type SessionUser } from '../hooks/useAuth.js';
import { isStaff } from '../lib/roles.js';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';

/**
 * LoginPage — masuk sebagai staff/owner (issue #60, PRD-FRONTEND §2.2).
 *
 * `RoleGuard` mengarahkan tamu ke `/login?next=<path>`; setelah sukses kami
 * mengembalikan mereka ke `next` (atau `/admin` untuk staff, `/` untuk member).
 * Form TIDAK memengaruhi alur guest checkout (guest tetap bisa memesan tanpa login).
 */

/** Field identitas tunggal: email ATAU nomor HP (kontrak `LoginInput`). */
function identityPayload(identity: string): { email: string } | { phone: string } {
  const value = identity.trim();
  return value.includes('@') ? { email: value.toLowerCase() } : { phone: value };
}

/** Hanya izinkan tujuan internal ('/…') agar `?next=` tak jadi open redirect. */
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    path = raw;
  }
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return path;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const next = safeNext(new URLSearchParams(location.search).get('next'));

  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ identity?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errs: { identity?: string; password?: string } = {};
    if (!identity.trim()) errs.identity = 'Isi email atau nomor HP';
    if (!password) errs.password = 'Password wajib diisi';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const res = await apiFetch<AuthResultDTO>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ ...identityPayload(identity), password }),
      });

      const user: SessionUser = {
        id: res.user.id,
        email: res.user.email,
        full_name: res.user.full_name,
        role: res.user.role,
        outlet_id: res.user.outlet_id ?? null,
      };
      setSession(res.access_token, user);

      navigate(next ?? (isStaff(user.role) ? '/admin' : '/'), { replace: true });
    } catch (err) {
      setError((err as Error).message || 'Gagal masuk. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-50 text-text">
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <section className="space-y-5 rounded-card border border-brand-100 bg-white p-6 shadow-elev1">
          <header className="space-y-1 text-center">
            <p aria-hidden="true" className="text-2xl">
              ☕
            </p>
            <h1 className="text-h1 text-text">Masuk</h1>
            <p className="text-sm text-text-muted">
              Untuk staf &amp; owner outlet. Pelanggan tidak perlu masuk untuk memesan.
            </p>
          </header>

          {error && (
            <p
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Email atau nomor HP"
              required
              type="text"
              inputMode="email"
              autoComplete="username"
              autoFocus
              value={identity}
              error={fieldErrors.identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder="owner@coffibeshop.id atau 08123456789"
            />
            <Input
              label="Password"
              required
              type="password"
              autoComplete="current-password"
              value={password}
              error={fieldErrors.password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button type="submit" block size="lg" loading={submitting}>
              Masuk
            </Button>
          </form>

          <p className="text-center text-sm">
            Belum punya akun?{' '}
            <Link
              to={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}
              className="rounded text-brand underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              Daftar
            </Link>
          </p>

          <p className="text-center text-sm">
            <Link
              to="/"
              className="rounded text-brand underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              ← Kembali ke toko
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
