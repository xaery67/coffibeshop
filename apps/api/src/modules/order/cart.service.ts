import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { redisCache } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { BadRequest } from '../../lib/http.js';

const CART_TTL = 7 * 24 * 60 * 60; // 7 hari (ADR-006)

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

/** Hitung harga (pricing engine sederhana — server-side, PRD-BACKEND §4.4). */
export async function priceCart(items: any[], opts?: { shipping?: number; discount?: number }) {
  let subtotal = 0;
  const priced = [];
  for (const item of items) {
    const product = await prisma.product.findUnique({
      where: { id: item.product_id },
      include: { variants: true, options: { include: { values: true } } },
    });
    if (!product || !product.is_active || !product.is_available) {
      priced.push({ ...item, unavailable: true, unit_price: 0, line_total: 0 });
      continue;
    }
    let unit = Number(product.base_price);
    if (item.variant_id) {
      const v = product.variants.find((x) => x.id === item.variant_id);
      if (v) unit += Number(v.price_delta);
    }
    // option_ids merujuk ke OptionValue.id (harga ada di value, bukan option).
    const allValues = product.options.flatMap((o) => o.values);
    for (const oid of item.option_ids ?? []) {
      const v = allValues.find((x) => x.id === oid);
      if (v) unit += Number(v.price_adjustment);
    }
    const line_total = unit * item.qty;
    subtotal += line_total;
    priced.push({ ...item, product_name: product.name, unit_price: unit, line_total, unavailable: false });
  }
  const tax = Math.round(subtotal * env.TAX_RATE);
  const shipping = opts?.shipping ?? 0;
  const discount = opts?.discount ?? 0;
  return {
    items: priced,
    subtotal,
    tax,
    shipping_fee: shipping,
    discount,
    total: subtotal + tax + shipping - discount,
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
