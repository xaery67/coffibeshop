import { buildTimeline, type StepState } from '../../lib/tracking.js';

/**
 * StatusTimeline — 6 langkah status order (UX-FLOWS §5).
 * Status tidak hanya warna: tiap langkah punya ikon ✓/◉/○ + label (WCAG 1.4.1),
 * dan dibaca screen reader sebagai daftar berurut (`<ol>`).
 */

const ICON: Record<StepState, string> = {
  done: '✓',
  current: '◉',
  upcoming: '○',
};

const ICON_CLASS: Record<StepState, string> = {
  done: 'text-success',
  current: 'text-brand',
  upcoming: 'text-text-muted',
};

const TEXT_CLASS: Record<StepState, string> = {
  done: 'text-text',
  current: 'font-semibold text-brand',
  upcoming: 'text-text-muted',
};

export function StatusTimeline({ status }: { status?: string | null }) {
  const steps = buildTimeline(status);

  return (
    <ol className="space-y-2" aria-label="Status pesanan">
      {steps.map((s) => (
        <li
          key={s.key}
          aria-current={s.state === 'current' ? 'step' : undefined}
          className="flex items-center gap-2 text-sm"
        >
          <span aria-hidden="true" className={`w-5 text-center ${ICON_CLASS[s.state]}`}>
            {ICON[s.state]}
          </span>
          <span className={TEXT_CLASS[s.state]}>{s.label}</span>
          {s.state === 'current' && (
            <span className="text-caption text-text-muted">← sekarang</span>
          )}
        </li>
      ))}
    </ol>
  );
}
