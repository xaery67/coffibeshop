-- ═══════════════════════════════════════════════════════════════════
--  Catalog lengkap (issue #4) + pg_trgm full-text search
--  Sumber: docs/database-design.md §2.4–2.9 · PRD-BACKEND §2.2/§8
--  Migrasi ini aman untuk data yang sudah ada (kolom baru nullable/default).
-- ═══════════════════════════════════════════════════════════════════

-- 1) Ekstensi pencarian trigram (idempotent — aman bila sudah ada)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) OUTLETS: code, email, koordinat, jam operasional, updated_at
ALTER TABLE "outlets"
  ADD COLUMN IF NOT EXISTS "code"          TEXT,
  ADD COLUMN IF NOT EXISTS "email"         TEXT,
  ADD COLUMN IF NOT EXISTS "latitude"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longitude"     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "opening_hours" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- isi code untuk baris lama sebelum diberi unique + NOT NULL
UPDATE "outlets" SET "code" = CONCAT('OUTLET-', SUBSTRING("id"::text, 1, 8)) WHERE "code" IS NULL;
ALTER TABLE "outlets" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "outlets_code_key" ON "outlets"("code");
CREATE INDEX IF NOT EXISTS "outlets_is_active_idx" ON "outlets"("is_active");

-- 3) CATEGORIES: outlet_id, description, is_active
ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "outlet_id"   UUID,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "is_active"   BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TABLE "categories" ADD CONSTRAINT "categories_outlet_id_fkey"
    FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "categories_outlet_id_idx" ON "categories"("outlet_id");
CREATE INDEX IF NOT EXISTS "categories_is_active_idx" ON "categories"("is_active");

-- 4) PRODUCTS: is_available (+ index outlet_id)
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "is_available" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "products_outlet_id_idx" ON "products"("outlet_id");
CREATE INDEX IF NOT EXISTS "products_is_available_idx" ON "products"("is_available");

-- 5) PRODUCT_VARIANTS: sku, stock_quantity, sort_order
ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "sku"            TEXT,
  ADD COLUMN IF NOT EXISTS "stock_quantity" INTEGER,
  ADD COLUMN IF NOT EXISTS "sort_order"     INTEGER NOT NULL DEFAULT 0;

-- 6) PRODUCT_OPTIONS: option_type, min/max_select, is_required, sort_order
--    (price_delta dipindah ke option_values.price_adjustment)
ALTER TABLE "product_options"
  ADD COLUMN IF NOT EXISTS "option_type" TEXT NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS "min_select"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_select"  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "is_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sort_order"  INTEGER NOT NULL DEFAULT 0;

-- 7) OPTION_VALUES (baru)
CREATE TABLE IF NOT EXISTS "option_values" (
  "id"               UUID NOT NULL,
  "option_id"        UUID NOT NULL,
  "value"            TEXT NOT NULL,
  "price_adjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "stock_code"       TEXT,
  "sort_order"       INTEGER NOT NULL DEFAULT 0,
  "is_active"        BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "option_values_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "option_values_option_id_idx" ON "option_values"("option_id");

DO $$ BEGIN
  ALTER TABLE "option_values" ADD CONSTRAINT "option_values_option_id_fkey"
    FOREIGN KEY ("option_id") REFERENCES "product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7b) Migrasi data: price_delta lama (per-opsi) → satu OptionValue default
--     Hanya untuk opsi yang belum punya nilai sama sekali.
INSERT INTO "option_values" ("id", "option_id", "value", "price_adjustment", "sort_order", "is_active")
SELECT gen_random_uuid(), po."id", po."name", po."price_delta", 1, true
FROM "product_options" po
WHERE NOT EXISTS (SELECT 1 FROM "option_values" ov WHERE ov."option_id" = po."id");

-- 7c) Buang kolom lama (harga kini per-nilai opsi)
ALTER TABLE "product_options" DROP COLUMN IF EXISTS "price_delta";

-- 8) Index trigram GIN untuk pencarian cepat & toleran typo (TC-F001-03/06)
CREATE INDEX IF NOT EXISTS "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "products_description_trgm_idx" ON "products" USING GIN ("description" gin_trgm_ops);
