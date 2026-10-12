import type { OrderDTO } from '@coffibeshop/shared';
import { Link } from 'react-router-dom';
import { formatIDR } from '../../lib/pricing.js';
import { statusLabel } from '../../lib/tracking.js';
import { Badge } from '../ui/Badge.js';
import { Button, buttonClasses } from '../ui/Button.js';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  PENDING: 'warning',
  PAID: 'neutral',
  CONFIRMED: 'neutral',
  BEING_PREPARED: 'neutral',
  READY: 'success',
  COMPLETED: 'success',
  CANCELLED: 'error',
};

/**
 * OrderCard — kartu riwayat order + reorder 1-klik (AC-10, UX-FLOWS §5).
 * `onReorder` menangani pemanggilan API; tombol dinonaktifkan saat proses.
 */
export function OrderCard({
  order,
  onReorder,
  reordering = false,
}: {
  order: OrderDTO;
  onReorder?: (id: string) => void;
  reordering?: boolean;
}) {
  const itemCount = order.items?.reduce((n, i) => n + (i.qty ?? 0), 0) ?? 0;
  const variant = STATUS_VARIANT[order.status] ?? 'neutral';

  return (
    <article className="space-y-3 rounded-card border border-brand-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tabular-nums font-semibold text-text">#{order.order_number}</p>
          <p className="text-caption text-text-muted">
            {new Date(order.created_at).toLocaleString('id-ID')} · {itemCount} item
          </p>
        </div>
        <Badge variant={variant}>{statusLabel(order.status)}</Badge>
      </div>

      <ul className="space-y-1 text-sm text-text-muted">
        {order.items?.slice(0, 3).map((i, idx) => (
          <li key={i.id ?? idx} className="truncate">
            {i.qty}× {i.product_name ?? 'Item'}
          </li>
        ))}
        {(order.items?.length ?? 0) > 3 && <li>…dan {order.items.length - 3} lainnya</li>}
      </ul>

      <div className="flex items-center justify-between gap-3">
        <span className="tabular-nums font-semibold text-brand">{formatIDR(order.total)}</span>
        <div className="flex items-center gap-2">
          <Link
            to={`/orders/${order.id}`}
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            Lacak
          </Link>
          {onReorder && (
            <Button
              variant="primary"
              size="sm"
              loading={reordering}
              onClick={() => onReorder(order.id)}
              aria-label={`Pesan ulang pesanan ${order.order_number}`}
            >
              Pesan ulang
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
