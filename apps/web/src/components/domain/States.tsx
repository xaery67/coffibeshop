import type { ReactNode } from 'react';
import { Button } from '../ui/Button.js';

/** EmptyState — ilustrasi + CTA (PRD-FRONTEND §6.3). */
export function EmptyState({
  icon = '☕',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-brand-100 bg-white px-6 py-12 text-center">
      <span className="text-4xl" aria-hidden="true">
        {icon}
      </span>
      <h3 className="font-semibold text-text">{title}</h3>
      {description && <p className="max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** ErrorState — standar penanganan error + tombol coba lagi (PRD-FRONTEND §6.3). */
export function ErrorState({
  message = 'Terjadi kesalahan saat memuat data.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-error/30 bg-error/5 px-6 py-10 text-center"
    >
      <span className="text-3xl" aria-hidden="true">
        ⚠️
      </span>
      <p className="text-sm text-text">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}
