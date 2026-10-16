-- Add Reward model for loyalty reward catalog (PR #87 / issue #76)
-- Prisma conventions: UUID no default, TEXT for name/description, TIMESTAMP(3) for timestamps
CREATE TABLE "rewards" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL UNIQUE,
    "description" TEXT,
    "points_cost" INTEGER NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "min_purchase" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "stock" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- Index for active rewards (matches @@index([is_active]) in schema)
CREATE INDEX "rewards_is_active_idx" ON "rewards"("is_active");