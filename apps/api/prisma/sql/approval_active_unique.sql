-- Run once after `prisma migrate dev` (npm run db:constraints). Idempotent.
-- Guarantees at most ONE active (APPROVED) approval per purchase request, even under races.
CREATE UNIQUE INDEX IF NOT EXISTS "Approval_one_active_per_request"
  ON "Approval" ("requestId")
  WHERE "status" = 'APPROVED';
