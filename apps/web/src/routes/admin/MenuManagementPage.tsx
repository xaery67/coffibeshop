import { useState } from 'react';
import type { ProductDTO } from '@coffibeshop/shared';
import { useAdminOutlet } from '../../components/admin/AdminShell.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Badge } from '../../components/ui/Badge.js';
import { Toast } from '../../components/ui/Toast.js';
import {
  useCreateMenuProduct,
  useDeleteMenuProduct,
  useMenuCategories,
  useMenuProducts,
  useUpdateMenuProduct,
} from '../../hooks/useMenuAdmin.js';
import { formatIDR } from '../../lib/reporting.js';
import { canWriteMenu } from '../../lib/roles.js';
import { useAuth } from '../../hooks/useAuth.js';

interface FormState {
  id?: string;
  name: string;
  category_id: string;
  base_price: string;
  is_available: boolean;
}

const EMPTY_FORM: FormState = { name: '', category_id: '', base_price: '', is_available: true };

/**
 * MenuManagementPage — CRUD menu outlet-scoped (PRD-BACKEND §2.2, PRD-FRONTEND §2.4).
 * Tulis hanya untuk owner/manager (`canWriteMenu`); kasir/barista melihat read-only.
 */
export function MenuManagementPage() {
  const { outletId } = useAdminOutlet();
  const { user } = useAuth();
  const writable = canWriteMenu(user?.role);

  const [categoryId, setCategoryId] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [toast, setToast] = useState<{ variant: 'success' | 'error'; message: string } | null>(null);

  const products = useMenuProducts(outletId, { category_id: categoryId });
  const categories = useMenuCategories(outletId);
  const create = useCreateMenuProduct(outletId);
  const update = useUpdateMenuProduct(outletId);
  const remove = useDeleteMenuProduct(outletId);

  const columns: Column<ProductDTO>[] = [
    {
      key: 'name',
      header: 'Produk',
      sortValue: (r) => r.name,
      render: (r) => (
        <span>
          <span className="font-semibold text-text">{r.name}</span>
          {!r.is_available && (
            <Badge variant="neutral" className="ml-2">
              Nonaktif
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Kategori',
      sortValue: (r) => r.category?.name ?? '',
      render: (r) => r.category?.name ?? '—',
    },
    {
      key: 'price',
      header: 'Harga',
      align: 'right',
      sortValue: (r) => r.base_price,
      render: (r) => <span className="tabular-nums">{formatIDR(r.base_price)}</span>,
    },
    {
      key: 'availability',
      header: 'Tersedia',
      align: 'center',
      sortValue: (r) => (r.is_available ? 1 : 0),
      render: (r) => (r.is_available ? 'Ya' : 'Tidak'),
    },
    ...(writable
      ? [
          {
            key: 'actions',
            header: 'Aksi',
            align: 'right' as const,
            render: (r: ProductDTO) => (
              <span className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      id: r.id,
                      name: r.name,
                      category_id: r.category_id,
                      base_price: String(r.base_price),
                      is_available: r.is_available,
                    })
                  }
                >
                  Ubah
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={remove.isPending}
                  onClick={() => handleDelete(r)}
                >
                  Hapus
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ];

  async function handleDelete(r: ProductDTO) {
    try {
      await remove.mutateAsync(r.id);
      setToast({ variant: 'success', message: `${r.name} dihapus` });
    } catch (e) {
      setToast({ variant: 'error', message: (e as Error).message || 'Gagal menghapus produk' });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const price = Number(form.base_price);
    if (!form.name.trim() || !form.category_id || !Number.isFinite(price) || price < 0) {
      setToast({ variant: 'error', message: 'Lengkapi nama, kategori, dan harga yang valid' });
      return;
    }
    const payload = {
      name: form.name.trim(),
      category_id: form.category_id,
      base_price: Math.round(price),
      is_available: form.is_available,
    };
    try {
      if (form.id) {
        await update.mutateAsync({ id: form.id, input: payload });
        setToast({ variant: 'success', message: 'Produk diperbarui' });
      } else {
        await create.mutateAsync(payload);
        setToast({ variant: 'success', message: 'Produk ditambahkan' });
      }
      setForm(null);
    } catch (err) {
      setToast({ variant: 'error', message: (err as Error).message || 'Gagal menyimpan produk' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {products.data?.length ?? 0} produk di outlet ini
          {!writable && ' · mode baca-saja (peran Anda tidak boleh mengubah menu)'}
        </p>
        {writable && (
          <Button onClick={() => setForm({ ...EMPTY_FORM, category_id: categories.data?.[0]?.id ?? '' })}>
            + Produk baru
          </Button>
        )}
      </div>

      {form && writable && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-card border border-brand-100 bg-white p-4" aria-label="Form produk">
          <h2 className="text-h3 text-text">{form.id ? 'Ubah produk' : 'Produk baru'}</h2>
          <Input label="Nama produk" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="block space-y-1 text-sm">
            <span className="font-semibold text-text">Kategori</span>
            <select
              required
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              <option value="">Pilih kategori…</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Harga dasar (Rp)"
            required
            inputMode="numeric"
            value={form.base_price}
            onChange={(e) => setForm({ ...form, base_price: e.target.value })}
          />
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={form.is_available}
              onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
              className="h-5 w-5"
            />
            Tersedia untuk dipesan
          </label>
          <div className="flex gap-2">
            <Button type="submit" loading={create.isPending || update.isPending}>
              Simpan
            </Button>
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              Batal
            </Button>
          </div>
        </form>
      )}

      <DataTable
        columns={columns}
        rows={products.data ?? []}
        rowKey={(r) => r.id}
        pageSize={10}
        searchable
        searchPlaceholder="Cari produk…"
        toolbar={
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="sr-only">Filter kategori</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Filter kategori"
              className="min-h-[44px] rounded-lg border border-border bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              <option value="">Semua kategori</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        }
        emptyMessage={products.isLoading ? 'Memuat…' : 'Tidak ada produk cocok.'}
        caption="Daftar menu outlet"
        data-testid="menu-table"
      />

      {toast && <Toast variant={toast.variant} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
