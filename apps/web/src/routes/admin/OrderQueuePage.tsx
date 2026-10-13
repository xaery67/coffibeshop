import { useState } from 'react';
import { useAdminOutlet } from '../../components/admin/AdminShell.js';
import { OrderTicketCard } from '../../components/admin/OrderTicketCard.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { Toast } from '../../components/ui/Toast.js';
import { useAdminQueue, useUpdateOrderStatus } from '../../hooks/useAdminQueue.js';
import { groupByColumn, QUEUE_COLUMNS } from '../../lib/queue.js';
import { printTicket } from '../../lib/admin.js';

const CONNECTION_LABEL: Record<string, string> = {
  connecting: 'Menghubungkan…',
  live: 'Realtime aktif',
  polling: 'Mode polling (WS terputus)',
  offline: 'Tidak terhubung',
};

/**
 * OrderQueuePage — antrian pesanan realtime (F-011, PRD-BACKEND §2.3).
 *
 * Papan 4 kolom (Baru · Diproses · Siap · Selesai) dari `groupByColumn`; update
 * status via `PUT /orders/{id}/status` mengikuti state machine `lib/queue.ts`.
 */
export function OrderQueuePage() {
  const { outletId } = useAdminOutlet();
  const { orders, isLoading, error, connection } = useAdminQueue(outletId);
  const update = useUpdateOrderStatus(outletId);
  const [toast, setToast] = useState<{ variant: 'success' | 'error'; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const columns = groupByColumn(orders);

  const handleAction = async (orderId: string, status: string) => {
    setBusyId(orderId);
    try {
      await update.mutateAsync({ orderId, status });
      setToast({ variant: 'success', message: `Status diperbarui → ${status}` });
    } catch (e) {
      setToast({ variant: 'error', message: (e as Error).message || 'Gagal memperbarui status' });
    } finally {
      setBusyId(null);
    }
  };

  const handlePrint = async (orderId: string) => {
    try {
      await printTicket(orderId);
      setToast({ variant: 'success', message: 'Tiket PDF diunduh' });
    } catch (e) {
      setToast({ variant: 'error', message: (e as Error).message || 'Gagal mencetak tiket' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-text-muted" role="status" aria-live="polite" data-testid="queue-connection">
          <span aria-hidden="true">{connection === 'live' ? '🟢' : connection === 'polling' ? '🟡' : '⚪'}</span>{' '}
          {CONNECTION_LABEL[connection]}
        </p>
        <p className="text-sm text-text-muted">
          {orders.length} pesanan aktif
        </p>
      </div>

      {error && !isLoading && (
        <p role="alert" className="rounded-card border border-error/30 bg-white px-4 py-3 text-sm text-error">
          Gagal memuat antrian: {error.message}
        </p>
      )}

      {isLoading ? (
        <Skeleton variant="row" count={4} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {QUEUE_COLUMNS.map((col) => (
            <section key={col.key} aria-label={`Kolom ${col.label}`} className="space-y-3">
              <h2 className="flex items-center justify-between text-h3 text-text">
                {col.label}
                <span className="rounded-pill bg-brand-100 px-2 text-caption tabular-nums text-brand-700">
                  {columns[col.key].length}
                </span>
              </h2>
              <div className="space-y-3">
                {columns[col.key].length === 0 ? (
                  <p className="rounded-card border border-dashed border-border px-3 py-6 text-center text-caption text-text-muted">
                    Tidak ada pesanan
                  </p>
                ) : (
                  columns[col.key].map((o) => (
                    <div key={o.id} className="space-y-2">
                      <OrderTicketCard
                        order={o}
                        busy={busyId === o.id}
                        onAction={(status) => handleAction(o.id, status)}
                      />
                      <button
                        type="button"
                        onClick={() => handlePrint(o.id)}
                        className="min-h-[44px] w-full rounded-lg border border-border text-caption text-text-muted hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                      >
                        🖨 Cetak tiket
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {toast && <Toast variant={toast.variant} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
