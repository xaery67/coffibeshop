import { useParams } from 'react-router-dom';
import { useConfig } from '../hooks/useConfig.js';
import { useOrderTracking } from '../hooks/useOrderTracking.js';
import { StatusTimeline } from '../components/domain/StatusTimeline.js';
import { LiveStatusBanner } from '../components/domain/LiveStatusBanner.js';
import { EtaBadge } from '../components/domain/EtaBadge.js';
import { EmptyState, ErrorState } from '../components/domain/States.js';
import { Skeleton } from '../components/ui/Skeleton.js';

/**
 * TrackPage — lacak pesanan guest via token (UX-FLOWS §5).
 * SSE primary + fallback polling (interval dari /config) + backoff; AC-09 < 5s.
 */
export function TrackPage() {
  const { token } = useParams();
  const { data: config } = useConfig();
  const state = useOrderTracking(
    { token },
    { pollMs: config?.tracking_poll_interval_ms ?? 3000 },
  );

  if (!token) {
    return (
      <section className="space-y-4">
        <h1 className="text-h1 text-text">Lacak Pesanan</h1>
        <EmptyState
          icon="🔎"
          title="Token pelacakan tidak ditemukan"
          description="Buka tautan pelacakan dari struk atau email konfirmasi pesananmu."
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-h1 text-text">Lacak Pesanan</h1>

      <LiveStatusBanner
        status={state.status}
        connected={state.connected}
        mode={state.mode}
        error={state.error}
      />

      <EtaBadge estimatedReadyTime={state.estimated_ready_time} status={state.status} />

      <div className="rounded-card border border-brand-100 bg-white p-4">
        {!state.status && !state.error ? (
          <Skeleton variant="row" count={2} />
        ) : state.error && !state.status ? (
          <ErrorState message={state.error} />
        ) : (
          <StatusTimeline status={state.status} />
        )}
      </div>
    </section>
  );
}
