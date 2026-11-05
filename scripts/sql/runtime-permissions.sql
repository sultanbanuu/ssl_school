-- Reapply after migrations as the table owner. New tables are denied until
-- explicitly reviewed and added here. No blanket/default grants to future tables.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO school_runtime;
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'auth_users', 'auth_sessions', 'auth_accounts', 'auth_verifications',
    'profiles', 'students', 'teachers', 'manager', 'admin', 'courses',
    'enrollments', 'lessons', 'progress_records', 'payments', 'payment_uploads',
    'notifications', 'push_devices', 'push_deliveries', 'availability_slots',
    'reschedule_requests', 'trial_requests', 'lesson_evaluations', 'receipt_cleanup'
  ] LOOP
    -- This backend is trusted to enforce application-user authorization.
    -- The role policy permits backend CRUD, not public/direct client access.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM school_runtime', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO school_runtime', table_name);
    EXECUTE format('DROP POLICY IF EXISTS school_backend_access ON public.%I', table_name);
    EXECUTE format('CREATE POLICY school_backend_access ON public.%I TO school_runtime USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END $$;
-- UUID IDs use functions, not sequences. Never grant access to Prisma's ledger.

REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, school_runtime, school_app;
GRANT SELECT ON TABLE public.audit_logs TO school_runtime;
DROP POLICY IF EXISTS school_backend_audit_read ON public.audit_logs;
CREATE POLICY school_backend_audit_read ON public.audit_logs FOR SELECT TO school_runtime USING (true);
