CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  database_user text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  "before" jsonb,
  "after" jsonb,
  transaction_id text NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_logs_created_at_id_idx ON public.audit_logs(created_at, id);
CREATE INDEX audit_logs_entity_type_entity_id_created_at_idx ON public.audit_logs(entity_type, entity_id, created_at);
CREATE INDEX audit_logs_actor_id_created_at_idx ON public.audit_logs(actor_id, created_at);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- No foreign keys: history survives deletion of an actor or target record.
-- Only this owner-controlled trigger writes audit rows. Backend receives SELECT
-- in the separate permission setup, never INSERT/UPDATE/DELETE/TRUNCATE.
CREATE FUNCTION public.record_school_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  old_data jsonb;
  new_data jsonb;
  actor jsonb;
  columns text[] := string_to_array(TG_ARGV[1], ',');
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT jsonb_object_agg(key, value) INTO old_data FROM jsonb_each(to_jsonb(OLD)) WHERE key = ANY(columns);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT jsonb_object_agg(key, value) INTO new_data FROM jsonb_each(to_jsonb(NEW)) WHERE key = ANY(columns);
  END IF;
  -- Ignore no-op updates and housekeeping fields excluded from the snapshot.
  IF TG_OP = 'UPDATE' AND old_data IS NOT DISTINCT FROM new_data THEN RETURN NULL; END IF;
  actor := nullif(current_setting('school.audit_actor', true), '')::jsonb;
  INSERT INTO public.audit_logs(actor_id, actor_role, database_user, entity_type, entity_id, action, "before", "after", transaction_id)
    VALUES ((actor->>'id')::uuid, actor->>'role', session_user, TG_ARGV[0],
      coalesce(new_data->>'id', old_data->>'id')::uuid,
      CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END,
      old_data, new_data, txid_current()::text);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.record_school_audit() FROM PUBLIC;

CREATE TRIGGER audit_payment AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.record_school_audit('payment', 'id,student_id,course_id,amount,status,start_date,end_date,submitted_at,reviewed_at,reviewed_by,cancellation_reason');
CREATE TRIGGER audit_role AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.record_school_audit('role', 'id,role');
CREATE TRIGGER audit_lesson AFTER INSERT OR UPDATE OR DELETE ON public.lessons
FOR EACH ROW EXECUTE FUNCTION public.record_school_audit('lesson', 'id,enrollment_id,teacher_id,date,end_date,start_time,end_time,all_day,status,series_id,repeat_rule,color,reminder_minutes,rescheduled_at,cancelled_by_student');
CREATE TRIGGER audit_availability AFTER INSERT OR UPDATE OR DELETE ON public.availability_slots
FOR EACH ROW EXECUTE FUNCTION public.record_school_audit('availability', 'id,teacher_id,course_id,starts_at,ends_at,active,purpose');
CREATE TRIGGER audit_trial AFTER INSERT OR UPDATE OR DELETE ON public.trial_requests
FOR EACH ROW EXECUTE FUNCTION public.record_school_audit('trial', 'id,slot_id,student_id,status');
CREATE TRIGGER audit_reschedule AFTER INSERT OR UPDATE OR DELETE ON public.reschedule_requests
FOR EACH ROW EXECUTE FUNCTION public.record_school_audit('reschedule', 'id,lesson_id,slot_id,student_id,teacher_id,status,original_start,original_end,starts_at,ends_at,reviewed_by,reviewed_at,review_note,quota_waived,waived_by,waived_at,waiver_reason');
