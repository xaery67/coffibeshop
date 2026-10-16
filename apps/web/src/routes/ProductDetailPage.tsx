import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ProductDTO } from '@coffibeshop/shared';
import { useProduct } from '../hooks/useProduct.js';
import {
  activeOptions,
  activeVariants,
  selectionUnitPrice,
  validateSelection,
  formatIDR,
} from '../lib/pricing.js';
import { useCartStore, type CartOptionSnapshot } from '../stores/cart.store.js';
import { Button } from '../components/ui/Button.js';
import { Chip, ChipGroup } from '../components/ui/Chip.js';
import { BottomSheet } from '../components/ui/BottomSheet.js';
import { PriceText } from '../components/domain/PriceText.js';
import { OptionChipGroup } from '../components/domain/OptionChipGroup.js';
import { QuantityStepper } from '../components/domain/QuantityStepper.js';
import { StickyPriceFooter } from '../components/domain/StickyPriceFooter.js';
import { ErrorState } from '../components/domain/States.js';

interface Selection {
  variantId: string | null;
  optionValueIds: string[];
  note: string;
  qty: number;
}

/** Pilihan awal: varian pertama yang ada stok; opsi single/required = nilai pertama. */
function initialSelection(product: ProductDTO): Selection {
  const variants = activeVariants(product);
  const firstAvailable = variants.find((v) => v.stock_quantity === null || v.stock_quantity > 0) ?? variants[0];
  const optionValueIds: string[] = [];
  for (const opt of activeOptions(product)) {
    if (opt.option_type === 'single' && (opt.is_required || opt.min_select > 0) && opt.values[0]) {
      optionValueIds.push(opt.values[0].id);
    }
  }
  return { variantId: firstAvailable?.id ?? null, optionValueIds, note: '', qty: 1 };
}

