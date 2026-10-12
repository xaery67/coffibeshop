-- Add raw_payload column to payments table
ALTER TABLE "payments" ADD COLUMN "raw_payload" JSONB;