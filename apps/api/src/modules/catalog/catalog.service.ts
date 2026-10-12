import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { BadRequest, NotFound } from '../../lib/http.js';
import { CacheKeys, TTL, cacheDel, cacheGet, cacheSet, invalidateCatalogCache } from '../../lib/cache.js';
import { logger } from '../../config/logger.js';

/**
 * Catalog Service — PRD-BACKEND §2.2 & §8 (F-001).
 *
 *  - Baca: cache-aside Redis (`menu:{outlet_id}` TTL 5m) → p95 < 1s utk 500 produk.
 *  - Pencarian: `pg_trgm` (index GIN, similarity) agar toleran typo & cepat;
 *    fallback ILIKE bila ekstensi belum tersedia.
 *  - Tulis (admin): invalidasi cache katalog agar perubahan langsung terlihat
 *    (AC issue #4 — "Cache Redis + invalidasi saat update").
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Buat slug URL-friendly dari nama (fallback aman untuk nama non-latin). */
export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || `item-${Date.now().toString(36)}`;
}
/** Cek UUID sebelum dikirim ke Prisma — hindari 500 dari error UUID driver. */
export function isValidUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Bersihkan input pencarian (query tetap parameterized — anti-injeksi). */
export function sanitizeQuery(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = Array.from(raw)
    // buang karakter kontrol (0x00–0x1F, 0x7F) tanpa literal regex kontrol
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join('')
    .replace(/[%_\\]/g, ' ')
    .trim()
    .slice(0, 100);
  return cleaned.length ? cleaned : undefined;
}

export class CatalogService {
  // ───────────────────────── OUTLET ─────────────────────────

