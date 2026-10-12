import type { TrackingMode } from '../../hooks/useOrderTracking.js';
import { isTerminal, statusLabel } from '../../lib/tracking.js';

/**
 * LiveStatusBanner — indikator koneksi + status ringkas (UX-FLOWS §5).
 * `aria-live="polite"` agar perubahan status diumumkan screen reader (AC-09).
 */

export function LiveStatusBanner({
  status,
  connected,
  mode,
  error,
}: {
  status?: string | null;
  connected: boolean;
  mode: TrackingMode;
  error?: string | null;
}) {
  const cancelled = status === 'CANCELLED';
  const done = status === 'COMPLETED';

  const dot = connected ? '●' : '○';
  const connText = connected
    ? mode === 'sse'
      ? 'Live (real-time)'
      : 'Live (polling)'
    : 'Menyambung…';

  return (
    <div aria-live="polite" className="space-y-2">
      <div className="flex items-center justify-between gap-2 rounded-card border border-brand-100 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={connected ? 'text-success' : 'text-text-muted'}
          >
            {dot}
          </span>
          <span className="text-sm font-semibold text-text">{statusLabel(status)}</span>
        </div>
        <span className="text-caption text-text-muted">{connText}</span>
      </div>

      {error && !connected && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-caption text-warning-fg">
          ⚠️ {error} Menyambung ulang otomatis…
        </p>
      )}

      {cancelled && (
        <p role="status" className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-caption text-error">
          Pesanan dibatalkan. Hubungi outlet bila ada pertanyaan.
        </p>
      )}

      {done && (
        <p role="status" className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-caption text-success">
          Pesanan selesai. Terima kasih! ☕
        </p>
      )}

      {!status && !error && <span className="sr-only">{isTerminal(status) ? '' : 'Memuat status pesanan…'}</span>}
    </div>
  );
}
