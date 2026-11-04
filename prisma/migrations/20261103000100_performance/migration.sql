ALTER TABLE students ADD COLUMN performance_level TEXT;
ALTER TABLE teachers ADD COLUMN performance_weights JSONB;
ALTER TABLE students ADD CONSTRAINT performance_level_valid CHECK (performance_level IS NULL OR performance_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));
CREATE TABLE lesson_evaluations (
 id UUID PRIMARY KEY,
 student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
 teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
 lesson_id UUID NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE RESTRICT,
 topic TEXT NOT NULL,
 assessment JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX lesson_evaluations_student_id_idx ON lesson_evaluations(student_id);
CREATE INDEX lesson_evaluations_teacher_id_idx ON lesson_evaluations(teacher_id);
ALTER TABLE lesson_evaluations ENABLE ROW LEVEL SECURITY;
