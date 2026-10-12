import { CHECKOUT_STEPS, type CheckoutStepKey } from '../../lib/checkout.js';

/**
 * CheckoutStepper — progress + label langkah checkout (UX-FLOWS §3.2).
 * `aria-current="step"` pada langkah aktif; urutan dibaca screen reader sebagai daftar berurut.
 */
export function CheckoutStepper({
  current,
  total = CHECKOUT_STEPS.length,
}: {
  current: CheckoutStepKey;
  total?: number;
}) {
  const currentIndex = CHECKOUT_STEPS.findIndex((s) => s.key === current);

  return (
    <div className="space-y-2">
      <ol className="flex items-center gap-1" aria-label={`Langkah ${currentIndex + 1} dari ${total}`}>
        {CHECKOUT_STEPS.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-1">
              <span
                aria-current={active ? 'step' : undefined}
                className={[
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-bold',
                  done ? 'bg-brand text-brand-fg' : active ? 'bg-brand text-brand-fg' : 'bg-brand-100 text-text-muted',
                ].join(' ')}
              >
                {done ? '✓' : i + 1}
              </span>
              {i < CHECKOUT_STEPS.length - 1 && (
                <span className={['h-0.5 flex-1 rounded', done ? 'bg-brand' : 'bg-brand-100'].join(' ')} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-text-muted">
        Langkah {currentIndex + 1} dari {total} ·{' '}
        <span className="font-semibold text-text">{CHECKOUT_STEPS[currentIndex].label}</span>
      </p>
    </div>
  );
}
