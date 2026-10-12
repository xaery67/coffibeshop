import { Card } from './Card.js';

type SkeletonVariant = 'product' | 'row' | 'kpi';

/**
 * Skeleton — placeholder loading (DESIGN-SYSTEM §5.7).
 * Mencegah layout shift (CLS); `aria-hidden` + `aria-busy` di pembungkus.
 */
export function Skeleton({ variant = 'row', count = 1 }: { variant?: SkeletonVariant; count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        if (variant === 'product') {
          return (
            <Card key={i} className="p-0">
              <div className="aspect-[4/3] w-full animate-pulse rounded-t-card bg-brand-100/60" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-brand-100/60" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-brand-100/60" />
              </div>
            </Card>
          );
        }
        if (variant === 'kpi') {
          return (
            <Card key={i} variant="kpi">
              <div className="h-3 w-1/3 animate-pulse rounded bg-brand-100/60" />
              <div className="mt-2 h-6 w-1/2 animate-pulse rounded bg-brand-100/60" />
            </Card>
          );
        }
        return (
          <Card key={i} className="flex items-center gap-3">
            <div className="h-16 w-16 shrink-0 animate-pulse rounded-lg bg-brand-100/60" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded bg-brand-100/60" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-brand-100/60" />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
