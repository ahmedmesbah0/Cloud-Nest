-- Add unique constraint on (voucherId, userId) to prevent double-redeem
-- First remove any duplicates keeping the earliest redemption
DELETE FROM "VoucherRedemption" a
USING (
  SELECT MIN(id) as keep_id, "voucherId", "userId"
  FROM "VoucherRedemption"
  GROUP BY "voucherId", "userId"
  HAVING COUNT(*) > 1
) b
WHERE a."voucherId" = b."voucherId"
  AND a."userId" = b."userId"
  AND a.id != b.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS "VoucherRedemption_voucherId_userId_key"
  ON "VoucherRedemption" ("voucherId", "userId");
