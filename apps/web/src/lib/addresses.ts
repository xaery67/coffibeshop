import type { AddressDTO, AddressInput } from '@coffibeshop/shared';
import { apiFetch } from './api.js';

/**
 * Address book (Delivery) — ADR-013, issue #12.
 * `GET/POST/PUT/DELETE /auth/me/addresses`. `is_default=true` menonaktifkan
 * default lain di server (exclusive). Butuh login (JWT via `apiFetch`).
 */

/** GET /auth/me/addresses — daftar alamat member. */
export function getAddresses(): Promise<AddressDTO[]> {
  return apiFetch<AddressDTO[]>('/auth/me/addresses');
}

/** POST /auth/me/addresses — tambah alamat. */
export function createAddress(input: AddressInput): Promise<AddressDTO> {
  return apiFetch<AddressDTO>('/auth/me/addresses', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** PUT /auth/me/addresses/:id — ubah alamat (partial). */
export function updateAddress(id: string, input: Partial<AddressInput>): Promise<AddressDTO> {
  return apiFetch<AddressDTO>(`/auth/me/addresses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/** DELETE /auth/me/addresses/:id — hapus alamat. */
export function deleteAddress(id: string): Promise<unknown> {
  return apiFetch<unknown>(`/auth/me/addresses/${id}`, { method: 'DELETE' });
}

/** Validasi form alamat (dipakai AddressForm). Mengembalikan map field → pesan. */
export function validateAddress(input: Partial<AddressInput>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.label?.trim()) errors.label = 'Label wajib diisi (mis. Rumah, Kantor).';
  if (!input.recipient_name?.trim() || input.recipient_name.trim().length < 2)
    errors.recipient_name = 'Nama penerima minimal 2 karakter.';
  const phone = (input.phone ?? '').replace(/\D/g, '');
  if (phone.length < 8 || phone.length > 20)
    errors.phone = 'Nomor telepon 8–20 digit.';
  if (!input.address_line?.trim() || input.address_line.trim().length < 5)
    errors.address_line = 'Alamat minimal 5 karakter.';
  if (!input.city?.trim()) errors.city = 'Kota wajib diisi.';
  if (!input.postal_code?.trim() || input.postal_code.trim().length < 3)
    errors.postal_code = 'Kode pos minimal 3 karakter.';
  return errors;
}

/** Alamat default (atau yang pertama) untuk checkout delivery. */
export function pickDefaultAddress(list: AddressDTO[]): AddressDTO | null {
  if (!list.length) return null;
  return list.find((a) => a.is_default) ?? list[0];
}
