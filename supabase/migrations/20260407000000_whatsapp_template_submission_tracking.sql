-- ============================================================================
-- Add submission tracking columns to mkt_whatsapp_templates
-- Needed by mkt-submit-whatsapp-templates to record Exotel/Meta response
-- ============================================================================

ALTER TABLE public.mkt_whatsapp_templates
  ADD COLUMN IF NOT EXISTS external_template_id text,
  ADD COLUMN IF NOT EXISTS submitted_at          timestamptz,
  ADD COLUMN IF NOT EXISTS submission_error      text;
