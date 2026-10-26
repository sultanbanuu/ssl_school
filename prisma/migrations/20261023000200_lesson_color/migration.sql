ALTER TABLE "lessons" ADD COLUMN "color" TEXT;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_color_check" CHECK ("color" IS NULL OR "color" ~ '^#[0-9a-fA-F]{6}$');
