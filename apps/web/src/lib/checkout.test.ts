import { describe, it, expect } from 'vitest';
import {
  CHECKOUT_STEPS,
  CHECKOUT_STEP_COUNT,
  initialDraft,
  validateContact,
  validateAddress,
  validateStep,
  composeNotes,
  buildCheckoutPayload,
  buildPaymentPayload,
  paymentUiStatus,
  paymentLabel,
  emptyAddress,
} from './checkout.js';

describe('checkout — langkah (AC: ≤ 5 langkah)', () => {
  it('tepat 5 langkah kanonik', () => {
    expect(CHECKOUT_STEP_COUNT).toBe(5);
    expect(CHECKOUT_STEPS.map((s) => s.key)).toEqual([
      'fulfillment',
      'schedule',
      'contact',
      'payment',
      'confirm',
    ]);
  });

  it('draft awal = pickup + ASAP + tanpa metode bayar', () => {
    const d = initialDraft('delivery');
    expect(d.fulfillment).toBe('delivery');
    expect(d.schedule.mode).toBe('asap');
    expect(d.paymentMethod).toBeNull();
  });
});

describe('checkout — validasi kontak (Step 3)', () => {
  it('nama terlalu pendek & HP invalid ditolak', () => {
    const e = validateContact({ full_name: 'A', phone: '123' });
    expect(e.full_name).toBeTruthy();
    expect(e.phone).toBeTruthy();
  });

  it('email opsional: kosong OK, format salah ditolak', () => {
    expect(validateContact({ full_name: 'Budi', phone: '08123456789' })).toEqual({});
    const e = validateContact({ full_name: 'Budi', phone: '08123456789', email: 'bukan-email' });
    expect(e.email).toBeTruthy();
  });

  it('menerima format +62', () => {
    expect(validateContact({ full_name: 'Budi', phone: '+628123456789' })).toEqual({});
  });
});

describe('checkout — validasi alamat (Delivery, Step 2)', () => {
  it('alamat lengkap lolos', () => {
    const a = { ...emptyAddress(), recipient_name: 'Budi', phone: '08123456789', address_line: 'Jl. Kemang 1', city: 'Jakarta', postal_code: '12730' };
    expect(validateAddress(a)).toEqual({});
  });

  it('alamat kosong menolak semua field wajib', () => {
    const e = validateAddress(emptyAddress());
    expect(e.recipient_name).toBeTruthy();
    expect(e.address_line).toBeTruthy();
    expect(e.city).toBeTruthy();
    expect(e.postal_code).toBeTruthy();
  });
});

describe('checkout — validateStep', () => {
  it('Step 2 pickup butuh outlet', () => {
    const d = initialDraft('pickup');
    expect(validateStep('schedule', d).outletId).toBeTruthy();
    d.outletId = 'o1';
    expect(validateStep('schedule', d)).toEqual({});
  });

  it('Step 2 delivery tanpa alamat → error alamat', () => {
    const d = initialDraft('delivery');
    d.outletId = 'o1';
    expect(validateStep('schedule', d).address).toBeTruthy();
  });

  it('Step 2 jadwal scheduled tanpa jam → error', () => {
    const d = initialDraft('pickup');
    d.outletId = 'o1';
    d.schedule = { mode: 'scheduled' };
    expect(validateStep('schedule', d).time).toBeTruthy();
  });

  it('Step 4 wajib pilih metode bayar', () => {
    const d = initialDraft('pickup');
    expect(validateStep('payment', d).paymentMethod).toBeTruthy();
    d.paymentMethod = 'qris' as never;
    expect(validateStep('payment', d)).toEqual({});
  });
});

describe('checkout — payload & catatan', () => {
  it('composeNotes menyertakan jadwal & alamat Delivery (≤300)', () => {
    const d = initialDraft('delivery');
    d.schedule = { mode: 'scheduled', time: '14:30' };
    d.address = { ...emptyAddress(), recipient_name: 'Budi', phone: '08123456789', address_line: 'Jl. Kemang 1', city: 'Jakarta', postal_code: '12730' };
    const notes = composeNotes(d)!;
    expect(notes).toContain('Jadwal 14:30');
    expect(notes).toContain('Kirim ke Budi');
    expect(notes.length).toBeLessThanOrEqual(300);
  });

  it('pickup ASAP tanpa catatan → notes undefined', () => {
    expect(composeNotes(initialDraft('pickup'))).toBeUndefined();
  });

  it('buildCheckoutPayload memakai fulfillment, metode, & outlet_id', () => {
    const d = initialDraft('pickup');
    d.paymentMethod = 'gopay' as never;
    d.outletId = 'outlet-1';
    expect(buildCheckoutPayload(d)).toEqual({
      fulfillment_type: 'pickup',
      payment_method: 'gopay',
      outlet_id: 'outlet-1',
      notes: undefined,
    });
  });

  it('buildCheckoutPayload tanpa outlet → throw (order tanpa outlet tak masuk antrian)', () => {
    const d = initialDraft('pickup');
    d.paymentMethod = 'gopay' as never;
    expect(() => buildCheckoutPayload(d)).toThrow(/outlet/i);
  });

  it('buildCheckoutPayload tanpa metode → throw', () => {
    expect(() => buildCheckoutPayload(initialDraft('pickup'))).toThrow();
  });

  it('buildPaymentPayload memetakan kontak ke field gateway', () => {
    const p = buildPaymentPayload({
      orderId: 'o1',
      amount: 82140,
      method: 'qris' as never,
      contact: { full_name: 'Budi', phone: '08123456789', email: 'budi@example.com' },
    });
    expect(p).toMatchObject({ order_id: 'o1', amount: 82140, method: 'qris', customer_phone: '08123456789' });
  });
});

describe('checkout — status pembayaran UI', () => {
  it('PENDING → pending; PAID..COMPLETED → paid; CANCELLED → failed', () => {
    expect(paymentUiStatus('PENDING')).toBe('pending');
    expect(paymentUiStatus('PAID')).toBe('paid');
    expect(paymentUiStatus('READY')).toBe('paid');
    expect(paymentUiStatus('COMPLETED')).toBe('paid');
    expect(paymentUiStatus('CANCELLED')).toBe('failed');
    expect(paymentUiStatus(null)).toBe('pending');
  });

  it('paymentLabel punya label manusiawi', () => {
    expect(paymentLabel('virtual_account')).toBe('Virtual Account');
    expect(paymentLabel('qris')).toBe('QRIS');
  });
});
