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

// ── Auth (PRD-BACKEND §2.1) ──
/** Password minimal 8 karakter, wajib huruf + angka (PRD-QA TC-SEC). */
export const PasswordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .max(72, 'Password maksimal 72 karakter')
  .regex(/[A-Za-z]/, 'Password harus memuat huruf')
  .regex(/[0-9]/, 'Password harus memuat angka');

/** Nomor HP Indonesia: 08xx / +628xx / 628xx. */
export const PhoneSchema = z
  .string()
  .regex(/^(\+?62|0)8[1-9][0-9]{6,11}$/, 'Format nomor HP tidak valid (contoh: 08123456789)');

export const RegisterInput = z.object({
  email: z.string().email('Format email tidak valid').toLowerCase(),
  phone: PhoneSchema.optional(),
  password: PasswordSchema,
  full_name: z.string().min(2, 'Nama minimal 2 karakter').max(100),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

/** Login boleh pakai email ATAU nomor HP. */
export const LoginInput = z
  .object({
    email: z.string().email('Format email tidak valid').toLowerCase().optional(),
    phone: PhoneSchema.optional(),
    password: z.string().min(1, 'Password wajib diisi'),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.phone), {
    message: 'Isi email atau nomor HP',
    path: ['email'],
  });
export type LoginInput = z.infer<typeof LoginInput>;

export const RefreshInput = z.object({
  refresh_token: z.string().min(10, 'refresh_token wajib diisi'),
});
export type RefreshInput = z.infer<typeof RefreshInput>;

export const ForgotPasswordInput = z.object({
  email: z.string().email('Format email tidak valid').toLowerCase(),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInput>;

export const ResetPasswordInput = z.object({
  token: z.string().min(10, 'token wajib diisi'),
  new_password: PasswordSchema,
});

/** Ganti password saat sudah login (verifikasi password lama). */
export const ChangePasswordInput = z.object({
  current_password: z.string().min(1, 'Password saat ini wajib diisi'),
  new_password: PasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInput>;

export const UpdateProfileInput = z.object({
  full_name: z.string().min(2).max(100).optional(),
  phone: PhoneSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

/** Peran RBAC (PRD-BACKEND §5) — urut dari paling luas. */
export const ROLE_HIERARCHY: Record<string, number> = {
  owner: 100,
  manager: 80,
  finance: 70,
  kasir: 60,
  barista: 50,
  member: 10,
  guest: 0,
};

/** Role yang punya cakupan outlet tertentu (scope outlet_id wajib). */
export const OUTLET_SCOPED_ROLES = ['manager', 'kasir', 'barista'] as const;

export interface AuthUserDTO {
  id: string;
  email: string;
  phone: string | null;
  full_name: string;
  role: string;
  outlet_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuthTokensDTO {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface AuthResultDTO extends AuthTokensDTO {
  user: AuthUserDTO;
  /** true bila cart guest berhasil digabung (ADR-011). */
  cart_merged: boolean;
  /** jumlah line item di cart member setelah merge. */
  cart_item_count: number;
}

export interface MeDTO extends AuthUserDTO {
  addresses?: AddressDTO[];
}