/** Product Detail & Kustomisasi (PRD-FRONTEND §2.3-C) — harga real-time via PricingEngine. */
export function ProductDetailPage() {
  const { slugOrId } = useParams();
  const navigate = useNavigate();
  const { data: product, isLoading, error, refetch } = useProduct(slugOrId);
  const add = useCartStore((s) => s.add);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Inisialisasi pilihan begitu produk termuat.
  useEffect(() => {
    if (product) setSelection(initialSelection(product));
  }, [product]);

  const unitPrice = useMemo(
    () => (product && selection ? selectionUnitPrice(product, selection) : 0),
    [product, selection],
  );
  const validation = useMemo(
    () => (product && selection ? validateSelection(product, selection) : { valid: false, errors: ['Memuat…'] }),
    [product, selection],
  );

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4" aria-busy="true">
        <div className="h-64 w-full rounded-card bg-brand-100" />
        <div className="h-6 w-1/2 rounded bg-brand-100" />
        <div className="h-4 w-3/4 rounded bg-brand-100" />
      </div>
    );
  }

  if (error || !product) {
    return <ErrorState message="Gagal memuat produk." onRetry={() => refetch()} />;
  }

  const variants = activeVariants(product);
  const options = activeOptions(product);

  const toggleOption = (optId: string, valueId: string) => {
    setSelection((prev) => {
      if (!prev) return prev;
      const opt = options.find((o) => o.id === optId);
      if (!opt) return prev;
      const selected = prev.optionValueIds.includes(valueId);

      if (opt.option_type === 'single') {
        const others = prev.optionValueIds.filter((v) => !opt.values.some((x) => x.id === v));
        return { ...prev, optionValueIds: selected ? others : [...others, valueId] };
      }
      // multiple: hormati max_select
      if (!selected && prev.optionValueIds.filter((v) => opt.values.some((x) => x.id === v)).length >= opt.max_select) {
        return prev;
      }
      return {
        ...prev,
        optionValueIds: selected
          ? prev.optionValueIds.filter((v) => v !== valueId)
          : [...prev.optionValueIds, valueId],
      };
    });
  };

  const handleAdd = () => {
    if (!selection || !validation.valid) return;
    const variant = variants.find((v) => v.id === selection.variantId);
    const optionSnapshots: CartOptionSnapshot[] = options.flatMap((opt) =>
      opt.values
        .filter((val) => selection.optionValueIds.includes(val.id))
        .map((val) => ({
          optionValueId: val.id,
          name: `${opt.name}: ${val.value}`,
          priceAdjustment: val.price_adjustment,
        })),
    );

    add({
      product_id: product.id,
      product_name: product.name,
      image_url: product.image_url,
      variant: variant
        ? { variantId: variant.id, name: variant.name, priceAdjustment: variant.price_delta }
        : null,
      options: optionSnapshots,
      note: selection.note.trim() || undefined,
      qty: selection.qty,
      base_price: product.base_price,
      unit_price: unitPrice,
    });
    navigate('/cart');
  };

  const customizationForm = selection && (
    <div className="space-y-6">
      {variants.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-text">Varian</legend>
          <ChipGroup role="radiogroup" label="Varian">
            {variants.map((v) => {
              const soldOut = v.stock_quantity !== null && v.stock_quantity <= 0;
              const active = selection.variantId === v.id;
              return (
                <Chip
                  key={v.id}
                  role="radio"
                  aria-checked={active}
                  disabled={soldOut}
                  selected={active}
                  onClick={() => setSelection({ ...selection, variantId: v.id })}
                  className={soldOut ? 'line-through' : ''}
                >
                  {v.name}
                  {v.price_delta > 0 && (
                    <span className="tabular-nums text-text-muted">+{formatIDR(v.price_delta)}</span>
                  )}
                  {soldOut && <span className="text-caption text-text-muted">(habis)</span>}
                </Chip>
              );
            })}
          </ChipGroup>
        </fieldset>
      )}

      {options.map((opt) => (
        <OptionChipGroup
          key={opt.id}
          option={opt}
          selectedIds={selection.optionValueIds}
          onToggle={(valueId) => toggleOption(opt.id, valueId)}
        />
      ))}

      <div className="space-y-2">
        <label htmlFor="note" className="text-sm font-semibold text-text">
          Catatan untuk barista <span className="font-normal text-text-muted">(opsional)</span>
        </label>
        <textarea
          id="note"
          value={selection.note}
          onChange={(e) => setSelection({ ...selection, note: e.target.value.slice(0, 200) })}
          rows={2}
          maxLength={200}
          placeholder="mis. tanpa gula, extra panas"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text">Kuantitas</span>
        <QuantityStepper value={selection.qty} onChange={(qty) => setSelection({ ...selection, qty })} />
      </div>

      {!validation.valid && (
        <ul role="alert" className="space-y-1 rounded-lg bg-warning/10 p-3 text-xs text-warning-fg">
          {validation.errors.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="space-y-5">
      <Link to="/menu" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
        ← Kembali ke menu
      </Link>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Gallery */}
        <div className="aspect-[4/3] w-full overflow-hidden rounded-card bg-brand-50">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl" aria-hidden="true">
              ☕
            </div>
          )}
        </div>

        {/* Header + (desktop) form */}
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-text">{product.name}</h1>
            {product.category && <p className="text-sm text-text-muted">{product.category.name}</p>}
            {product.description && <p className="mt-2 text-sm text-text-muted">{product.description}</p>}
            <div className="mt-2">
              <PriceText value={product.base_price} size="lg" />
            </div>
          </div>

          {/* Desktop: form inline */}
          <div className="hidden lg:block">{customizationForm}</div>

          {/* Mobile: tombol buka BottomSheet kustomisasi (PRD §2.3-C) */}
          <div className="lg:hidden">
            <Button block size="lg" onClick={() => setSheetOpen(true)}>
              Kustomisasi & Pesan · {formatIDR(unitPrice)}
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop sticky footer */}
      <div className="hidden lg:block">
        <StickyPriceFooter
          unitPrice={unitPrice}
          disabled={!validation.valid}
          disabledReason={validation.errors[0]}
          onAdd={handleAdd}
          addLabel="Tambah"
        />
      </div>

      {/* Mobile bottom sheet kustomisasi */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        snap="full"
        title={product.name}
        footer={
          <StickyPriceFooter
            unitPrice={unitPrice}
            disabled={!validation.valid}
            disabledReason={validation.errors[0]}
            onAdd={handleAdd}
            addLabel="Tambah"
          />
        }
      >
        {customizationForm}
      </BottomSheet>
    </section>
  );
}
