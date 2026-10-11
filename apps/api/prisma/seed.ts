import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Seed data awal: kategori, produk contoh, dan 1 owner. */
async function main() {
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

  const coffee = await prisma.category.upsert({
    where: { slug: 'coffee' },
    update: {},
    create: { name: 'Coffee', slug: 'coffee', sort_order: 1 },
  });
  const nonCoffee = await prisma.category.upsert({
    where: { slug: 'non-coffee' },
    update: {},
    create: { name: 'Non-Coffee', slug: 'non-coffee', sort_order: 2 },
  });

  const products = [
    { name: 'Espresso', slug: 'espresso', base_price: 18000, category_id: coffee.id },
    { name: 'Cappuccino', slug: 'cappuccino', base_price: 25000, category_id: coffee.id },
    { name: 'Latte', slug: 'latte', base_price: 27000, category_id: coffee.id },
    { name: 'Matcha Latte', slug: 'matcha-latte', base_price: 30000, category_id: nonCoffee.id },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        name: p.name,
        slug: p.slug,
        base_price: p.base_price,
        category_id: p.category_id,
        description: `${p.name} signature kami.`,
        variants: {
          create: [
            { name: 'Regular', price_delta: 0 },
            { name: 'Large', price_delta: 5000 },
          ],
        },
        options: {
          create: [
            { name: 'Extra Shot', price_delta: 5000 },
            { name: 'Oat Milk', price_delta: 7000 },
          ],
        },
      },
    });
  }

  await prisma.voucher.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: { code: 'WELCOME10', discount_amount: 10000, min_purchase: 50000 },
  });

  console.log('✅ Seed selesai. Owner:', owner.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
