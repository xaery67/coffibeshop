import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { PaymentMethod } from '@coffibeshop/shared';
import { useConfig } from '../hooks/useConfig.js';
import { useOrderTracking } from '../hooks/useOrderTracking.js';
import { formatIDR } from '../lib/pricing.js';
import { paymentLabel, paymentUiStatus, type PaymentUiStatus } from '../lib/checkout.js';
import { postInitiatePayment, type InitiatePaymentResult } from '../lib/orders.js';
import { Button, buttonClasses } from '../components/ui/Button.js';
import { Chip, ChipGroup } from '../components/ui/Chip.js';
import { Badge } from '../components/ui/Badge.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/domain/States.js';
import { Toast } from '../components/ui/Toast.js';

interface PaymentNavState {
  orderNumber?: string;
  trackingToken?: string;
  amount?: number;
  method?: PaymentMethod;
  contact?: { full_name: string; phone: string; email?: string };
}

const SESSION_KEY = (orderId: string) => `cs.pay.${orderId}`;

/** Halaman Pembayaran (UX-FLOWS.md §4) — status pending/paid/failed/expired. */
export function PaymentPage() {
  const { orderId = '' } = useParams();
  const location = useLocation();
  const navState = (location.state ?? {}) as PaymentNavState;
  const { data: config } = useConfig();

  // Persist ringkasan ke sessionStorage agar tahan reload (state router hilang saat refresh).
  const [info] = useState<PaymentNavState>(() => {
    const stored = sessionStorage.getItem(SESSION_KEY(orderId));
    const merged = { ...(stored ? (JSON.parse(stored) as PaymentNavState) : {}), ...navState };
    if (Object.keys(merged).length > 0) sessionStorage.setItem(SESSION_KEY(orderId), JSON.stringify(merged));
    return merged;
  });

  const [method, setMethod] = useState<PaymentMethod | undefined>(info.method);
  const [initiating, setInitiating] = useState(false);
  const [initiateError, setInitiateError] = useState<string | null>(null);
  const [result, setResult] = useState<InitiatePaymentResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const attempt = useRef(0);

  const tracking = useOrderTracking(info.trackingToken);
  const uiStatus: PaymentUiStatus = paymentUiStatus(tracking.status);

  const initiate = useCallback(
    async (m: PaymentMethod) => {
      if (!info.amount) return;
      setInitiating(true);
      setInitiateError(null);
      try {
        const res = await postInitiatePayment(
          {
            order_id: orderId,
            amount: info.amount,
            method: m,
            customer_name: info.contact?.full_name,
            customer_email: info.contact?.email,
            customer_phone: info.contact?.phone,
          },
          // Idempotency: stabil per order+metode+percobaan → retry tidak buat transaksi ganda.
          `${orderId}:${m}:${attempt.current}`,
        );
        setResult(res);
      } catch (e) {
        setInitiateError(e instanceof Error ? e.message : 'Gagal memulai pembayaran.');
      } finally {
        setInitiating(false);
      }
    },
    [orderId, info.amount, info.contact],
  );

  // Mulai pembayaran begitu halaman dibuka & metode diketahui.
  useEffect(() => {
    if (method && !result && !initiating && !initiateError) void initiate(method);
  }, [method]);

  const changeMethod = (m: PaymentMethod) => {
    if (m === method) return;
    attempt.current += 1; // transaksi baru untuk order yang sama (order tetap PENDING)
    setResult(null);
    setInitiateError(null);
    setMethod(m);
  };

  const copyOrderId = async () => {
    try {
      await navigator.clipboard.writeText(info.orderNumber ?? orderId);
      setCopied(true);
      setToast('Nomor pesanan disalin.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast('Gagal menyalin. Salin manual dari layar.');
    }
  };

  if (!info.amount && !info.trackingToken) {
    return (
      <ErrorState message="Data pembayaran tidak ditemukan. Mulai ulang dari keranjang." />
    );
  }

  const orderNumber = info.orderNumber ?? orderId;

  return (
    <section className="space-y-5 pb-4">
      <h1 className="text-h1 text-text">Pembayaran</h1>

      {/* OrderBrief */}
      <div className="space-y-1 rounded-card border border-brand-100 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text-muted">Pesanan</span>
          <span className="tabular-nums font-semibold text-text">#{orderNumber}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text-muted">Total</span>
          <span className="tabular-nums font-bold text-brand">{formatIDR(info.amount ?? 0)}</span>
        </div>
        {info.method && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-muted">Metode</span>
            <span className="text-sm font-medium text-text">{paymentLabel(method ?? info.method)}</span>
          </div>
        )}
      </div>

      {/* Status live */}
      <div aria-live="polite" className="flex items-center gap-2">
        {uiStatus === 'pending' && (
          <Badge variant="warning" icon="⏳">
            Menunggu pembayaran…
          </Badge>
        )}
        {uiStatus === 'paid' && (
          <Badge variant="success" icon="✓">
            Pembayaran berhasil
          </Badge>
        )}
        {uiStatus === 'failed' && (
          <Badge variant="error" icon="⚠️">
            Pembayaran gagal / dibatalkan
          </Badge>
        )}
        {info.trackingToken && (
          <span className="text-caption text-text-muted">
            {tracking.connected ? '● Live' : '○ Menyambung…'}
          </span>
        )}
      </div>

      {/* Konten per status */}
      {uiStatus === 'paid' ? (
        <div className="space-y-4 rounded-card border border-success/30 bg-success/5 p-6 text-center">
          <span className="text-4xl" aria-hidden="true">
            ✅
          </span>
          <h2 className="text-h2 text-text">Pembayaran berhasil</h2>
          <p className="text-sm text-text-muted">
            Pesanan #{orderNumber} sedang disiapkan.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {info.trackingToken && (
              <Link
                to={`/track/${info.trackingToken}`}
                className={buttonClasses({ variant: 'primary', size: 'lg' })}
              >
                Lacak Pesanan
              </Link>
            )}
            <Link to="/" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
              Ke Home
            </Link>
          </div>
        </div>
      ) : (
        <>
          {initiating && !result && <Skeleton variant="kpi" count={2} />}

          {initiateError && (
            <ErrorState message={initiateError} onRetry={() => void initiate(method ?? info.method ?? ('qris' as PaymentMethod))} />
          )}

          {result && (
            <div className="space-y-4 rounded-card border border-brand-100 bg-white p-4">
              <p className="text-sm text-text-muted">
                Selesaikan pembayaran melalui {result.provider === 'midtrans' ? 'Midtrans' : result.provider}.
              </p>
              <a
                href={result.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}
              >
                Buka halaman pembayaran
              </a>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-brand-50 p-3">
                <span className="text-sm text-text-muted">Nomor pesanan</span>
                <span className="tabular-nums text-sm font-semibold text-text">#{orderNumber}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={copyOrderId}
                  aria-label="Salin nomor pesanan"
                >
                  {copied ? 'Tersalin' : 'Salin'}
                </Button>
              </div>
              <p className="text-caption text-text-muted">
                Setelah membayar, status di halaman ini akan diperbarui otomatis.
              </p>
            </div>
          )}

          {/* Ganti metode — order tetap PENDING, TIDAK membuat order baru (UX §4.3) */}
          <fieldset className="space-y-3 rounded-card border border-brand-100 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-text">Ganti metode pembayaran</legend>
            <ChipGroup role="radiogroup" label="Metode pembayaran">
              {(config?.active_payment_methods ?? []).map((m) => (
                <Chip
                  key={m}
                  role="radio"
                  aria-checked={method === m}
                  selected={method === m}
                  onClick={() => changeMethod(m as PaymentMethod)}
                >
                  {paymentLabel(m)}
                </Chip>
              ))}
            </ChipGroup>
          </fieldset>
        </>
      )}

      {toast && <Toast variant="success" message={toast} onClose={() => setToast(null)} />}
    </section>
  );
}
