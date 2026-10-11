import { Link } from 'react-router-dom';
import type { ProductDTO } from '@coffibeshop/shared';
import { Card } from '../ui/Card.js';
import { PriceText } from './PriceText.js';

/** ProductCard — Home, Menu, Rekomendasi (PRD-FRONTEND §6.3). Seluruh kartu = tautan ke PDP. */
export function ProductCard({ product }: { product: ProductDTO }) {
  const unavailable = !product.is_available;
  return (
    <Card interactive className="flex flex-col p-0">
      <Link
        to={`/product/${product.id}`}
        className="flex flex-1 flex-col rounded-card focus-visible:outline-none"
        aria-label={`Lihat detail ${product.name}`}
      >
        <div className="aspect-[4/3] w-full overflow-hidden rounded-t-card bg-brand-50">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl" aria-hidden="true">
              ☕
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <h3 className="text-h3 line-clamp-1 font-semibold text-text">{product.name}</h3>
          {product.description && (
            <p className="line-clamp-2 text-sm text-text-muted">{product.description}</p>
          )}
          <div className="mt-auto flex items-center justify-between pt-2">
            <PriceText value={product.base_price} />
            {unavailable && (
              <span className="rounded-pill bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
                Habis
              </span>
            )}
          </div>
        </div>
      </Link>
    </Card>
  );
}

/** ProductCardSkeleton — cegah layout shift saat loading (UX §3.5). */
export function ProductCardSkeleton() {
  return (
    <Card className="flex flex-col p-0" aria-hidden="true">
      <div className="aspect-[4/3] w-full animate-pulse rounded-t-card bg-brand-100" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-brand-100" />
        <div className="h-3 w-full animate-pulse rounded bg-brand-100" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-brand-100" />
      </div>
    </Card>
  );
}
