import type { OptionDTO } from '@coffibeshop/shared';
import { formatIDR } from '../../lib/pricing.js';

/**
 * OptionChipGroup — pilihan opsi pada PDP (PRD-FRONTEND §6.3).
 * Mendukung `single` (radio) & `multiple` (checkbox), menghormati min/max_select.
 * Chip terpilih ditandai border + ikon centang (bukan warna saja — WCAG 1.4.1).
 */
export function OptionChipGroup({
  option,
  selectedIds,
  onToggle,
}: {
  option: OptionDTO;
  selectedIds: string[];
  onToggle: (valueId: string) => void;
}) {
  const isMultiple = option.option_type === 'multiple';
  const atMax = selectedIds.filter((id) => option.values.some((v) => v.id === id)).length >= option.max_select;
  const label = `${option.name}${option.is_required ? ' (wajib)' : ''}`;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-text">
        {label}
        {isMultiple && (
          <span className="ml-2 text-xs font-normal text-text-muted">
            maks {option.max_select}
          </span>
        )}
      </legend>
      <div className="flex flex-wrap gap-2" role={isMultiple ? 'group' : 'radiogroup'} aria-label={option.name}>
        {option.values.map((val) => {
          const selected = selectedIds.includes(val.id);
          const disabled = !selected && isMultiple && atMax;
          return (
            <button
              key={val.id}
              type="button"
              role={isMultiple ? 'checkbox' : 'radio'}
              aria-checked={selected}
              aria-disabled={disabled || undefined}
              disabled={disabled}
              onClick={() => onToggle(val.id)}
              className={[
                'inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm transition',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
                selected ? 'border-brand bg-brand-50 font-semibold text-brand' : 'border-border bg-white text-text',
                disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-brand-500/50',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {selected && (
                <span aria-hidden="true" className="text-brand">
                  ✓
                </span>
              )}
              <span>{val.value}</span>
              {val.price_adjustment > 0 && (
                <span className="tabular-nums text-text-muted">+{formatIDR(val.price_adjustment)}</span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
