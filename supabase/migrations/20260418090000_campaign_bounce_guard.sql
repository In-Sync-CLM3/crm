-- Campaign bounce guard: probe_sent_at tracks when the initial probe batch
-- (first N emails) was completed so the executor can wait for bounce signals
-- before opening the full send.

ALTER TABLE public.mkt_campaigns
  ADD COLUMN IF NOT EXISTS probe_sent_at TIMESTAMPTZ;

-- Existing campaigns are already established — treat them as having passed
-- probe phase long ago so no wait period is imposed on the current runs.
UPDATE public.mkt_campaigns
SET probe_sent_at = created_at
WHERE probe_sent_at IS NULL;
