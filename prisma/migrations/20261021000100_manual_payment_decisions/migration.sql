-- Preserve existing decisions and audit metadata while naming the negative action Cancel.
ALTER TYPE "PaymentStatus" RENAME VALUE 'rejected' TO 'cancelled';
ALTER TABLE payments RENAME COLUMN rejection_reason TO cancellation_reason;
ALTER TABLE payments DROP CONSTRAINT payments_review_valid;
ALTER TABLE payments ADD CONSTRAINT payments_review_valid CHECK (
  receipt_key IS NULL OR
  (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL AND start_date IS NULL AND end_date IS NULL AND cancellation_reason IS NULL) OR
  (status = 'approved' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date > start_date AND cancellation_reason IS NULL) OR
  (status = 'cancelled' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND start_date IS NULL AND end_date IS NULL AND
    (cancellation_reason IS NULL OR length(trim(cancellation_reason)) > 0))
);
