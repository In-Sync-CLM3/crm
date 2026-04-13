-- Daily lead refresh cron job.
--
-- Fires at 01:00 UTC (06:30 IST) every day.
-- Calls mkt-daily-lead-refresh which checks every active product across all orgs;
-- for any product with fewer than 3000 status='new' contacts it fires mkt-source-leads
-- (self-chaining, cursor-based) to top the pool back up.

SELECT cron.unschedule('mkt-daily-lead-refresh') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mkt-daily-lead-refresh'
);

SELECT cron.schedule(
  'mkt-daily-lead-refresh',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-daily-lead-refresh',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
