import { etaMinutes } from '../../lib/tracking.js';

/** EtaBadge — estimasi siap dalam menit (UX-FLOWS §5). Tidak muncul bila terminal/lewat. */
export function EtaBadge({
  estimatedReadyTime,
  status,
}: {
  estimatedReadyTime?: string | null;
  status?: string | null;
}) {
  if (status === 'COMPLETED' || status === 'CANCELLED') return null;
  const mins = etaMinutes(estimatedReadyTime);
  if (mins === null) return null;

  const text = mins <= 0 ? 'Sebentar lagi siap' : `Estimasi siap ± ${mins} menit`;

  return (
    <p className="inline-flex items-center gap-2 rounded-pill bg-brand-50 px-3 py-1 text-sm font-medium text-brand">
      <span aria-hidden="true">⏱️</span>
      {text}
    </p>
  );
}
