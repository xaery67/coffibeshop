import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { redisCache } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { BadRequest } from '../../lib/http.js';

const CART_TTL = 7 * 24 * 60 * 60; // 7 hari (ADR-006)

/** Normalisasi input: terima `selected_options` (PRD) dan `option_ids` (FE), `quantity` dan `qty`. */
export function normalizeCartItemInput(item: any) {
  return {
    product_id: item.product_id,
    variant_id: item.variant_id ?? null,
    option_ids: item.selected_options ?? item.option_ids ?? [],
    qty: item.quantity ?? item.qty ?? 1,
    notes: item.notes,
  };
}

/** Key cart member & guest. */
const memberKey = (userId: string) => `cart:member:${userId}`;
const guestKey = (guestId: string) => `cart:guest:${guestId}`;

/** Sumber kebenaran cart = Redis (ADR-006). */
export async function readCart(key: string): Promise<any[]> {
  const raw = await redisCache.get(key);
  return raw ? JSON.parse(raw) : [];
}
export async function writeCart(key: string, items: any[]): Promise<void> {
  await redisCache.setex(key, CART_TTL, JSON.stringify(items));
}

/** Cart meta (voucher, points) disimpan terpisah dari items. */
const metaKey = (key: string) => `${key}:meta`;
export async function readCartMeta(key: string): Promise<{ voucher_code?: string; discount?: number; points_to_redeem?: number; points_discount?: number } | null> {
  const raw = await redisCache.get(metaKey(key));
  return raw ? JSON.parse(raw) : null;
}
export async function writeCartMeta(key: string, meta: { voucher_code?: string; discount?: number; points_to_redeem?: number; points_discount?: number }): Promise<void> {
  await redisCache.setex(metaKey(key), CART_TTL, JSON.stringify(meta));
}
export async function clearCartMeta(key: string): Promise<void> {
  await redisCache.del(metaKey(key));
}

/** Hitung harga (pricing engine sederhana — server-side, PRD-BACKEND §4.4, PRD-FRONTEND §355-359). */
export async function priceCart(items: any[], opts?: { shipping?: number; discount?: number; pointsDiscount?: number }) {
  // Batch fetch products untuk hindari N+1 (bug #10)
  const productIds = [...new Set(items.map(i => i.product_id))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { variants: true, options: { include: { values: true } } },
  });
  const productMap = new Map(products.map(p => [p.id, p]));

  let subtotal = 0;
  const priced = [];

  for (const item of items) {
    const product = productMap.get(item.product_id);
    if (!product || !product.is_active || !product.is_available) {
      priced.push({ ...item, unavailable: true, unit_price: 0, line_total: 0, unavailable_reason: 'Produk tidak tersedia' });
      continue;
    }

    // Cek stok varian (bug #8)
    if (item.variant_id) {
      const variant = product.variants.find(v => v.id === item.variant_id);
      if (variant && variant.stock_quantity !== null && variant.stock_quantity <= 0) {
        priced.push({ ...item, unavailable: true, unit_price: 0, line_total: 0, unavailable_reason: 'Varian habis' });
        continue;
      }
    }

    // Bug #3: validasi opsi milik produk yang benar
    const allValues = product.options.flatMap((o) => o.values);
    for (const oid of item.option_ids ?? []) {
      const v = allValues.find((x) => x.id === oid);
      if (!v) {
        priced.push({ ...item, unavailable: true, unit_price: 0, line_total: 0, unavailable_reason: 'Opsi tidak valid untuk produk ini' });
        // mark as invalid to skip
        break;
      }
    }
    // If we pushed an unavailable item due to invalid option, skip the rest
    const lastPriced = priced[priced.length - 1];
    if (lastPriced && lastPriced.product_id === item.product_id && lastPriced.unavailable) {
      continue;
    }

    let unit = Number(product.base_price);
    if (item.variant_id) {
      const v = product.variants.find((x) => x.id === item.variant_id);
      if (v) unit += Number(v.price_delta);
    }

    for (const oid of item.option_ids ?? []) {
      const v = allValues.find((x) => x.id === oid);
      if (v) unit += Number(v.price_adjustment);
    }

    const line_total = unit * item.qty;
    subtotal += line_total;
    priced.push({ ...item, product_name: product.name, unit_price: unit, line_total, unavailable: false });
  }

  // Rumus pajak benar: taxable = max(0, subtotal - discount - pointsDiscount)
  const discount = opts?.discount ?? 0;
  const pointsDiscount = opts?.pointsDiscount ?? 0;
  const taxable = Math.max(0, subtotal - discount - pointsDiscount);
  const tax = Math.round(taxable * env.TAX_RATE);
  const shipping = opts?.shipping ?? 0;
  const total = Math.max(0, taxable + tax + shipping);

  return {
    items: priced,
    subtotal,
    tax,
    shipping_fee: shipping,
    discount,
    points_discount: pointsDiscount,
    total,
  };
}

export function cartKeyFor(userId?: string, guestId?: string): string {
  if (userId) return memberKey(userId);
  if (guestId) return guestKey(guestId);
  throw BadRequest('Butuh autentikasi atau header X-Guest-Id');
}

/** Merge guest→member, idempotent by fingerprint (ADR-011). */
export async function mergeGuestCart(userId: string, guestId: string): Promise<boolean> {
  if (!guestId) return false;
  const gKey = guestKey(guestId);
  const guestItems = await readCart(gKey);
  if (!guestItems.length) return false;

  const mKey = memberKey(userId);
  const memberItems = await readCart(mKey);
  const fp = (i: any) =>
    `${i.product_id}|${i.variant_id ?? ''}|${(i.option_ids ?? []).slice().sort().join(',')}`;
  const map = new Map(memberItems.map((i) => [fp(i), { ...i }]));

  for (const gi of guestItems) {
    const key = fp(gi);
    const existing = map.get(key);
    if (existing) existing.qty += gi.qty;
    else map.set(key, { ...gi, id: gi.id ?? randomUUID() });
  }

  await writeCart(mKey, [...map.values()]);
  await redisCache.del(gKey);
  return true;
}

export { memberKey, guestKey };
