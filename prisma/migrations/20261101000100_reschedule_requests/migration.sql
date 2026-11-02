ALTER TABLE lessons ADD COLUMN rescheduled_at timestamptz, ADD COLUMN cancelled_by_student boolean NOT NULL DEFAULT false;
CREATE TABLE reschedule_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
  slot_id uuid NOT NULL REFERENCES availability_slots(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  original_start timestamptz NOT NULL, original_end timestamptz NOT NULL,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
  reviewed_by uuid REFERENCES profiles(id), review_note text,
  quota_waived boolean NOT NULL DEFAULT false, waived_by uuid REFERENCES profiles(id), waived_at timestamptz, waiver_reason text,
  CHECK (ends_at > starts_at), CHECK (original_end > original_start)
);
CREATE INDEX reschedule_requests_student_id_created_at_idx ON reschedule_requests(student_id, created_at);
CREATE INDEX reschedule_requests_teacher_id_status_idx ON reschedule_requests(teacher_id, status);
CREATE INDEX reschedule_requests_lesson_id_status_idx ON reschedule_requests(lesson_id, status);
CREATE UNIQUE INDEX reschedule_requests_pending_lesson ON reschedule_requests(lesson_id) WHERE status = 'pending';
ALTER TABLE reschedule_requests ENABLE ROW LEVEL SECURITY;
