CREATE TABLE receipt_cleanup (
  object_key text PRIMARY KEY,
  upload_id uuid NOT NULL REFERENCES payment_uploads(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('staging', 'final')),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_attempt_at timestamptz(6) NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text
);
CREATE INDEX receipt_cleanup_next_attempt_at_object_key_idx ON receipt_cleanup(next_attempt_at, object_key);
CREATE INDEX receipt_cleanup_upload_id_idx ON receipt_cleanup(upload_id);
ALTER TABLE receipt_cleanup ENABLE ROW LEVEL SECURITY;

-- Track existing staging objects by known upload intent, without scanning or
-- guessing ownership of arbitrary bucket objects. Submitted final keys stay put.
INSERT INTO receipt_cleanup(object_key, upload_id, kind, created_at, next_attempt_at)
SELECT object_key, id, 'staging', created_at, expires_at + interval '24 hours'
FROM payment_uploads;
