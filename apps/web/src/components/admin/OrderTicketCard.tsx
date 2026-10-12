import type { QueueOrderDTO } from '@coffibeshop/shared';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { formatIDR } from '../../lib/reporting.js';
import { statusLabel } from '../../lib/tracking.js';
import { staffActions } from '../../lib/queue.js';

/** Warna badge per status (teks tetap ada — WCAG 1.4.1). */
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'error' | 'promo'> = {
  PAID: 'promo',
  CONFIRMED: 'warning',
  BEING_PREPARED: 'warning',
  READY: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'error',
};

/** Menit sejak order dibuat (timer antrian). */
function minutesSince(iso: string, now = Date.now()): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60_000));
}

/**
 * OrderTicketCard — satu tiket antrian (PRD-FRONTEND §2.4 OrderQueue).
 * Menampilkan nomor, item, timer, dan StatusActionBar (state machine).
 */
export function OrderTicketCard({
  order,
  onAction,
  busy = false,
}: {
  order: QueueOrderDTO;
  onAction: (status: string) => void;
  busy?: boolean;
}) {
  const actions = staffActions(order.status);
  const age = minutesSince(order.created_at);
  const late = age >= 15;

  return (
    <article
      className="space-y-3 rounded-card border border-brand-100 bg-white p-4 shadow-elev1"
      data-testid="order-ticket"
      aria-label={`Pesanan ${order.order_number}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold tabular-nums text-text">{order.order_number}</p>
          <p className="text-caption text-text-muted">
            {order.customer_name ?? 'Pelanggan'} · {order.fulfillment_type}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[order.status] ?? 'neutral'}>{statusLabel(order.status)}</Badge>
      </header>

      <ul className="space-y-1 text-sm">
        {order.items.map((it) => (
          <li key={it.id} className="flex justify-between gap-2">
            <span>
              <span className="font-semibold tabular-nums">{it.qty}×</span> {it.product_name}
              {it.variant_name && <span className="text-text-muted"> · {it.variant_name}</span>}
              {it.options && it.options.length > 0 && (
                <span className="text-text-muted"> · {it.options.join(', ')}</span>
              )}
              {it.notes && <span className="block text-caption text-warning-fg">Catatan: {it.notes}</span>}
            </span>
            <span className="tabular-nums text-text-muted">{formatIDR(it.line_total)}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between text-caption">
        <span className={late ? 'font-semibold text-error' : 'text-text-muted'} data-testid="ticket-age">
          <span aria-hidden="true">⏱</span> {age} menit{late ? ' · terlambat' : ''}
        </span>
        <span className="font-semibold tabular-nums text-text">{formatIDR(order.total)}</span>
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Aksi untuk ${order.order_number}`}>
          {actions.map((a) => (
            <Button
              key={a.status}
              size="sm"
              variant={a.variant}
              loading={busy}
              onClick={() => onAction(a.status)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}
