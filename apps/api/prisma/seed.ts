import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `tsx` tidak memuat .env otomatis (cwd = apps/api). Muat .env ROOT agar
// `npm run db:seed` andal di lokal; di Docker env sudah disuntik via compose,
// file tidak ada → diabaikan (dotenv tidak menimpa env yang sudah ada).
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const prisma = new PrismaClient();

/** Seed data awal: outlet, kategori, produk + varian/opsi, voucher, dan 1 owner. */
async function main() {
  // ── Outlet ──
  const outlet = await prisma.outlet.upsert({
    where: { code: 'JKT-PUSAT' },
    update: {},
    create: {
      name: 'CoffeeShop Pusat — Jakarta',
      code: 'JKT-PUSAT',
      address: 'Jl. Sudirman No. 1, Jakarta Pusat',
      phone: '02112345678',
      email: 'pusat@coffibeshop.id',
      latitude: -6.2088,
      longitude: 106.8456,
      opening_hours: {
        mon: '08:00-22:00', tue: '08:00-22:00', wed: '08:00-22:00',
        thu: '08:00-22:00', fri: '08:00-23:00', sat: '09:00-23:00', sun: '09:00-21:00',
      },
    },
  });

  // ── Owner ──
  const owner = await prisma.user.upsert({
    where: { email: 'owner@coffibeshop.id' },
    update: {},
    create: {
      email: 'owner@coffibeshop.id',
      full_name: 'Owner Demo',
      password_hash: await bcrypt.hash('ChangeMe123!', 12),
      role: 'owner',
    },
  });

  // ── Kategori ──
  const coffee = await prisma.category.upsert({
    where: { slug: 'coffee' },
    update: {},
    create: { name: 'Coffee', slug: 'coffee', sort_order: 1, outlet_id: outlet.id },
  });
  const nonCoffee = await prisma.category.upsert({
    where: { slug: 'non-coffee' },
    update: {},
    create: { name: 'Non-Coffee', slug: 'non-coffee', sort_order: 2, outlet_id: outlet.id },
  });
  const snack = await prisma.category.upsert({
    where: { slug: 'snack' },
    update: {},
    create: { name: 'Snack', slug: 'snack', sort_order: 3, outlet_id: outlet.id },
  });

  // ── Produk (varian ukuran + opsi extra shot / sugar level) ──
  const products = [
    { name: 'Espresso', slug: 'espresso', base_price: 18000, category_id: coffee.id },
    { name: 'Cappuccino', slug: 'cappuccino', base_price: 25000, category_id: coffee.id },
    { name: 'Latte', slug: 'latte', base_price: 27000, category_id: coffee.id },
    { name: 'Matcha Latte', slug: 'matcha-latte', base_price: 30000, category_id: nonCoffee.id },
    { name: 'Croissant', slug: 'croissant', base_price: 22000, category_id: snack.id },
  ];

  for (const p of products) {
    const created = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        name: p.name,
        slug: p.slug,
        base_price: p.base_price,
        category_id: p.category_id,
        outlet_id: outlet.id,
        description: `${p.name} signature kami.`,
        is_available: true,
        variants: {
          create: [
            { name: 'Regular', sku: `${p.slug.toUpperCase()}-REG`, price_delta: 0, stock_quantity: 100, sort_order: 1 },
            { name: 'Large', sku: `${p.slug.toUpperCase()}-LRG`, price_delta: 5000, stock_quantity: 50, sort_order: 2 },
          ],
        },
      },
    });

    const existingOpts = await prisma.productOption.count({ where: { product_id: created.id } });
    if (existingOpts === 0) {
      await prisma.productOption.create({
        data: {
          product_id: created.id,
          name: 'Extra Shot',
          option_type: 'single',
          min_select: 0,
          max_select: 1,
          is_required: false,
          sort_order: 1,
          values: {
            create: [
              { value: 'Tanpa Extra Shot', price_adjustment: 0, sort_order: 1 },
              { value: 'Extra Shot', price_adjustment: 5000, sort_order: 2 },
            ],
          },
        },
      });
      await prisma.productOption.create({
        data: {
          product_id: created.id,
          name: 'Sugar Level',
          option_type: 'single',
          min_select: 1,
          max_select: 1,
          is_required: true,
          sort_order: 2,
          values: {
            create: [
              { value: 'Normal Sugar', price_adjustment: 0, sort_order: 1 },
              { value: 'Less Sugar', price_adjustment: 0, sort_order: 2 },
              { value: 'No Sugar', price_adjustment: 0, sort_order: 3 },
            ],
          },
        },
      });
    }
  }

  await prisma.voucher.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: { code: 'WELCOME10', discount_amount: 10000, min_purchase: 50000 },
  });

  console.log('✅ Seed selesai. Owner:', owner.email, '| Outlet:', outlet.code);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
