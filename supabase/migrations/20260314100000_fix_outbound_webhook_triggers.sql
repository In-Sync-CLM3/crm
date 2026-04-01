-- Fix outbound webhook system:
-- 1. Allow GET as HTTP method for webhooks
-- 2. Recreate trigger function with correct Supabase URL
-- 3. Drop old-style triggers that cause duplicates and don't send tableName/operation
-- 4. Create generic triggers for all webhook-eligible tables
-- 5. Update existing webhook trigger_event values to match new naming convention

-- ============================================================
-- 1. Allow GET HTTP method
-- ============================================================
ALTER TABLE outbound_webhooks DROP CONSTRAINT IF EXISTS outbound_webhooks_http_method_check;
ALTER TABLE outbound_webhooks ADD CONSTRAINT outbound_webhooks_http_method_check
  CHECK (http_method IN ('POST', 'PUT', 'PATCH', 'GET'));

-- ============================================================
-- 1. Recreate trigger_outbound_webhook_generic() with correct URL
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_outbound_webhook_generic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  trigger_data_json JSONB;
  target_org_id UUID;
  operation_name TEXT;
BEGIN
  -- Get org_id (must exist in the row)
  target_org_id := COALESCE(NEW.org_id, OLD.org_id);

  -- Build event name and data based on operation
  IF TG_OP = 'INSERT' THEN
    operation_name := TG_TABLE_NAME || '_created';
    trigger_data_json := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    operation_name := TG_TABLE_NAME || '_updated';
    trigger_data_json := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    operation_name := TG_TABLE_NAME || '_deleted';
    trigger_data_json := to_jsonb(OLD);
  END IF;

  -- Call edge function with correct project URL
  PERFORM net.http_post(
    url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/outbound-webhook-handler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'orgId', target_org_id,
      'triggerEvent', operation_name,
      'triggerData', trigger_data_json,
      'tableName', TG_TABLE_NAME,
      'operation', TG_OP
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================
-- 2. Drop old-style triggers (they don't send tableName/operation
--    and use inconsistent event naming)
-- ============================================================
DROP TRIGGER IF EXISTS trigger_contact_created_webhook ON public.contacts;
DROP TRIGGER IF EXISTS outbound_webhook_contact_updated ON public.contacts;
DROP TRIGGER IF EXISTS outbound_webhook_stage_changed ON public.contacts;
DROP TRIGGER IF EXISTS outbound_webhook_assignment_changed ON public.contacts;
DROP TRIGGER IF EXISTS outbound_webhook_activity_logged ON public.contact_activities;
DROP TRIGGER IF EXISTS outbound_webhook_disposition_set ON public.contact_activities;

-- ============================================================
-- 3. Create generic triggers for all webhook-eligible tables
-- ============================================================

-- contacts
DROP TRIGGER IF EXISTS webhook_contacts_insert ON public.contacts;
CREATE TRIGGER webhook_contacts_insert
  AFTER INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_contacts_update ON public.contacts;
CREATE TRIGGER webhook_contacts_update
  AFTER UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_contacts_delete ON public.contacts;
CREATE TRIGGER webhook_contacts_delete
  AFTER DELETE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- contact_activities
DROP TRIGGER IF EXISTS webhook_contact_activities_insert ON public.contact_activities;
CREATE TRIGGER webhook_contact_activities_insert
  AFTER INSERT ON public.contact_activities
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_contact_activities_update ON public.contact_activities;
CREATE TRIGGER webhook_contact_activities_update
  AFTER UPDATE ON public.contact_activities
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_contact_activities_delete ON public.contact_activities;
CREATE TRIGGER webhook_contact_activities_delete
  AFTER DELETE ON public.contact_activities
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- email_bulk_campaigns
DROP TRIGGER IF EXISTS webhook_email_bulk_campaigns_insert ON public.email_bulk_campaigns;
CREATE TRIGGER webhook_email_bulk_campaigns_insert
  AFTER INSERT ON public.email_bulk_campaigns
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_email_bulk_campaigns_update ON public.email_bulk_campaigns;
CREATE TRIGGER webhook_email_bulk_campaigns_update
  AFTER UPDATE ON public.email_bulk_campaigns
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_email_bulk_campaigns_delete ON public.email_bulk_campaigns;
CREATE TRIGGER webhook_email_bulk_campaigns_delete
  AFTER DELETE ON public.email_bulk_campaigns
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- blog_posts
DROP TRIGGER IF EXISTS webhook_blog_posts_insert ON public.blog_posts;
CREATE TRIGGER webhook_blog_posts_insert
  AFTER INSERT ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_blog_posts_update ON public.blog_posts;
CREATE TRIGGER webhook_blog_posts_update
  AFTER UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_blog_posts_delete ON public.blog_posts;
CREATE TRIGGER webhook_blog_posts_delete
  AFTER DELETE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- whatsapp_bulk_campaigns
DROP TRIGGER IF EXISTS webhook_whatsapp_bulk_campaigns_insert ON public.whatsapp_bulk_campaigns;
CREATE TRIGGER webhook_whatsapp_bulk_campaigns_insert
  AFTER INSERT ON public.whatsapp_bulk_campaigns
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_whatsapp_bulk_campaigns_update ON public.whatsapp_bulk_campaigns;
CREATE TRIGGER webhook_whatsapp_bulk_campaigns_update
  AFTER UPDATE ON public.whatsapp_bulk_campaigns
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_whatsapp_bulk_campaigns_delete ON public.whatsapp_bulk_campaigns;
CREATE TRIGGER webhook_whatsapp_bulk_campaigns_delete
  AFTER DELETE ON public.whatsapp_bulk_campaigns
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- call_logs
DROP TRIGGER IF EXISTS webhook_call_logs_insert ON public.call_logs;
CREATE TRIGGER webhook_call_logs_insert
  AFTER INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_call_logs_update ON public.call_logs;
CREATE TRIGGER webhook_call_logs_update
  AFTER UPDATE ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_call_logs_delete ON public.call_logs;
CREATE TRIGGER webhook_call_logs_delete
  AFTER DELETE ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- email_conversations
DROP TRIGGER IF EXISTS webhook_email_conversations_insert ON public.email_conversations;
CREATE TRIGGER webhook_email_conversations_insert
  AFTER INSERT ON public.email_conversations
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_email_conversations_update ON public.email_conversations;
CREATE TRIGGER webhook_email_conversations_update
  AFTER UPDATE ON public.email_conversations
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_email_conversations_delete ON public.email_conversations;
CREATE TRIGGER webhook_email_conversations_delete
  AFTER DELETE ON public.email_conversations
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- whatsapp_messages
DROP TRIGGER IF EXISTS webhook_whatsapp_messages_insert ON public.whatsapp_messages;
CREATE TRIGGER webhook_whatsapp_messages_insert
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_whatsapp_messages_update ON public.whatsapp_messages;
CREATE TRIGGER webhook_whatsapp_messages_update
  AFTER UPDATE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_whatsapp_messages_delete ON public.whatsapp_messages;
CREATE TRIGGER webhook_whatsapp_messages_delete
  AFTER DELETE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- pipeline_stages
DROP TRIGGER IF EXISTS webhook_pipeline_stages_insert ON public.pipeline_stages;
CREATE TRIGGER webhook_pipeline_stages_insert
  AFTER INSERT ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_pipeline_stages_update ON public.pipeline_stages;
CREATE TRIGGER webhook_pipeline_stages_update
  AFTER UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_pipeline_stages_delete ON public.pipeline_stages;
CREATE TRIGGER webhook_pipeline_stages_delete
  AFTER DELETE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- teams
DROP TRIGGER IF EXISTS webhook_teams_insert ON public.teams;
CREATE TRIGGER webhook_teams_insert
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_teams_update ON public.teams;
CREATE TRIGGER webhook_teams_update
  AFTER UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_teams_delete ON public.teams;
CREATE TRIGGER webhook_teams_delete
  AFTER DELETE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- profiles
DROP TRIGGER IF EXISTS webhook_profiles_insert ON public.profiles;
CREATE TRIGGER webhook_profiles_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_profiles_update ON public.profiles;
CREATE TRIGGER webhook_profiles_update
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_profiles_delete ON public.profiles;
CREATE TRIGGER webhook_profiles_delete
  AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- support_tickets (recreate to ensure consistency)
DROP TRIGGER IF EXISTS webhook_support_tickets_insert ON public.support_tickets;
CREATE TRIGGER webhook_support_tickets_insert
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_support_tickets_update ON public.support_tickets;
CREATE TRIGGER webhook_support_tickets_update
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_support_tickets_delete ON public.support_tickets;
CREATE TRIGGER webhook_support_tickets_delete
  AFTER DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- support_ticket_comments
DROP TRIGGER IF EXISTS webhook_support_ticket_comments_insert ON public.support_ticket_comments;
CREATE TRIGGER webhook_support_ticket_comments_insert
  AFTER INSERT ON public.support_ticket_comments
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_support_ticket_comments_update ON public.support_ticket_comments;
CREATE TRIGGER webhook_support_ticket_comments_update
  AFTER UPDATE ON public.support_ticket_comments
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_support_ticket_comments_delete ON public.support_ticket_comments;
CREATE TRIGGER webhook_support_ticket_comments_delete
  AFTER DELETE ON public.support_ticket_comments
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- support_ticket_history
DROP TRIGGER IF EXISTS webhook_support_ticket_history_insert ON public.support_ticket_history;
CREATE TRIGGER webhook_support_ticket_history_insert
  AFTER INSERT ON public.support_ticket_history
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_support_ticket_history_update ON public.support_ticket_history;
CREATE TRIGGER webhook_support_ticket_history_update
  AFTER UPDATE ON public.support_ticket_history
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_support_ticket_history_delete ON public.support_ticket_history;
CREATE TRIGGER webhook_support_ticket_history_delete
  AFTER DELETE ON public.support_ticket_history
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- support_ticket_escalations
DROP TRIGGER IF EXISTS webhook_support_ticket_escalations_insert ON public.support_ticket_escalations;
CREATE TRIGGER webhook_support_ticket_escalations_insert
  AFTER INSERT ON public.support_ticket_escalations
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_support_ticket_escalations_update ON public.support_ticket_escalations;
CREATE TRIGGER webhook_support_ticket_escalations_update
  AFTER UPDATE ON public.support_ticket_escalations
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

DROP TRIGGER IF EXISTS webhook_support_ticket_escalations_delete ON public.support_ticket_escalations;
CREATE TRIGGER webhook_support_ticket_escalations_delete
  AFTER DELETE ON public.support_ticket_escalations
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- ============================================================
-- 4. Update existing webhook trigger_event values to match
--    the new table-based naming convention
-- ============================================================
UPDATE outbound_webhooks SET trigger_event = 'contacts_created'
  WHERE trigger_event = 'contact_created';

UPDATE outbound_webhooks SET trigger_event = 'contacts_updated'
  WHERE trigger_event IN ('contact_updated', 'stage_changed', 'assignment_changed');

UPDATE outbound_webhooks SET trigger_event = 'contact_activities_created',
  target_table = 'contact_activities'
  WHERE trigger_event = 'activity_logged';

UPDATE outbound_webhooks SET trigger_event = 'contact_activities_updated',
  target_table = 'contact_activities'
  WHERE trigger_event = 'disposition_set';