  /** GET /catalog/outlets — daftar outlet aktif (+ jarak bila lat/lng diberi). */
  async outlets(query: { lat?: number; lng?: number; radius?: number } = {}) {
    const cached = await cacheGet<any[]>(CacheKeys.outlets());
    let outlets: any[] = cached ?? [];
    if (!cached) {
      outlets = await prisma.outlet.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } });
      await cacheSet(CacheKeys.outlets(), outlets, TTL.OUTLETS);
    }

    if (query.lat !== undefined && query.lng !== undefined) {
      const withDist = outlets.map((o) => ({
        ...o,
        distance_km:
          o.latitude != null && o.longitude != null
            ? haversineKm(query.lat!, query.lng!, o.latitude, o.longitude)
            : null,
      }));
      const radius = query.radius ?? 10;
      return withDist
        .filter((o) => o.distance_km == null || o.distance_km <= radius)
        .sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
    }
    return outlets;
  }

  /** GET /catalog/outlets/:id — detail + jam operasional. */
  async outlet(id: string) {
    if (!isValidUuid(id)) throw NotFound('Outlet tidak ditemukan');
    const found = await prisma.outlet.findUnique({ where: { id } });
    if (!found || !found.is_active) throw NotFound('Outlet tidak ditemukan');
    return found;
  }

  // ─────────────────────── KATEGORI ───────────────────────

  /** GET /catalog/categories?outlet_id= — kategori aktif + jumlah produk. */
  async categories(outletId?: string) {
    const key = CacheKeys.categories(outletId);
    const hit = await cacheGet<any[]>(key);
    if (hit) return hit;

    const where: Prisma.CategoryWhereInput = { is_active: true };
    if (outletId && isValidUuid(outletId)) where.OR = [{ outlet_id: outletId }, { outlet_id: null }];

    const rows = await prisma.category.findMany({
      where,
      orderBy: { sort_order: 'asc' },
      include: { _count: { select: { products: { where: { is_active: true } } } } },
    });
    const data = rows.map(({ _count, ...rest }) => ({ ...rest, product_count: _count.products }));
    await cacheSet(key, data, TTL.CATEGORIES);
    return data;
  }

  // ──────────────────────── PRODUK ────────────────────────

  /** GET /catalog/products?outlet_id=&q=&category_id=&available=&page=&limit= */
  async listProducts(query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 20), 100);
    const q = sanitizeQuery(query.q);
    const outletId: string | undefined = query.outlet_id;
    const categoryId: string | undefined = query.category_id;
    const availableOnly = query.available === true || query.available === 'true';

    const fingerprint = [outletId ?? '-', categoryId ?? '-', q ?? '-', availableOnly ? '1' : '0', page, limit].join('|');
    const cacheKey = CacheKeys.productList(fingerprint);
    const hit = await cacheGet<any>(cacheKey);
    if (hit) return hit;

    const where: Prisma.ProductWhereInput = { is_active: true };
    if (availableOnly) where.is_available = true;
    if (categoryId) where.category_id = categoryId;
    if (outletId) where.OR = [{ outlet_id: outletId }, { outlet_id: null }];

    const include = {
      category: { select: { id: true, name: true, slug: true } },
      variants: { where: { is_active: true }, orderBy: { sort_order: 'asc' } },
      options: {
        where: { is_active: true },
        orderBy: { sort_order: 'asc' },
        include: { values: { where: { is_active: true }, orderBy: { sort_order: 'asc' } } },
      },
    } satisfies Prisma.ProductInclude;

    let rows: any[];
    let total: number;

    if (q) {
      // ── Pencarian: pg_trgm (similarity) → fallback ILIKE ──
      const like = `%${q}%`;
      try {
        const ids = await prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM products
          WHERE is_active = true
            AND (${availableOnly} = false OR is_available = true)
            AND (${categoryId ?? null}::uuid IS NULL OR category_id = ${categoryId ?? null}::uuid)
            AND (${outletId ?? null}::uuid IS NULL OR outlet_id = ${outletId ?? null}::uuid OR outlet_id IS NULL)
            AND (name % ${q} OR name ILIKE ${like} OR description ILIKE ${like})
          ORDER BY GREATEST(similarity(name, ${q}), word_similarity(${q}, name)) DESC, name ASC
          LIMIT ${limit} OFFSET ${(page - 1) * limit}
        `;
        const idsOnly = ids.map((r) => r.id);
        if (idsOnly.length === 0) {
          rows = [];
          total = 0;
        } else {
          const found = await prisma.product.findMany({ where: { id: { in: idsOnly } }, include });
          const order = new Map(idsOnly.map((id, i) => [id, i]));
          rows = found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
          total = await this.countSearch(q, { availableOnly, categoryId, outletId });
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'pencarian pg_trgm gagal — fallback ILIKE');
        where.AND = [
          { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] },
        ];
        [rows, total] = await Promise.all([
          prisma.product.findMany({ where, include, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
          prisma.product.count({ where }),
        ]);
      }
    } else {
      [rows, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include,
          orderBy: [{ category_id: 'asc' }, { name: 'asc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.product.count({ where }),
      ]);
    }

    const result = {
      data: rows.map(serializeProduct),
      meta: { page, limit, total, total_pages: Math.ceil(total / limit) || 1, query: q ?? null },
    };
    await cacheSet(cacheKey, result, TTL.MENU);
    return result;
  }

  /** Hitung total hasil pencarian (query terpisah agar paginasi utama ringan). */
  private async countSearch(
    q: string,
    f: { availableOnly: boolean; categoryId?: string; outletId?: string },
  ): Promise<number> {
    const like = `%${q}%`;
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM products
      WHERE is_active = true
        AND (${f.availableOnly} = false OR is_available = true)
        AND (${f.categoryId ?? null}::uuid IS NULL OR category_id = ${f.categoryId ?? null}::uuid)
        AND (${f.outletId ?? null}::uuid IS NULL OR outlet_id = ${f.outletId ?? null}::uuid OR outlet_id IS NULL)
        AND (name % ${q} OR name ILIKE ${like} OR description ILIKE ${like})
    `;
    return Number(rows[0]?.count ?? 0);
  }

  /** GET /catalog/products/:id — detail + varian + opsi. */
    async product(id: string) {
      if (!isValidUuid(id)) throw NotFound('Produk tidak ditemukan');
      const key = CacheKeys.product(id);
      const hit = await cacheGet<any>(key);
      if (hit) return hit;

      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          variants: { where: { is_active: true }, orderBy: { sort_order: 'asc' } },
          options: {
            where: { is_active: true },
            orderBy: { sort_order: 'asc' },
            include: { values: { where: { is_active: true }, orderBy: { sort_order: 'asc' } } },
          },
        },
      });
      if (!product || !product.is_active) throw NotFound('Produk tidak ditemukan');

      const data = serializeProduct(product);
      await cacheSet(key, data, TTL.PRODUCT);
      return data;
    }

    /** GET produk by ID tanpa cache (untuk validasi internal). */
    async getProductById(id: string) {
      if (!isValidUuid(id)) return null;
      const product = await prisma.product.findUnique({
        where: { id },
        select: { id: true, image_url: true, outlet_id: true },
      });
      return product;
    }

    // ─────────────────── ADMIN (tulis + invalidasi) ───────────────────

  /** POST /catalog/products — buat produk (owner/manager). */
  async createProduct(input: any) {
    if (!input.name || input.base_price == null) throw BadRequest('name & base_price wajib diisi');
    if (!isValidUuid(input.category_id)) throw BadRequest('category_id tidak valid');
    if (input.outlet_id != null && !isValidUuid(input.outlet_id)) throw BadRequest('outlet_id tidak valid');
    const category = await prisma.category.findUnique({ where: { id: input.category_id } });
    if (!category) throw BadRequest('category_id tidak ditemukan');

    // Slug: pakai input bila ada, selain itu generate dari nama; jaga tetap unik.
    let slug = input.slug ? slugify(input.slug) : slugify(input.name);
    if (await prisma.product.findUnique({ where: { slug } })) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    const product = await prisma.product.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        base_price: new Prisma.Decimal(input.base_price),
        image_url: input.image_url ?? null,
        is_available: input.is_available ?? true,
        category_id: input.category_id,
        outlet_id: input.outlet_id ?? null,
      },
      include: { variants: true, options: { include: { values: true } }, category: true },
    });
    await invalidateCatalogCache({ outletId: product.outlet_id, productId: product.id });
    return serializeProduct(product);
  }

  /** PUT /catalog/products/:id — update produk (partial). */
  async updateProduct(id: string, input: any) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw NotFound('Produk tidak ditemukan');

    const data: Prisma.ProductUpdateInput = {};
    for (const f of ['name', 'slug', 'description', 'image_url'] as const) {
      if (input[f] !== undefined) (data as any)[f] = input[f];
    }
    if (input.base_price !== undefined) data.base_price = new Prisma.Decimal(input.base_price);
    if (input.is_available !== undefined) data.is_available = input.is_available;
    if (input.is_active !== undefined) data.is_active = input.is_active;
    if (input.category_id !== undefined) {
      if (!isValidUuid(input.category_id)) throw BadRequest('category_id tidak valid');
      data.category = { connect: { id: input.category_id } };
    }

    const updated = await prisma.product.update({
      where: { id },
      data,
      include: { variants: true, options: { include: { values: true } }, category: true },
    });
    await invalidateCatalogCache({ outletId: updated.outlet_id, productId: id });
    return serializeProduct(updated);
  }

  /** DELETE /catalog/products/:id — soft delete (is_active=false). */
  async deleteProduct(id: string) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw NotFound('Produk tidak ditemukan');
    await prisma.product.update({ where: { id }, data: { is_active: false } });
    await invalidateCatalogCache({ outletId: existing.outlet_id, productId: id });
    return { id, is_active: false };
  }

  /** POST /catalog/categories — buat kategori. */
  async createCategory(input: any) {
    if (!input.name || !input.slug) throw BadRequest('name & slug wajib diisi');
    const cat = await prisma.category.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        sort_order: input.sort_order ?? 0,
        outlet_id: input.outlet_id ?? null,
      },
    });
    await invalidateCatalogCache({ outletId: cat.outlet_id });
    return cat;
  }

  /** PUT /catalog/categories/:id — update kategori (partial). */
  async updateCategory(id: string, input: any) {
    if (!isValidUuid(id)) throw NotFound('Kategori tidak ditemukan');
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw NotFound('Kategori tidak ditemukan');

    const data: Prisma.CategoryUpdateInput = {};
    for (const f of ['name', 'slug', 'description'] as const) {
      if (input[f] !== undefined) (data as any)[f] = input[f];
    }
    if (input.sort_order !== undefined) data.sort_order = input.sort_order;
    if (input.is_active !== undefined) data.is_active = input.is_active;
    if (input.outlet_id !== undefined) {
      if (input.outlet_id != null && !isValidUuid(input.outlet_id)) throw BadRequest('outlet_id tidak valid');
      data.outlet = input.outlet_id ? { connect: { id: input.outlet_id } } : { disconnect: true };
    }

    const updated = await prisma.category.update({ where: { id }, data });
    await invalidateCatalogCache({ outletId: updated.outlet_id });
    return updated;
  }

  /** POST /catalog/products/:id/variants — tambah varian. */
  async createVariant(productId: string, input: any) {
    if (!isValidUuid(productId)) throw NotFound('Produk tidak ditemukan');
    if (!input.name) throw BadRequest('name varian wajib diisi');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw NotFound('Produk tidak ditemukan');
    const v = await prisma.productVariant.create({
      data: {
        product_id: productId,
        name: input.name,
        sku: input.sku ?? null,
        price_delta: new Prisma.Decimal(input.price_delta ?? 0),
        stock_quantity: input.stock_quantity ?? null,
        sort_order: input.sort_order ?? 0,
      },
    });
    await invalidateCatalogCache({ outletId: product.outlet_id, productId });
    return v;
  }

  /** POST /catalog/products/:id/options — tambah opsi (single/multiple). */
  async createOption(productId: string, input: any) {
    if (!isValidUuid(productId)) throw NotFound('Produk tidak ditemukan');
    if (!input.name) throw BadRequest('name opsi wajib diisi');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw NotFound('Produk tidak ditemukan');
    const opt = await prisma.productOption.create({
      data: {
        product_id: productId,
        name: input.name,
        option_type: input.option_type ?? 'single',
        min_select: input.min_select ?? 0,
        max_select: input.max_select ?? 1,
        is_required: input.is_required ?? false,
        sort_order: input.sort_order ?? 0,
      },
      include: { values: true },
    });
    await invalidateCatalogCache({ outletId: product.outlet_id, productId });
    return opt;
  }

  /** POST /catalog/options/:id/values — tambah nilai opsi. */
  async createOptionValue(optionId: string, input: any) {
    if (!isValidUuid(optionId)) throw NotFound('Opsi tidak ditemukan');
    if (!input.value) throw BadRequest('value wajib diisi');
    const option = await prisma.productOption.findUnique({
      where: { id: optionId },
      include: { product: { select: { id: true, outlet_id: true } } },
    });
    if (!option) throw NotFound('Opsi tidak ditemukan');
    const val = await prisma.optionValue.create({
      data: {
        option_id: optionId,
        value: input.value,
        price_adjustment: new Prisma.Decimal(input.price_adjustment ?? 0),
        stock_code: input.stock_code ?? null,
        sort_order: input.sort_order ?? 0,
      },
    });
    await invalidateCatalogCache({ outletId: option.product.outlet_id, productId: option.product.id });
    return val;
  }

  /** POST /catalog/outlets — buat outlet (owner). */
  async createOutlet(input: any) {
    if (!input.name || !input.code) throw BadRequest('name & code wajib diisi');
    const outlet = await prisma.outlet.create({
      data: {
        name: input.name,
        code: input.code,
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        opening_hours: input.opening_hours ?? {},
      },
    });
    await invalidateCatalogCache({ outletId: outlet.id });
    return outlet;
  }

  /** PUT /catalog/outlets/:id — update outlet (partial). */
  async updateOutlet(id: string, input: any) {
    const existing = await prisma.outlet.findUnique({ where: { id } });
    if (!existing) throw NotFound('Outlet tidak ditemukan');
    const data: Prisma.OutletUpdateInput = {};
    for (const f of ['name', 'code', 'address', 'phone', 'email', 'opening_hours'] as const) {
      if (input[f] !== undefined) (data as any)[f] = input[f];
    }
    if (input.latitude !== undefined) data.latitude = input.latitude;
    if (input.longitude !== undefined) data.longitude = input.longitude;
    if (input.is_active !== undefined) data.is_active = input.is_active;
    const updated = await prisma.outlet.update({ where: { id }, data });
    await invalidateCatalogCache({ outletId: id });
    return updated;
  }

  /** Menu lengkap satu outlet (kategori + produk) — cache `menu:{outlet_id}`. */
  async menu(outletId: string) {
    const key = CacheKeys.menu(outletId);
    const hit = await cacheGet<any>(key);
    if (hit) return hit;

    const [categories, products] = await Promise.all([
      this.categories(outletId),
      this.listProducts({ outlet_id: outletId, limit: 100 }),
    ]);
    const data = { outlet_id: outletId, categories, products: products.data, meta: products.meta };
    await cacheSet(key, data, TTL.MENU);
    return data;
  }

  /** Invalidasi manual seluruh cache katalog. */
  async invalidate() {
    await invalidateCatalogCache();
    await cacheDel(CacheKeys.outlets());
    return { invalidated: true };
  }
}

// ─────────────────────────── HELPERS ───────────────────────────

/** Decimal → number & rapikan bentuk JSON. */
function serializeProduct(p: any) {
  return {
    ...p,
    base_price: Number(p.base_price),
    variants: (p.variants ?? []).map((v: any) => ({ ...v, price_delta: Number(v.price_delta) })),
    options: (p.options ?? []).map((o: any) => ({
      ...o,
      values: (o.values ?? []).map((val: any) => ({ ...val, price_adjustment: Number(val.price_adjustment) })),
    })),
  };
}

/** Jarak haversine (km) — untuk filter outlet terdekat. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}
