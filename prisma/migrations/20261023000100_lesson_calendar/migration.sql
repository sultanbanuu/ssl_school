ALTER TABLE lessons
  ADD COLUMN end_date date,
  ADD COLUMN all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN series_id uuid,
  ADD COLUMN repeat_rule jsonb,
  ADD COLUMN reminder_minutes integer,
  ADD COLUMN reminder_at timestamptz,
  ADD COLUMN reminder_sent_at timestamptz;
UPDATE lessons SET end_date = date;
ALTER TABLE lessons DROP CONSTRAINT lessons_time_order;
ALTER TABLE lessons ADD CONSTRAINT lessons_time_order CHECK (
  COALESCE(end_date, date) > date OR
  (COALESCE(end_date, date) = date AND (end_time IS NULL OR end_time > start_time))
);
ALTER TABLE lessons ADD CONSTRAINT lessons_reminder_minutes CHECK (reminder_minutes IS NULL OR reminder_minutes BETWEEN 0 AND 10080);
CREATE INDEX lessons_series_id_date_idx ON lessons(series_id, date);
CREATE INDEX lessons_reminder_at_reminder_sent_at_idx ON lessons(reminder_at, reminder_sent_at);
