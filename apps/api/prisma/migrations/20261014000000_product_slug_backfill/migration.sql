-- Add slug column to products table (nullable first)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Backfill slug from name for existing products with full uniqueness check across table
DO $$
DECLARE
  r RECORD;
  base TEXT;
  cand TEXT;
  n INT;
BEGIN
  FOR r IN SELECT id, name FROM "products" WHERE "slug" IS NULL ORDER BY created_at, id LOOP
    base := NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(r.name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), '');
    IF base IS NULL THEN base := 'item-' || substr(md5(r.id::text), 1, 8); END IF;
    cand := base; n := 1;
    WHILE EXISTS (SELECT 1 FROM "products" WHERE "slug" = cand AND id <> r.id) LOOP
      cand := base || '-' || n; n := n + 1;
    END LOOP;
    UPDATE "products" SET "slug" = cand WHERE id = r.id;
  END LOOP;
END $$;

-- Make slug unique and add index
CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_key" ON "products"("slug");