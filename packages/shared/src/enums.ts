// ── Status order kanonik (PRD-BACKEND §2.3) ──
export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CONFIRMED = 'CONFIRMED',
  BEING_PREPARED = 'BEING_PREPARED',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// ── Role (PRD-BACKEND §2.1) ──
export enum Role {
  OWNER = 'owner',
  MANAGER = 'manager',
  KASIR = 'kasir',
  BARISTA = 'barista',
  FINANCE = 'finance',
  GUEST = 'guest',
  MEMBER = 'member',
}

export enum FulfillmentType {
  PICKUP = 'pickup',
  DELIVERY = 'delivery',
  DINE_IN = 'dine_in',
}

export enum PaymentMethod {
  QRIS = 'qris',
  GOPAY = 'gopay',
  OVO = 'ovo',
  DANA = 'dana',
  LINKAJA = 'linkaja',
  SHOPEEPAY = 'shopeepay',
  VIRTUAL_ACCOUNT = 'virtual_account',
  CREDIT_CARD = 'credit_card',
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
}
