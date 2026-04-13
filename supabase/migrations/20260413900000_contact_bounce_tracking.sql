-- Bounce tracking on contacts
-- email_bounce_type: 'hard' = permanent failure, never retry
--                   'soft' = temporary, retry up to threshold
-- email_soft_bounce_count: increments on soft bounces; at 3 → hard

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS email_bounce_type       text,           -- 'hard' | 'soft' | null
  ADD COLUMN IF NOT EXISTS email_bounced_at        timestamptz,
  ADD COLUMN IF NOT EXISTS email_soft_bounce_count int NOT NULL DEFAULT 0;

-- Fast lookup for suppression checks
CREATE INDEX IF NOT EXISTS idx_contacts_email_bounce
  ON contacts(org_id, email_bounce_type)
  WHERE email_bounce_type IS NOT NULL;

-- Ensure mkt_unsubscribes has an updated_at for upsert tracking
ALTER TABLE mkt_unsubscribes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
