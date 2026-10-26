CREATE TABLE "availability_slots" (
  "id" UUID PRIMARY KEY,
  "teacher_id" UUID NOT NULL REFERENCES "teachers"("id") ON DELETE RESTRICT,
  "course_id" UUID NOT NULL REFERENCES "courses"("id") ON DELETE RESTRICT,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "availability_positive_duration" CHECK ("ends_at" > "starts_at")
);
CREATE INDEX "availability_slots_teacher_id_starts_at_idx" ON "availability_slots"("teacher_id", "starts_at");
CREATE INDEX "availability_slots_course_id_idx" ON "availability_slots"("course_id");
CREATE INDEX "availability_slots_starts_at_idx" ON "availability_slots"("starts_at");
CREATE TABLE "trial_requests" (
  "id" UUID PRIMARY KEY,
  "slot_id" UUID NOT NULL REFERENCES "availability_slots"("id") ON DELETE RESTRICT,
  "student_id" UUID NOT NULL REFERENCES "students"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'declined', 'cancelled')),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  UNIQUE ("slot_id", "student_id")
);
CREATE INDEX "trial_requests_student_id_status_idx" ON "trial_requests"("student_id", "status");
CREATE INDEX "trial_requests_slot_id_status_idx" ON "trial_requests"("slot_id", "status");
CREATE UNIQUE INDEX "trial_requests_reserved_slot" ON "trial_requests"("slot_id") WHERE "status" IN ('pending', 'approved');
ALTER TABLE "availability_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trial_requests" ENABLE ROW LEVEL SECURITY;
