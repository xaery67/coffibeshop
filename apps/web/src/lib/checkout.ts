import { PhoneSchema } from '@coffibeshop/shared';
import type { PaymentMethod } from '@coffibeshop/shared';

/**
 * Alur checkout (UX-FLOWS.md §3) — logika MURNI & teruji.
 * Total langkah = 5 (memenuhi AC "checkout ≤ 5 langkah dari cart").
 * Field alamat TIDAK menambah langkah — hanya muncul di Step 2 bila Delivery.
 */

export type Fulfillment = 'pickup' | 'dine_in' | 'delivery';

export interface ContactDraft {
  full_name: string;
  phone: string;
  email?: string;
}

export interface AddressDraft {
  label: string;
  recipient_name: string;
  phone: string;
  address_line: string;
  city: string;
  postal_code: string;
}

export interface ScheduleDraft {
  mode: 'asap' | 'scheduled';
  /** HH:mm, wajib bila mode = scheduled. */
  time?: string;
}

export interface CheckoutDraft {
  fulfillment: Fulfillment;
  outletId: string | null;
  /** Nama outlet terpilih (disertakan ke catatan order; backend tidak punya field outlet_id). */
  outletName?: string;
  schedule: ScheduleDraft;
  contact: ContactDraft;
  address: AddressDraft | null;
  paymentMethod: PaymentMethod | null;
}

/** 5 langkah kanonik checkout (UX-FLOWS §3.1). */
export const CHECKOUT_STEPS = [
  { key: 'fulfillment', label: 'Pengambilan' },
  { key: 'schedule', label: 'Waktu & Outlet' },
  { key: 'contact', label: 'Kontak' },
  { key: 'payment', label: 'Pembayaran' },
  { key: 'confirm', label: 'Konfirmasi' },
] as const;

export type CheckoutStepKey = (typeof CHECKOUT_STEPS)[number]['key'];
export const CHECKOUT_STEP_COUNT = CHECKOUT_STEPS.length;

export const FULFILLMENT_LABELS: { value: Fulfillment; label: string }[] = [
  { value: 'pickup', label: 'Ambil di outlet' },
  { value: 'dine_in', label: 'Dine-in' },
  { value: 'delivery', label: 'Delivery' },
];

/** Label metode bayar (UX-FLOWS §1). Hanya metode aktif dari `/config` yang ditampilkan. */
export const PAYMENT_LABELS: Record<string, string> = {
  qris: 'QRIS',
  gopay: 'GoPay',
  ovo: 'OVO',
  dana: 'DANA',
  linkaja: 'LinkAja',
  shopeepay: 'ShopeePay',
  virtual_account: 'Virtual Account',
  credit_card: 'Kartu Kredit/Debit',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
};

export function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method] ?? method;
}

export function emptyContact(): ContactDraft {
  return { full_name: '', phone: '', email: '' };
}

export function emptyAddress(): AddressDraft {
  return { label: 'Rumah', recipient_name: '', phone: '', address_line: '', city: '', postal_code: '' };
}

export function initialDraft(fulfillment: Fulfillment = 'pickup'): CheckoutDraft {
  return {
    fulfillment,
    outletId: null,
    schedule: { mode: 'asap' },
    contact: emptyContact(),
    address: null,
    paymentMethod: null,
  };
}

export type FieldErrors = Record<string, string>;

/** Validasi kontak (Step 3) — pesan menyebut cara perbaikan (DS §7.3). */
export function validateContact(c: ContactDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (c.full_name.trim().length < 2) errors.full_name = 'Nama minimal 2 karakter.';
  if (!PhoneSchema.safeParse(c.phone.trim()).success) {
    errors.phone = 'Nomor WhatsApp harus 10–13 digit, contoh 08123456789.';
  }
  if (c.email && c.email.trim() && !/^\S+@\S+\.\S+$/.test(c.email.trim())) {
    errors.email = 'Format email tidak valid.';
  }
  return errors;
}

