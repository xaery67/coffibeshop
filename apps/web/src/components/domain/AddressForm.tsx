import { useState } from 'react';
import type { AddressDTO, AddressInput } from '@coffibeshop/shared';
import { validateAddress } from '../../lib/addresses.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';

const EMPTY: AddressInput = {
  label: '',
  recipient_name: '',
  phone: '',
  address_line: '',
  city: '',
  postal_code: '',
  is_default: false,
};

/**
 * AddressForm — tambah/ubah alamat (ADR-013). Validasi klien sebelum kirim;
 * error ditampilkan inline per field (`aria-invalid` + pesan).
 */
export function AddressForm({
  initial,
  onSubmit,
  onCancel,
  submitting = false,
}: {
  initial?: AddressDTO;
  onSubmit: (input: AddressInput) => void;
  onCancel?: () => void;
  submitting?: boolean;
}) {
  const [form, setForm] = useState<AddressInput>(() => ({
    ...EMPTY,
    ...(initial
      ? {
          label: initial.label,
          recipient_name: initial.recipient_name,
          phone: initial.phone,
          address_line: initial.address_line,
          city: initial.city,
          postal_code: initial.postal_code,
          is_default: initial.is_default,
        }
      : {}),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof AddressInput, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateAddress(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Input
        label="Label"
        required
        value={form.label}
        onChange={(e) => set('label', e.target.value)}
        error={errors.label}
        placeholder="Rumah, Kantor…"
      />
      <Input
        label="Nama penerima"
        required
        value={form.recipient_name}
        onChange={(e) => set('recipient_name', e.target.value)}
        error={errors.recipient_name}
      />
      <Input
        label="Nomor telepon"
        required
        inputMode="tel"
        value={form.phone}
        onChange={(e) => set('phone', e.target.value)}
        error={errors.phone}
        placeholder="08123456789"
      />
      <Input
        label="Alamat lengkap"
        required
        value={form.address_line}
        onChange={(e) => set('address_line', e.target.value)}
        error={errors.address_line}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Kota"
          required
          value={form.city}
          onChange={(e) => set('city', e.target.value)}
          error={errors.city}
        />
        <Input
          label="Kode pos"
          required
          inputMode="numeric"
          value={form.postal_code}
          onChange={(e) => set('postal_code', e.target.value)}
          error={errors.postal_code}
        />
      </div>

      <label className="flex min-h-[44px] items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={form.is_default}
          onChange={(e) => set('is_default', e.target.checked)}
          className="h-5 w-5"
        />
        Jadikan alamat utama
      </label>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="md" loading={submitting}>
          Simpan alamat
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="md" onClick={onCancel}>
            Batal
          </Button>
        )}
      </div>
    </form>
  );
}
