-- Add email verification columns to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS email_verification_status TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_provider TEXT,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Index for batch querying unverified emails
CREATE INDEX IF NOT EXISTS idx_contacts_email_unverified
  ON contacts(org_id, created_at)
  WHERE email IS NOT NULL AND email_verification_status IS NULL AND email_bounce_type IS NULL;

-- Index for filtering by verification status
CREATE INDEX IF NOT EXISTS idx_contacts_email_verification_status
  ON contacts(org_id, email_verification_status)
  WHERE email IS NOT NULL;

-- Schedule email verifier every 15 minutes
SELECT cron.schedule(
  'mkt-email-verifier',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-email-verifier',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
