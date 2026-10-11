import { prisma } from '../../config/prisma.js';
import { redisCache } from '../../config/redis.js';
import { NotFound } from '../../lib/http.js';

const MENU_TTL = 300; // 5 menit (PRD-BACKEND §6)

export class CatalogService {
  async categories() {
    const cached = await redisCache.get('categories:all');
    if (cached) return JSON.parse(cached);
    const data = await prisma.category.findMany({ orderBy: { sort_order: 'asc' } });
    await redisCache.setex('categories:all', MENU_TTL, JSON.stringify(data));
    return data;
  }

  async listProducts(query: any) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const where: any = { is_active: true };
    if (query.category_id) where.category_id = query.category_id;
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { variants: true, options: true, category: true },
      }),
      prisma.product.count({ where }),
    ]);
    return { data, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  async product(id: string) {
    const key = `product:${id}`;
    const cached = await redisCache.get(key);
    if (cached) return JSON.parse(cached);
    const product = await prisma.product.findUnique({
      where: { id },
      include: { variants: true, options: true, category: true },
    });
    if (!product) throw NotFound('Produk tidak ditemukan');
    await redisCache.setex(key, MENU_TTL, JSON.stringify(product));
    return product;
  }
}
