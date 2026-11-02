-- Calendar-derived requests record the requested range directly, without
-- manufacturing teacher-published availability records.
ALTER TABLE reschedule_requests ALTER COLUMN slot_id DROP NOT NULL;
