import { z } from 'zod';
import { FulfillmentType, PaymentMethod, OrderStatus } from './enums.js';

// ── Catalog ──
export interface CategoryDTO { id: string; name: string; slug: string; sort_order: number; }
export interface VariantDTO { id: string; name: string; price_delta: number; }
export interface OptionDTO { id: string; name: string; price_delta: number; }
export interface ProductDTO {
  id: string; name: string; slug?: string; description: string | null;
  base_price: number; image_url: string | null; is_active: boolean;
  category_id: string; variants: VariantDTO[]; options: OptionDTO[];
}

// ── Cart ──
export const CartItemInput = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  option_ids: z.array(z.string().uuid()).default([]),
  qty: z.number().int().min(1).max(99),
  notes: z.string().max(200).optional(),
});
export type CartItemInput = z.infer<typeof CartItemInput>;

export interface CartItemDTO extends CartItemInput {
  id: string;
  unit_price: number;
  line_total: number;
  product_name: string;
  unavailable?: boolean;
}
export interface CartDTO {
  items: CartItemDTO[];
  subtotal: number;
  tax: number;
  shipping_fee: number;
  discount: number;
  total: number;
  fulfillment_type: FulfillmentType;
  voucher_code?: string | null;
}

// ── Checkout / Order ──
export const CheckoutInput = z.object({
  fulfillment_type: z.nativeEnum(FulfillmentType),
  payment_method: z.nativeEnum(PaymentMethod),
  address_id: z.string().uuid().optional(),
  voucher_code: z.string().optional(),
  redeem_points: z.number().int().min(0).optional(),
  notes: z.string().max(300).optional(),
});
export type CheckoutInput = z.infer<typeof CheckoutInput>;

export interface CheckoutResultDTO {
  order_id: string;
  order_number: string;
  status: OrderStatus;
  tracking_token: string;
  payment_initiate_url: string;
}

export interface OrderDTO {
  id: string; order_number: string; status: OrderStatus;
  total: number; fulfillment_type: FulfillmentType;
  created_at: string; estimated_ready_time: string | null;
  items: CartItemDTO[];
}

// ── Address book (Delivery MVP) ──
export const AddressInput = z.object({
  label: z.string().min(1).max(50),
  recipient_name: z.string().min(1).max(100),
  phone: z.string().min(8).max(20),
  address_line: z.string().min(5).max(300),
  city: z.string().min(1).max(100),
  postal_code: z.string().min(3).max(10),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  is_default: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof AddressInput>;
export interface AddressDTO extends AddressInput { id: string; }

// ── Config publik (GET /config, ADR-007) ──
export interface PublicConfigDTO {
  tax_rate: number;
  point_value: number;
  currency: string;
  active_payment_methods: PaymentMethod[];
  shipping_flat_fee: number;
  sse_heartbeat_interval_ms: number;
  tracking_poll_interval_ms: number;
}
