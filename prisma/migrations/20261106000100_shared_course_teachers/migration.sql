CREATE TABLE course_teachers (
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  weekly_sessions integer CHECK (weekly_sessions > 0),
  PRIMARY KEY (course_id, teacher_id)
);
CREATE INDEX course_teachers_teacher_id_idx ON course_teachers(teacher_id);
INSERT INTO course_teachers(course_id, teacher_id) SELECT id, teacher_id FROM courses;
ALTER TABLE course_teachers ENABLE ROW LEVEL SECURITY;
