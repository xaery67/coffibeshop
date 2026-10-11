-- DropIndex
DROP INDEX "products_description_trgm_idx";

-- DropIndex
DROP INDEX "products_name_trgm_idx";

-- AlterTable
ALTER TABLE "outlets" ALTER COLUMN "updated_at" DROP DEFAULT;