/** Validasi alamat (Step 2, mode Delivery). */
export function validateAddress(a: AddressDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (a.recipient_name.trim().length < 2) errors.recipient_name = 'Nama penerima minimal 2 karakter.';
  if (!PhoneSchema.safeParse(a.phone.trim()).success) errors.address_phone = 'Nomor HP penerima tidak valid.';
  if (a.address_line.trim().length < 5) errors.address_line = 'Alamat minimal 5 karakter.';
  if (a.city.trim().length < 1) errors.city = 'Kota wajib diisi.';
  if (a.postal_code.trim().length < 3) errors.postal_code = 'Kode pos minimal 3 karakter.';
  return errors;
}

/** Validasi per langkah. Mengembalikan map field→pesan (kosong = valid). */
export function validateStep(
  step: CheckoutStepKey,
  draft: CheckoutDraft,
  opts: { requireOutlet?: boolean } = {},
): FieldErrors {
  const requireOutlet = opts.requireOutlet ?? true;
  switch (step) {
    case 'fulfillment':
      return {};
    case 'schedule': {
      const errors: FieldErrors = {};
      if (requireOutlet && !draft.outletId) errors.outletId = 'Pilih outlet.';
      if (draft.schedule.mode === 'scheduled' && !draft.schedule.time) errors.time = 'Pilih jam pengambilan.';
      if (draft.fulfillment === 'delivery') {
        if (!draft.address) errors.address = 'Alamat wajib untuk Delivery.';
        else Object.assign(errors, validateAddress(draft.address));
      }
      return errors;
    }
    case 'contact':
      return validateContact(draft.contact);
    case 'payment':
      return draft.paymentMethod ? {} : { paymentMethod: 'Pilih metode pembayaran.' };
    case 'confirm':
      return {};
  }
}

/**
 * Catatan order: backend checkout hanya menerima `notes` (bukan field kontak/alamat terpisah),
 * jadi jadwal + alamat Delivery disertakan di sini agar tidak hilang. Maks 300 char.
 */
export function composeNotes(draft: CheckoutDraft): string | undefined {
  const parts: string[] = [];
  if (draft.outletName) parts.push(`Outlet ${draft.outletName}`);
  if (draft.schedule.mode === 'scheduled' && draft.schedule.time) parts.push(`Jadwal ${draft.schedule.time}`);
  if (draft.fulfillment === 'delivery' && draft.address) {
    const a = draft.address;
    parts.push(
      `Kirim ke ${a.recipient_name} (${a.phone}): ${a.address_line}, ${a.city} ${a.postal_code}`,
    );
  }
  const notes = parts.join(' | ').trim();
  return notes ? notes.slice(0, 300) : undefined;
}

/**
 * Payload `POST /orders/checkout` (CheckoutInput, PRD-BACKEND §4).
 *
 * `outlet_id` WAJIB dikirim: order tanpa outlet tidak akan pernah muncul di
 * antrian outlet (`GET /orders/queue?outlet_id=`) — bug "pesanan tak masuk
 * dashboard admin" setelah pembayaran.
 */
export function buildCheckoutPayload(draft: CheckoutDraft) {
  if (!draft.paymentMethod) throw new Error('Metode pembayaran belum dipilih');
  if (!draft.outletId) throw new Error('Outlet belum dipilih');
  return {
    fulfillment_type: draft.fulfillment,
    payment_method: draft.paymentMethod,
    outlet_id: draft.outletId,
    notes: composeNotes(draft),
  };
}

/** Payload `POST /payments/initiate` (kontak dikirim ke gateway). */
export function buildPaymentPayload(args: {
  orderId: string;
  amount: number;
  method: PaymentMethod;
  contact: ContactDraft;
}) {
  return {
    order_id: args.orderId,
    amount: args.amount,
    method: args.method,
    customer_name: args.contact.full_name || undefined,
    customer_email: args.contact.email || undefined,
    customer_phone: args.contact.phone || undefined,
  };
}

export type PaymentUiStatus = 'pending' | 'paid' | 'failed' | 'expired';

/** Peta status order kanonik → status UI halaman pembayaran (UX-FLOWS §4). */
export function paymentUiStatus(orderStatus: string | null | undefined): PaymentUiStatus {
  switch (orderStatus) {
    case 'PENDING':
      return 'pending';
    case 'PAID':
    case 'CONFIRMED':
    case 'BEING_PREPARED':
    case 'READY':
    case 'COMPLETED':
      return 'paid';
    case 'CANCELLED':
      return 'failed';
    default:
      return 'pending';
  }
}
