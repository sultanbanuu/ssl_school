CREATE TABLE "push_devices" (
  "token" TEXT PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE
);
CREATE INDEX "push_devices_user_id_idx" ON "push_devices"("user_id");
CREATE TABLE "push_deliveries" (
  "id" UUID PRIMARY KEY,
  "notification_id" UUID NOT NULL REFERENCES "notifications"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL REFERENCES "push_devices"("token") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "ticket_id" TEXT,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "push_deliveries_notification_id_token_key" ON "push_deliveries"("notification_id", "token");
CREATE INDEX "push_deliveries_status_next_attempt_at_idx" ON "push_deliveries"("status", "next_attempt_at");
ALTER TABLE "push_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_deliveries" ENABLE ROW LEVEL SECURITY;
