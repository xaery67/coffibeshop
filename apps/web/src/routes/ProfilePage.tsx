import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe.js';
import { useAuth } from '../hooks/useAuth.js';
import {
  useAddresses,
  useAddressMutations,
  useLoyaltyPoints,
  useLoyaltyVouchers,
  useRedeem,
} from '../hooks/useAccount.js';
import { useConfig } from '../hooks/useConfig.js';
import { pointsToRupiah } from '../lib/loyalty.js';
import { AddressForm } from '../components/domain/AddressForm.js';
import { AddressList } from '../components/domain/AddressList.js';
import { EmptyState, ErrorState } from '../components/domain/States.js';
import { Button } from '../components/ui/Button.js';
import { Badge } from '../components/ui/Badge.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { Toast } from '../components/ui/Toast.js';
import type { AddressDTO, AddressInput } from '@coffibeshop/shared';

/**
 * ProfilePage — profil member + loyalty (poin, voucher, redeem) + address book
 * (PRD-FRONTEND §4.4b, ADR-013). Butuh login; guest diarahkan untuk masuk.
 */
export function ProfilePage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const me = useMe(isAuthenticated);
  const points = useLoyaltyPoints();
  const vouchers = useLoyaltyVouchers();
  const redeem = useRedeem();
  const config = useConfig();

  const addresses = useAddresses(isAuthenticated);
  const { create, update, remove } = useAddressMutations();
  const [editing, setEditing] = useState<AddressDTO | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const pointValue = config.data?.point_value ?? 1;
  const balance = points.data?.points ?? 0;

  if (!isAuthenticated) {
    return (
      <section className="space-y-4">
        <h1 className="text-h1 text-text">Profil</h1>
        <EmptyState
          icon="🔐"
          title="Masuk untuk melihat profil"
          description="Profil, poin loyalty, dan buku alamat tersedia untuk member yang sudah masuk."
        />
      </section>
    );
  }

  const handleRedeem = () => {
    if (balance <= 0) {
      setToast('Belum ada poin untuk ditukar.');
      return;
    }
    redeem.mutate(
      { points_to_redeem: balance },
      {
        onSuccess: (res) =>
          setToast(
            `Berhasil menukar ${res.points_redeemed} poin → voucher ${res.voucher_code}` +
              (res.discount_amount ? ` (diskon Rp${res.discount_amount.toLocaleString('id-ID')})` : ''),
          ),
        onError: (e) => setToast(e instanceof Error ? e.message : 'Gagal menukar poin.'),
      },
    );
  };

  const handleCreate = (input: AddressInput) => {
    create.mutate(input, {
      onSuccess: () => {
        setAdding(false);
        setToast('Alamat ditambahkan.');
      },
      onError: (e) => setToast(e instanceof Error ? e.message : 'Gagal menambah alamat.'),
    });
  };

  const handleUpdate = (id: string, input: Partial<AddressInput>) => {
    update.mutate(
      { id, input },
      {
        onSuccess: () => {
          setEditing(null);
          setToast('Alamat diperbarui.');
        },
        onError: (e) => setToast(e instanceof Error ? e.message : 'Gagal memperbarui alamat.'),
      },
    );
  };

  const handleDelete = (id: string) => {
    remove.mutate(id, {
      onSuccess: () => setToast('Alamat dihapus.'),
      onError: (e) => setToast(e instanceof Error ? e.message : 'Gagal menghapus alamat.'),
    });
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-h1 text-text">Profil</h1>
        <Button variant="ghost" size="sm" onClick={() => { logout(); navigate('/'); }}>
          Keluar
        </Button>
      </div>

      {/* Profil member */}
      <div className="rounded-card border border-brand-100 bg-white p-4">
        {me.isLoading && <Skeleton variant="row" count={2} />}
        {me.isError && <ErrorState message="Gagal memuat profil." onRetry={() => void me.refetch()} />}
        {me.data && (
          <div className="space-y-1">
            <p className="text-lg font-semibold text-text">{me.data.full_name}</p>
            <p className="text-sm text-text-muted">{me.data.email}</p>
            {me.data.phone && <p className="text-sm text-text-muted">{me.data.phone}</p>}
          </div>
        )}
        {!me.data && !me.isLoading && user && (
          <div className="space-y-1">
            <p className="text-lg font-semibold text-text">{user.full_name}</p>
            <p className="text-sm text-text-muted">{user.email}</p>
          </div>
        )}
      </div>

      {/* Loyalty — poin */}
      <div className="rounded-card border border-brand-100 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text">Poin Loyalty</h2>
          <Badge variant="promo" icon="⭐">{balance} poin</Badge>
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Senilai Rp{pointsToRupiah(balance, pointValue).toLocaleString('id-ID')}
        </p>
        <div className="mt-3">
          <Button
            variant="primary"
            size="md"
            loading={redeem.isPending}
            disabled={balance <= 0}
            onClick={handleRedeem}
          >
            Tukar semua poin → voucher
          </Button>
        </div>
        {points.isError && <p className="mt-2 text-sm text-error">Gagal memuat poin.</p>}
      </div>

      {/* Loyalty — voucher */}
      <div className="rounded-card border border-brand-100 bg-white p-4">
        <h2 className="text-h3 text-text">Voucher Saya</h2>
        {vouchers.isLoading && <Skeleton variant="row" count={1} />}
        {vouchers.data && vouchers.data.length === 0 && (
          <p className="mt-2 text-sm text-text-muted">Belum ada voucher aktif.</p>
        )}
        {vouchers.data && vouchers.data.length > 0 && (
          <ul className="mt-2 space-y-2">
            {vouchers.data.map((v) => (
              <li
                key={v.id ?? v.code}
                className="flex items-center justify-between rounded-lg border border-brand-100 px-3 py-2"
              >
                <div>
                  <p className="font-mono text-sm font-semibold text-text">{v.code}</p>
                  {v.min_purchase ? (
                    <p className="text-xs text-text-muted">
                      Min. belanja Rp{v.min_purchase.toLocaleString('id-ID')}
                    </p>
                  ) : null}
                </div>
                {typeof v.discount_value === 'number' && (
                  <Badge variant="success">-Rp{v.discount_value.toLocaleString('id-ID')}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Address book (ADR-013) */}
      <div className="rounded-card border border-brand-100 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text">Buku Alamat</h2>
          {!adding && !editing && (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              + Tambah
            </Button>
          )}
        </div>

        {adding && (
          <div className="mt-3">
            <AddressForm onSubmit={handleCreate} onCancel={() => setAdding(false)} />
          </div>
        )}

        {editing && (
          <div className="mt-3">
            <AddressForm
              key={editing.id}
              initial={editing}
              onSubmit={(input) => handleUpdate(editing.id, input)}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}

        {addresses.isLoading && <Skeleton variant="row" count={2} />}
        {addresses.isError && (
          <ErrorState message="Gagal memuat alamat." onRetry={() => void addresses.refetch()} />
        )}
        {addresses.data && addresses.data.length === 0 && !adding && (
          <p className="mt-2 text-sm text-text-muted">Belum ada alamat tersimpan.</p>
        )}
        {addresses.data && addresses.data.length > 0 && (
          <div className="mt-3">
            <AddressList
              addresses={addresses.data}
              onEdit={(a) => { setEditing(a); setAdding(false); }}
              onDelete={handleDelete}
              deletingId={remove.isPending ? remove.variables : null}
            />
          </div>
        )}
      </div>

      {toast && <Toast variant="success" message={toast} onClose={() => setToast(null)} />}
    </section>
  );
}
