-- ============================================================
-- Fix: push_subscriptions trigger uses wrong function name
-- The trigger called update_updated_at() but the function is
-- named update_updated_at_column() (defined in whatsapp schema)
-- ============================================================

-- Drop the broken trigger first (if it exists)
DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON push_subscriptions;

-- Recreate with the correct function name
CREATE OR REPLACE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
