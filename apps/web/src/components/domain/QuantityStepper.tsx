/**
 * QuantityStepper — tombol −/+ inline, TANPA tombol "Apply" (PRD-FRONTEND §6.3, UX §4 #2).
 * Target sentuh ≥ 44px; nilai pakai tabular-nums.
 */
export function QuantityStepper({
  value,
  min = 1,
  max = 99,
  onChange,
  label = 'Kuantitas',
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  label?: string;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  return (
    <div className="inline-flex items-center rounded-lg border border-border" role="group" aria-label={label}>
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label="Kurangi"
        className="flex h-11 w-11 items-center justify-center text-lg text-brand disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-focus)]"
      >
        −
      </button>
      <span className="tabular-nums w-10 text-center text-sm font-semibold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label="Tambah"
        className="flex h-11 w-11 items-center justify-center text-lg text-brand disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-focus)]"
      >
        +
      </button>
    </div>
  );
}
