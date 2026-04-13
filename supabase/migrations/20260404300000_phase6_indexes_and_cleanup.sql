-- Phase 6: Database Layer Optimization
-- Add missing indexes on hot-path columns and consolidate triggers

-- 6A: Add missing indexes on frequently queried columns

-- contacts.status — used in Clients page tabs, stats RPC, bulk filters
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts (status);

-- call_logs.status — used in CallingDashboard stats RPC, sync functions
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs (status);

-- call_logs composite — hot path for dashboard: status + created_at + agent_id
CREATE INDEX IF NOT EXISTS idx_call_logs_dashboard
  ON call_logs (status, created_at DESC, agent_id)
  WHERE status IN ('completed', 'failed', 'busy', 'no-answer', 'canceled');

-- contact_activities composite — used by daily-lead-scoring batch fetch
CREATE INDEX IF NOT EXISTS idx_contact_activities_contact_type
  ON contact_activities (contact_id, activity_type);

-- billing_documents — if table exists (created in revenue engine)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_documents') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_billing_docs_type_date ON billing_documents (doc_type, doc_date)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_billing_docs_status ON billing_documents (status)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_billing_docs_client ON billing_documents (client_id)';
  END IF;
END;
$$;

-- 6B: Remove duplicate index on contacts.pipeline_stage_id
-- idx_contacts_pipeline_stage and idx_contacts_pipeline_stage_id are identical
DROP INDEX IF EXISTS idx_contacts_pipeline_stage;

-- 6C: Consolidate chat trigger to use the shared function
-- update_chat_updated_at() is identical to update_updated_at_column()
-- Migrate the 2 chat triggers to use the shared function, then drop the duplicate

DO $$
BEGIN
  -- Drop old triggers
  DROP TRIGGER IF EXISTS update_chat_conversations_updated_at ON chat_conversations;
  DROP TRIGGER IF EXISTS update_chat_messages_updated_at ON chat_messages;

  -- Recreate using the shared function
  CREATE TRIGGER update_chat_conversations_updated_at
    BEFORE UPDATE ON chat_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  CREATE TRIGGER update_chat_messages_updated_at
    BEFORE UPDATE ON chat_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  -- Drop the duplicate function
  DROP FUNCTION IF EXISTS update_chat_updated_at();

  RAISE NOTICE 'Consolidated chat triggers to use shared update_updated_at_column()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Chat trigger consolidation skipped: %', SQLERRM;
END;
$$;
