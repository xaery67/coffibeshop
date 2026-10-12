import { useNavigate } from 'react-router-dom';
import { useOrderHistory, useReorder, reorderSummary } from '../hooks/useAccount.js';
import { useAuth } from '../hooks/useAuth.js';
import { OrderCard } from '../components/domain/OrderCard.js';
import { EmptyState, ErrorState } from '../components/domain/States.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { Toast } from '../components/ui/Toast.js';
import { useState } from 'react';

/**
 * OrderHistoryPage — riwayat order + reorder 1-klik (AC-10, PRD-FRONTEND §4.4b).
 * Butuh login (member). Guest diarahkan login.
 */
export function OrderHistoryPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError, refetch } = useOrderHistory();
  const reorder = useReorder();
  const [toast, setToast] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <section className="space-y-4">
        <h1 className="text-h1 text-text">Riwayat Pesanan</h1>
        <EmptyState
          icon="🔐"
          title="Masuk untuk melihat riwayat"
          description="Riwayat & pesan ulang tersedia untuk member yang sudah masuk."
        />
      </section>
    );
  }

  const handleReorder = (id: string) => {
    reorder.mutate(id, {
      onSuccess: (res) => {
        const { added, unavailable } = reorderSummary(res.items);
        if (added === 0) {
          setToast('Tidak ada item yang bisa dipesan ulang (produk tidak tersedia).');
          return;
        }
        const note = unavailable > 0 ? ` (${unavailable} item tak tersedia dilewati)` : '';
        setToast(`${added} item ditambahkan ke keranjang${note}.`);
        navigate('/cart');
      },
      onError: (e) => setToast(e instanceof Error ? e.message : 'Gagal memesan ulang.'),
    });
  };

  return (
    <section className="space-y-4">
      <h1 className="text-h1 text-text">Riwayat Pesanan</h1>

      {isLoading && <Skeleton variant="row" count={3} />}

      {isError && <ErrorState message="Gagal memuat riwayat pesanan." onRetry={() => void refetch()} />}

      {data && data.data.length === 0 && (
        <EmptyState
          icon="🧾"
          title="Belum ada pesanan"
          description="Yuk pesan kopi pertamamu."
        />
      )}

      {data && data.data.length > 0 && (
        <div className="space-y-3">
          {data.data.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onReorder={handleReorder}
              reordering={reorder.isPending && reorder.variables === order.id}
            />
          ))}
        </div>
      )}

      {toast && <Toast variant="success" message={toast} onClose={() => setToast(null)} />}
    </section>
  );
}
