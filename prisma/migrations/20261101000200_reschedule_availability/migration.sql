ALTER TABLE availability_slots ADD COLUMN purpose text NOT NULL DEFAULT 'trial' CHECK (purpose IN ('trial', 'reschedule'));
