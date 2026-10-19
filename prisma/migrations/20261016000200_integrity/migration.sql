-- Database invariants not represented in the Prisma schema.
ALTER TABLE courses ADD CONSTRAINT courses_price_nonnegative CHECK (price >= 0);
ALTER TABLE courses ADD CONSTRAINT courses_duration_positive CHECK (duration IS NULL OR duration > 0);
ALTER TABLE payments ADD CONSTRAINT payments_amount_nonnegative CHECK (amount >= 0);
ALTER TABLE students ADD CONSTRAINT students_dates_valid CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
ALTER TABLE lessons ADD CONSTRAINT lessons_time_order CHECK (end_time IS NULL OR end_time > start_time);

-- API-only access model: application requests use the trusted backend connection.
-- No public/anonymous Data API policies. The backend must enforce user access.
-- A dedicated non-owner runtime role will need explicit policies/grants before use.
ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
