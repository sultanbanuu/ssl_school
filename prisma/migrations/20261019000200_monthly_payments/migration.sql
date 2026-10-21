CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'rejected');
ALTER TABLE payments ALTER COLUMN status DROP DEFAULT;
ALTER TABLE payments ALTER COLUMN status TYPE "PaymentStatus"
  USING CASE WHEN status THEN 'approved'::"PaymentStatus" ELSE 'pending'::"PaymentStatus" END;
ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE payments ALTER COLUMN reciept_url DROP NOT NULL;
CREATE TABLE payment_uploads (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 5242880),
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  course_name TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ(6) NOT NULL
);
ALTER TABLE payment_uploads ENABLE ROW LEVEL SECURITY;
CREATE INDEX payment_uploads_student_id_created_at_idx ON payment_uploads(student_id, created_at);
ALTER TABLE payments
  ADD COLUMN receipt_key TEXT UNIQUE,
  ADD COLUMN upload_id UUID UNIQUE REFERENCES payment_uploads(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN course_name TEXT,
  ADD COLUMN submitted_at TIMESTAMPTZ(6),
  ADD COLUMN start_date DATE,
  ADD COLUMN end_date DATE,
  ADD COLUMN reviewed_at TIMESTAMPTZ(6),
  ADD COLUMN reviewed_by UUID REFERENCES profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN rejection_reason TEXT;
-- Legacy records have no trustworthy submission/review dates: do not invent them.
ALTER TABLE payments ADD CONSTRAINT payments_new_record_complete CHECK (
  receipt_key IS NULL OR (upload_id IS NOT NULL AND submitted_at IS NOT NULL AND course_name IS NOT NULL)
);
ALTER TABLE payments ADD CONSTRAINT payments_review_valid CHECK (
  receipt_key IS NULL OR
  (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL AND start_date IS NULL AND end_date IS NULL AND rejection_reason IS NULL) OR
  (status = 'approved' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date > start_date AND rejection_reason IS NULL) OR
  (status = 'rejected' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND start_date IS NULL AND end_date IS NULL AND rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0)
);
CREATE UNIQUE INDEX payments_one_pending_per_course ON payments(student_id, course_id)
  WHERE status = 'pending' AND receipt_key IS NOT NULL;
CREATE INDEX payments_student_id_submitted_at_idx ON payments(student_id, submitted_at);
CREATE INDEX payments_status_submitted_at_idx ON payments(status, submitted_at);
