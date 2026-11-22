-- Courses priced per lesson; enrollments in them record how many lessons were bought.
ALTER TABLE "courses" ADD COLUMN "per_lesson" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "enrollments" ADD COLUMN "lesson_count" INTEGER;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_lesson_count_positive" CHECK ("lesson_count" IS NULL OR "lesson_count" > 0);

-- English in Context: 16 AZN per lesson.
UPDATE "courses" SET "price" = 16, "per_lesson" = true WHERE lower("name") = 'english in context';
