-- Add slug column to products table (nullable first)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Backfill slug from name for existing products with dedup in single statement
WITH base AS (
  SELECT id,
         NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), '') AS s
  FROM "products" WHERE "slug" IS NULL
), ranked AS (
  SELECT id, s, ROW_NUMBER() OVER (PARTITION BY s ORDER BY id) AS rn FROM base
)
UPDATE "products" p
SET "slug" = CASE
  WHEN r.s IS NULL THEN 'item-' || substr(md5(p.id::text), 1, 8)
  WHEN r.rn = 1 THEN r.s
  ELSE r.s || '-' || (r.rn - 1)
END
FROM ranked r WHERE p.id = r.id;

-- Make slug unique and add index
CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_key" ON "products"("slug");