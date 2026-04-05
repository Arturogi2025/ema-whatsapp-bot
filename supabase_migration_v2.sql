-- ============================================================
-- Migration v2: Message attribution, follow-up tracking, auto-pause
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add sent_by to messages (tracks who sent assistant messages: 'ai', 'manual', 'cron', 'template')
-- NULL for user messages, set for assistant messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_by TEXT;

-- Backfill existing assistant messages as 'ai' (best guess for historical data)
UPDATE messages SET sent_by = 'ai' WHERE role = 'assistant' AND sent_by IS NULL;

-- 2. Add follow-up tracking to conversations
-- last_customer_message_at: when the customer last sent a message (for follow-up timing)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ;

-- followup_stage: tracks which follow-up has been sent
-- 0 = none, 1 = ai_followup (within 24h window), 2 = 24h template, 3 = 48h template, 4 = 5day template, 5 = 10day template
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS followup_stage INTEGER DEFAULT 0;

-- auto_pause_reason: why AI was auto-paused (null = not auto-paused or manually paused)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS auto_pause_reason TEXT;

-- 3. Backfill last_customer_message_at from existing messages
UPDATE conversations c
SET last_customer_message_at = (
  SELECT MAX(m.timestamp)
  FROM messages m
  WHERE m.conversation_id = c.id AND m.role = 'user'
);

-- 4. Index for efficient follow-up queries
CREATE INDEX IF NOT EXISTS idx_conversations_followup
  ON conversations (status, followup_stage, last_customer_message_at)
  WHERE status = 'active' AND ai_paused = false;

CREATE INDEX IF NOT EXISTS idx_messages_sent_by
  ON messages (sent_by)
  WHERE role = 'assistant';

-- 5. Clean up test conversations (from test-webhook.sh script)
-- These used fake phone numbers 5215500000001-5215500000010
DELETE FROM messages WHERE conversation_id IN (
  SELECT id FROM conversations WHERE lead_phone LIKE '521550000000%'
);
DELETE FROM leads_bolt WHERE conversation_id IN (
  SELECT id FROM conversations WHERE lead_phone LIKE '521550000000%'
);
DELETE FROM conversation_tags WHERE conversation_id IN (
  SELECT id FROM conversations WHERE lead_phone LIKE '521550000000%'
);
DELETE FROM conversation_notes WHERE conversation_id IN (
  SELECT id FROM conversations WHERE lead_phone LIKE '521550000000%'
);
DELETE FROM conversations WHERE lead_phone LIKE '521550000000%';

-- 6. Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('messages', 'conversations')
  AND column_name IN ('sent_by', 'last_customer_message_at', 'followup_stage', 'auto_pause_reason')
ORDER BY table_name, column_name;
