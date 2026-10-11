-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "points_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "voucher_code" TEXT;
