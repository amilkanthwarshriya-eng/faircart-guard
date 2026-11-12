-- Give this to Member 3 to include in the Payment migration (Prisma cannot declare partial indexes).
-- At most one active or completed payment per approval:
CREATE UNIQUE INDEX one_active_payment
  ON "Payment" ("approvalId")
  WHERE status IN ('ORDER_CREATED','APPROVAL_PENDING','CAPTURING','COMPLETED','PENDING_REVIEW');
