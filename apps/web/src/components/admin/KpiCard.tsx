import type { ReactNode } from 'react';
import { Card } from '../ui/Card.js';

/** KpiCard — kartu metrik dashboard (PRD-FRONTEND §2.4 AdminDashboard). */
export function KpiCard({
  label,
  value,
  deltaPct,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  deltaPct?: number | null;
  hint?: string;
  icon?: string;
}) {
  const up = typeof deltaPct === 'number' && deltaPct >= 0;
  return (
    <Card variant="kpi" data-testid="kpi-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">{label}</p>
        {icon && (
          <span aria-hidden="true" className="text-lg">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-1 text-h1 tabular-nums text-text">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-caption">
        {typeof deltaPct === 'number' && (
          <span className={up ? 'text-success' : 'text-error'}>
            <span aria-hidden="true">{up ? '▲' : '▼'}</span> {Math.abs(deltaPct).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-text-muted">{hint}</span>}
      </div>
    </Card>
  );
}
