import { useParams } from 'react-router-dom';
import { useOrderTracking } from '../hooks/useOrderTracking.js';

export function TrackPage() {
  const { token } = useParams();
  const state = useOrderTracking(token);

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold text-brand">Lacak Pesanan</h1>
      {!token && <p className="text-sm text-neutral-500">Masukkan token pelacakan dari struk/email.</p>}
      {token && (
        <div className="rounded-card border border-brand-100 bg-white p-5">
          <p className="text-sm text-neutral-500">
            Status: <span className="font-semibold text-brand">{state.status ?? 'memuat…'}</span>
          </p>
          {state.estimated_ready_time && (
            <p className="mt-1 text-sm text-neutral-500">
              Estimasi siap: {new Date(state.estimated_ready_time).toLocaleTimeString('id-ID')}
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-400">
            {state.connected ? '● Live (SSE)' : '○ Menyambung…'}
          </p>
        </div>
      )}
    </section>
  );
}
