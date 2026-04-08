-- ============================================================
-- respond_locks table
-- Prevents duplicate AI responses caused by parallel webhook
-- invocations (e.g. WhatsApp retrying a webhook delivery).
--
-- Each incoming WhatsApp message gets a unique ID (wamid.*).
-- The first respond.ts invocation to insert that ID wins the
-- "lock"; subsequent invocations get a 23505 unique_violation
-- and bail out immediately.
--
-- TTL: rows are auto-deleted after 1 hour via pg_cron or
-- manually — they're only needed during the ~2-min respond window.
-- ============================================================

CREATE TABLE IF NOT EXISTS respond_locks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_message_id  text NOT NULL,
  conversation_id      uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT respond_locks_wamid_unique UNIQUE (whatsapp_message_id)
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS respond_locks_created_at_idx ON respond_locks (created_at);

-- Enable Row Level Security (service role bypasses this automatically)
ALTER TABLE respond_locks ENABLE ROW LEVEL SECURITY;

-- ── Optional: auto-cleanup rows older than 2 hours ──
-- Run this in pg_cron if available, or manually via a scheduled job.
-- DELETE FROM respond_locks WHERE created_at < now() - interval '2 hours';
