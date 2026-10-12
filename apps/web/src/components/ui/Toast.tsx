import { useEffect } from 'react';

type ToastVariant = 'success' | 'error' | 'info';

const VARIANTS: Record<ToastVariant, { cls: string; icon: string }> = {
  success: { cls: 'border-success/30 bg-white text-text', icon: '✅' },
  error: { cls: 'border-error/30 bg-white text-text', icon: '⚠️' },
  info: { cls: 'border-info/30 bg-white text-text', icon: 'ℹ️' },
};

/**
 * Toast — notifikasi mengambang (DESIGN-SYSTEM §5.5).
 * `role="status"` + `aria-live="polite"`, auto-dismiss (4s; error 6s) + tombol tutup.
 * Posisi bawah-tengah, TIDAK menutupi CTA utama (diberi offset di atas FAB).
 */
export function Toast({
  variant = 'info',
  message,
  onClose,
  duration,
}: {
  variant?: ToastVariant;
  message: string;
  onClose: () => void;
  duration?: number;
}) {
  const ms = duration ?? (variant === 'error' ? 6000 : 4000);

  useEffect(() => {
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [onClose, ms]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4"
    >
      <div
        className={[
          'pointer-events-auto flex max-w-md items-start gap-2 rounded-card border px-4 py-3 shadow-elev2',
          VARIANTS[variant].cls,
        ].join(' ')}
      >
        <span aria-hidden="true">{VARIANTS[variant].icon}</span>
        <p className="flex-1 text-sm">{message}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup notifikasi"
          className="shrink-0 rounded px-1 text-text-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
