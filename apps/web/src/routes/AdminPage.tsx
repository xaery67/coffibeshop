import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api.js';

export function AdminPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'config'],
    queryFn: () => apiFetch<any>('/admin/config'),
  });

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold text-brand">Admin — Konfigurasi</h1>
      {isLoading && <p className="text-sm text-neutral-500">Memuat…</p>}
      {error && <p className="text-sm text-error">Gagal memuat config.</p>}
      {data && (
        <dl className="grid gap-2 rounded-card border border-brand-100 bg-white p-5 text-sm tabular-nums">
          <div className="flex justify-between"><dt>Tax rate</dt><dd>{data.tax_rate}</dd></div>
          <div className="flex justify-between"><dt>Point value</dt><dd>{data.point_value}</dd></div>
          <div className="flex justify-between"><dt>Currency</dt><dd>{data.currency}</dd></div>
          <div className="flex justify-between"><dt>Ongkir flat</dt><dd>Rp {Number(data.shipping_flat_fee).toLocaleString('id-ID')}</dd></div>
          <div className="flex justify-between"><dt>Heartbeat SSE</dt><dd>{data.sse_heartbeat_interval_ms} ms</dd></div>
          <div className="flex justify-between"><dt>Poll interval</dt><dd>{data.tracking_poll_interval_ms} ms</dd></div>
        </dl>
      )}
    </section>
  );
}
