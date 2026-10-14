-- Add slug column to products table (nullable first)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "slug" VARCHAR(255);

-- Backfill slug from name for existing products
UPDATE "products" SET "slug" = LOWER(
    REGEXP_REPLACE(
        REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'),
        '^-+|-+$', '', 'g'
    )
) WHERE "slug" IS NULL;

-- Handle duplicates by adding suffix
WITH ranked AS (
    SELECT id, slug,
           ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) as rn
    FROM products
    WHERE slug IS NOT NULL
)
UPDATE products p
SET slug = CASE WHEN r.rn > 1 THEN p.slug || '-' || (r.rn - 1) ELSE p.slug END
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

-- Make slug unique and add index
CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_key" ON "products"("slug");