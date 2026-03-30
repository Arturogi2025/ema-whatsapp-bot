-- =============================================
-- Notes & Tags tables for Bolt Dashboard
-- Run this in Supabase SQL Editor
-- =============================================

-- Internal notes (private, not sent to client)
CREATE TABLE IF NOT EXISTS conversation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_conversation ON conversation_notes(conversation_id);

-- Tags / labels for conversations
CREATE TABLE IF NOT EXISTS conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  color TEXT DEFAULT '#60a5fa',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_tags_conversation ON conversation_tags(conversation_id);
