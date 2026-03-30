-- Migration: Add ai_paused column to conversations table
-- Run this in Supabase SQL Editor

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN NOT NULL DEFAULT false;

-- Update existing rows to have ai_paused = false
UPDATE conversations SET ai_paused = false WHERE ai_paused IS NULL;

-- Verify
SELECT id, lead_phone, status, ai_paused FROM conversations LIMIT 5;
