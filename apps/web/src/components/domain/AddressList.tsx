import type { AddressDTO } from '@coffibeshop/shared';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';

/** AddressList — daftar alamat + aksi ubah/hapus (ADR-013). */
export function AddressList({
  addresses,
  onEdit,
  onDelete,
  deletingId,
}: {
  addresses: AddressDTO[];
  onEdit: (a: AddressDTO) => void;
  onDelete: (id: string) => void;
  deletingId?: string | null;
}) {
  return (
    <ul className="space-y-2">
      {addresses.map((a) => (
        <li key={a.id} className="rounded-card border border-brand-100 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-text">
              {a.label}
              {a.is_default && (
                <Badge variant="success" className="ml-2">
                  Utama
                </Badge>
              )}
            </p>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            {a.recipient_name} · {a.phone}
          </p>
          <p className="text-sm text-text-muted">
            {a.address_line}, {a.city} {a.postal_code}
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => onEdit(a)}>
              Ubah
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={deletingId === a.id}
              onClick={() => onDelete(a.id)}
              aria-label={`Hapus alamat ${a.label}`}
            >
              Hapus
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
