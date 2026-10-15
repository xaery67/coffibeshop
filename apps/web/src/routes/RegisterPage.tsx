import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AuthResultDTO } from '@coffibeshop/shared';
import { apiFetch } from '../lib/api.js';
import { setSession, type SessionUser } from '../hooks/useAuth.js';
import { isStaff } from '../lib/roles.js';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';

/**
 * RegisterPage — pendaftaran akun member (issue #60 lanjutan, PRD-FRONTEND §2.2).
 *
 * Pelanggan TIDAK wajib mendaftar untuk memesan (guest checkout tetap jalan).
 * Akun berguna untuk riwayat pesanan, poin loyalitas, dan alamat tersimpan.
 * Setelah sukses kami langsung menyimpan sesi (auto-login) dan mengembalikan
 * pengguna ke `?next=` (aman, internal) atau beranda.
 *
 * Cart guest otomatis digabung oleh backend via header `X-Guest-Id` (ADR-011).
 */

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

/** Nomor HP Indonesia opsional: 08xx / +628xx / 628xx. */
const PHONE_RE = /^(\+?62|0)8[1-9][0-9]{6,11}$/;

interface FieldErrors {
  full_name?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirm_password?: string;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const next = safeNext(new URLSearchParams(location.search).get('next'));

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (fullName.trim().length < 2) errs.full_name = 'Nama minimal 2 karakter';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = 'Format email tidak valid';
    if (phone.trim() && !PHONE_RE.test(phone.trim())) {
      errs.phone = 'Nomor HP tidak valid (contoh: 08123456789)';
    }
    if (password.length < 8) errs.password = 'Password minimal 8 karakter';
    else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      errs.password = 'Password harus memuat huruf dan angka';
    }
    if (confirm !== password) errs.confirm_password = 'Konfirmasi password tidak sama';
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const res = await apiFetch<AuthResultDTO>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          password,
        }),
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
      setError((err as Error).message || 'Gagal mendaftar. Coba lagi.');
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
            <h1 className="text-h1 text-text">Daftar</h1>
            <p className="text-sm text-text-muted">
              Buat akun untuk riwayat pesanan, poin, dan alamat tersimpan. Tetap bisa memesan tanpa
              akun.
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
              label="Nama lengkap"
              required
              type="text"
              autoComplete="name"
              autoFocus
              value={fullName}
              error={fieldErrors.full_name}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nama kamu"
            />
            <Input
              label="Email"
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              error={fieldErrors.email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
            />
            <Input
              label="Nomor HP (opsional)"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              error={fieldErrors.phone}
              hint="Contoh: 08123456789"
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Password"
              required
              type="password"
              autoComplete="new-password"
              value={password}
              error={fieldErrors.password}
              hint="Minimal 8 karakter, kombinasi huruf & angka"
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              label="Konfirmasi password"
              required
              type="password"
              autoComplete="new-password"
              value={confirm}
              error={fieldErrors.confirm_password}
              onChange={(e) => setConfirm(e.target.value)}
            />

            <Button type="submit" block size="lg" loading={submitting}>
              Daftar
            </Button>
          </form>

          <p className="text-center text-sm text-text-muted">
            Sudah punya akun?{' '}
            <Link
              to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
              className="rounded text-brand underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              Masuk
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
