import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PaymentMethod } from '@coffibeshop/shared';
import { useCartStore } from '../stores/cart.store.js';
import { useConfig } from '../hooks/useConfig.js';
import { useOutlets } from '../hooks/useOutlets.js';
import { computeTotals, formatIDR } from '../lib/pricing.js';
import {
  CHECKOUT_STEPS,
  FULFILLMENT_LABELS,
  buildCheckoutPayload,
  emptyAddress,
  initialDraft,
  paymentLabel,
  validateStep,
  type CheckoutDraft,
  type CheckoutStepKey,
  type FieldErrors,
} from '../lib/checkout.js';
import { replaceServerCart } from '../lib/cart-sync.js';
import { postCheckout } from '../lib/orders.js';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { Chip, ChipGroup } from '../components/ui/Chip.js';
import { Toast } from '../components/ui/Toast.js';
import { CheckoutStepper } from '../components/domain/CheckoutStepper.js';
import { CartSummary } from '../components/domain/CartSummary.js';
import { EmptyState } from '../components/domain/States.js';

/** Checkout — ≤ 5 langkah (UX-FLOWS.md §3). Guest checkout menonjol, tanpa login. */
export function CheckoutPage() {
  const navigate = useNavigate();
  const { items, fulfillment, setFulfillment, clear } = useCartStore();
  const { data: config } = useConfig();
  const outlets = useOutlets();

  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<CheckoutDraft>(() => initialDraft(fulfillment));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const step = CHECKOUT_STEPS[stepIndex].key as CheckoutStepKey;

  const totals = useMemo(
    () =>
      computeTotals({
        lines: items.map((i) => ({
          basePrice: i.base_price,
          variantDelta: i.variant?.priceAdjustment ?? 0,
          options: i.options.map((o) => ({ priceAdjustment: o.priceAdjustment, qty: 1 })),
          quantity: i.qty,
        })),
        taxRate: config?.tax_rate ?? 0,
        deliveryFee: draft.fulfillment === 'delivery' ? config?.shipping_flat_fee ?? 0 : 0,
      }),
    [items, config, draft.fulfillment],
  );

  // Sinkronkan pilihan fulfillment Cart → Checkout (satu selector, UX §7).
  useEffect(() => {
    setDraft((d) => ({ ...d, fulfillment }));
  }, [fulfillment]);

  // Outlet wajib untuk SEMUA fulfillment (order tanpa outlet tak masuk antrian admin).
  // Delivery pun dipenuhi dari outlet; default ke outlet pertama bila belum dipilih.
  useEffect(() => {
    const list = outlets.data ?? [];
    if (list.length > 0 && !draft.outletId) {
      setDraft((d) => ({ ...d, outletId: list[0].id, outletName: list[0].name }));
    }
  }, [outlets.data, draft.outletId]);

  const update = (patch: Partial<CheckoutDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const goTo = (index: number) => {
    setErrors({});
    setStepIndex(index);
    panelRef.current?.focus();
  };

  const validateCurrent = () =>
    validateStep(step, draft, { requireOutlet: true });

  const onNext = () => {
    const errs = validateCurrent();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      requestAnimationFrame(() => {
        panelRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    if (stepIndex < CHECKOUT_STEPS.length - 1) goTo(stepIndex + 1);
  };

  const onBack = () => {
    if (stepIndex > 0) goTo(stepIndex - 1);
    else navigate('/cart');
  };

  /** Step 5: sinkron cart → server, buat order, lalu lanjut ke pembayaran. */
  const onPlaceOrder = async () => {
    const errs = validateCurrent();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      await replaceServerCart(items);
      const result = await postCheckout(buildCheckoutPayload(draft));
      clear();
      navigate(`/payment/${result.order_id}`, {
        state: {
          orderNumber: result.order_number,
          trackingToken: result.tracking_token,
          amount: totals.grandTotal,
          method: draft.paymentMethod,
          contact: draft.contact,
        },
      });
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal membuat pesanan. Coba lagi.');
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <EmptyState
        title="Keranjang masih kosong"
        description="Tambahkan item dulu sebelum checkout."
        action={
          <Link to="/menu" className="text-brand underline">
            Lihat Menu
          </Link>
        }
      />
    );
  }

  return (
    <section className="space-y-5 pb-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-2 py-1 text-sm text-brand hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          aria-label="Kembali"
        >
          ← Kembali
        </button>
        <h1 className="text-h1 text-text">Checkout</h1>
      </div>

      <CheckoutStepper current={step} />

      <div ref={panelRef} tabIndex={-1} className="outline-none">
        {step === 'fulfillment' && (
          <fieldset className="space-y-3 rounded-card border border-brand-100 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-text">Metode pengambilan</legend>
            <ChipGroup role="radiogroup" label="Metode pengambilan">
              {FULFILLMENT_LABELS.map((f) => (
                <Chip
                  key={f.value}
                  role="radio"
                  aria-checked={draft.fulfillment === f.value}
                  selected={draft.fulfillment === f.value}
                  onClick={() => {
                    setFulfillment(f.value);
                    update({ fulfillment: f.value });
                  }}
                >
                  {f.label}
                </Chip>
              ))}
            </ChipGroup>
            {draft.fulfillment === 'delivery' && (
              <p className="text-sm text-text-muted">
                Ongkir flat {formatIDR(config?.shipping_flat_fee ?? 0)} akan ditambahkan.
              </p>
            )}
          </fieldset>
        )}

        {step === 'schedule' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="outlet" className="block text-sm font-semibold text-text">
                Outlet
              </label>
              <select
                id="outlet"
                value={draft.outletId ?? ''}
                onChange={(e) => {
                  const o = (outlets.data ?? []).find((x) => x.id === e.target.value);
                  update({ outletId: e.target.value || null, outletName: o?.name });
                }}
                aria-invalid={errors.outletId ? true : undefined}
                aria-describedby={errors.outletId ? 'outlet-error' : undefined}
                className="min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
              >
                <option value="">Pilih outlet…</option>
                {(outlets.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {errors.outletId && (
                <p id="outlet-error" className="text-caption text-error">
                  {errors.outletId}
                </p>
              )}
              <p className="text-caption text-text-muted">
                Pesanan diproses di outlet ini; pilih outlet agar masuk antrian dapur.
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-text">Waktu</legend>
              <ChipGroup role="radiogroup" label="Waktu pengambilan">
                <Chip
                  role="radio"
                  aria-checked={draft.schedule.mode === 'asap'}
                  selected={draft.schedule.mode === 'asap'}
                  onClick={() => update({ schedule: { mode: 'asap' } })}
                >
                  Secepatnya
                </Chip>
                <Chip
                  role="radio"
                  aria-checked={draft.schedule.mode === 'scheduled'}
                  selected={draft.schedule.mode === 'scheduled'}
                  onClick={() => update({ schedule: { mode: 'scheduled', time: draft.schedule.time } })}
                >
                  Jadwalkan
                </Chip>
              </ChipGroup>
              {draft.schedule.mode === 'scheduled' && (
                <div className="max-w-[12rem]">
                  <label htmlFor="time" className="mb-1 block text-sm text-text-muted">
                    Jam
                  </label>
                  <input
                    id="time"
                    type="time"
                    value={draft.schedule.time ?? ''}
                    onChange={(e) => update({ schedule: { mode: 'scheduled', time: e.target.value } })}
                    aria-invalid={errors.time ? true : undefined}
                    className="min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                  />
                  {errors.time && <p className="text-caption text-error">{errors.time}</p>}
                </div>
              )}
            </fieldset>

            {draft.fulfillment === 'delivery' && (
              <div className="space-y-3 rounded-card border border-brand-100 p-4">
                <h2 className="text-h3 text-text">Alamat pengiriman</h2>
                <Input
                  label="Nama penerima"
                  required
                  value={draft.address?.recipient_name ?? ''}
                  onChange={(e) =>
                    update({ address: { ...(draft.address ?? emptyAddress()), recipient_name: e.target.value } })
                  }
                  error={errors.recipient_name}
                  autoComplete="name"
                />
                <Input
                  label="Nomor HP penerima"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  value={draft.address?.phone ?? ''}
                  onChange={(e) =>
                    update({ address: { ...(draft.address ?? emptyAddress()), phone: e.target.value } })
                  }
                  error={errors.address_phone}
                />
                <Input
                  label="Alamat lengkap"
                  required
                  value={draft.address?.address_line ?? ''}
                  onChange={(e) =>
                    update({ address: { ...(draft.address ?? emptyAddress()), address_line: e.target.value } })
                  }
                  error={errors.address_line}
                  autoComplete="street-address"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Kota"
                    required
                    value={draft.address?.city ?? ''}
                    onChange={(e) =>
                      update({ address: { ...(draft.address ?? emptyAddress()), city: e.target.value } })
                    }
                    error={errors.city}
                    autoComplete="address-level2"
                  />
                  <Input
                    label="Kode pos"
                    required
                    inputMode="numeric"
                    value={draft.address?.postal_code ?? ''}
                    onChange={(e) =>
                      update({ address: { ...(draft.address ?? emptyAddress()), postal_code: e.target.value } })
                    }
                    error={errors.postal_code}
                    autoComplete="postal-code"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'contact' && (
          <div className="space-y-4">
            <div className="rounded-card border border-brand-100 bg-brand-50 p-4">
              <p className="text-sm font-semibold text-text">Pesan sebagai tamu</p>
              <p className="mt-1 text-caption text-text-muted">
                Cukup nama & nomor WhatsApp. Tanpa perlu membuat akun.
              </p>
            </div>
            <Input
              label="Nama"
              required
              value={draft.contact.full_name}
              onChange={(e) => update({ contact: { ...draft.contact, full_name: e.target.value } })}
              error={errors.full_name}
              autoComplete="name"
            />
            <Input
              label="Nomor WhatsApp"
              required
              inputMode="tel"
              autoComplete="tel"
              hint="Contoh: 08123456789"
              value={draft.contact.phone}
              onChange={(e) => update({ contact: { ...draft.contact, phone: e.target.value } })}
              error={errors.phone}
            />
            <Input
              label="Email (opsional)"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={draft.contact.email ?? ''}
              onChange={(e) => update({ contact: { ...draft.contact, email: e.target.value } })}
              error={errors.email}
            />
          </div>
        )}

        {step === 'payment' && (
          <fieldset className="space-y-3 rounded-card border border-brand-100 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-text">Metode pembayaran</legend>
            <ChipGroup role="radiogroup" label="Metode pembayaran">
              {(config?.active_payment_methods ?? []).map((m) => (
                <Chip
                  key={m}
                  role="radio"
                  aria-checked={draft.paymentMethod === m}
                  selected={draft.paymentMethod === m}
                  onClick={() => update({ paymentMethod: m as PaymentMethod })}
                >
                  {paymentLabel(m)}
                </Chip>
              ))}
            </ChipGroup>
            {errors.paymentMethod && (
              <p role="alert" className="text-caption text-error">
                {errors.paymentMethod}
              </p>
            )}
          </fieldset>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="space-y-1 rounded-card border border-brand-100 bg-white p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Pengambilan</span>
                <span className="font-medium text-text">
                  {FULFILLMENT_LABELS.find((f) => f.value === draft.fulfillment)?.label}
                </span>
              </div>
              {draft.outletName && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Outlet</span>
                  <span className="font-medium text-text">{draft.outletName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-muted">Waktu</span>
                <span className="font-medium text-text">
                  {draft.schedule.mode === 'scheduled' ? `Jadwal ${draft.schedule.time}` : 'Secepatnya'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Kontak</span>
                <span className="font-medium text-text">
                  {draft.contact.full_name} · {draft.contact.phone}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Pembayaran</span>
                <span className="font-medium text-text">{draft.paymentMethod ? paymentLabel(draft.paymentMethod) : '-'}</span>
              </div>
              {draft.fulfillment === 'delivery' && draft.address && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Alamat</span>
                  <span className="max-w-[60%] text-right font-medium text-text">
                    {draft.address.address_line}, {draft.address.city}
                  </span>
                </div>
              )}
            </div>
            <CartSummary totals={totals} />
          </div>
        )}
      </div>

      {/* Ringkasan pesanan (collapsible) — selalu terlihat agar transparan (DS prinsip #3) */}
      {step !== 'confirm' && (
        <details className="rounded-card border border-brand-100 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-text">
            Ringkasan pesanan ({items.reduce((n, i) => n + i.qty, 0)} item)
          </summary>
          <div className="mt-3">
            <CartSummary totals={totals} />
          </div>
        </details>
      )}

      {/* Navigasi langkah */}
      <div className="sticky bottom-0 z-10 -mx-4 flex gap-3 border-t border-brand-100 bg-white/95 px-4 py-3 backdrop-blur">
        {stepIndex > 0 && (
          <Button variant="secondary" size="lg" onClick={onBack}>
            Kembali
          </Button>
        )}
        {stepIndex < CHECKOUT_STEPS.length - 1 ? (
          <Button block size="lg" onClick={onNext}>
            Lanjut
          </Button>
        ) : (
          <Button block size="lg" onClick={onPlaceOrder} loading={submitting}>
            Buat Pesanan · {formatIDR(totals.grandTotal)}
          </Button>
        )}
      </div>

      {toast && <Toast variant="error" message={toast} onClose={() => setToast(null)} />}
    </section>
  );
}
