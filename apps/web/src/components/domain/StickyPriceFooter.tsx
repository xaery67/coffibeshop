import { Button } from '../ui/Button.js';
import { PriceText } from './PriceText.js';

/**
 * StickyPriceFooter — harga real-time + tombol aksi utama PDP (PRD-FRONTEND §6.3, §6.4).
 * Harga WAJIB berasal dari PricingEngine (satu sumber harga). Safe-area dihormati.
 */
export function StickyPriceFooter({
  unitPrice,
  disabled = false,
  disabledReason,
  onAdd,
  addLabel = 'Tambah',
}: {
  unitPrice: number;
  disabled?: boolean;
  disabledReason?: string;
  onAdd: () => void;
  addLabel?: string;
}) {
  return (
    <div
      className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-brand-100 bg-white/95 px-4 py-3 backdrop-blur"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-text-muted">Harga</span>
          <PriceText value={unitPrice} size="lg" />
        </div>
        <Button
          block
          size="lg"
          onClick={onAdd}
          disabled={disabled}
          aria-describedby={disabled && disabledReason ? 'add-reason' : undefined}
          className="ml-auto max-w-[60%]"
        >
          {addLabel} · <PriceText value={unitPrice} className="text-brand-fg" size="sm" />
        </Button>
      </div>
      {disabled && disabledReason && (
        <p id="add-reason" role="alert" className="mt-2 text-xs text-warning-fg">
          {disabledReason}
        </p>
      )}
    </div>
  );
}
