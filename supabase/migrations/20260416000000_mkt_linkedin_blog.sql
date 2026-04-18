-- LinkedIn blog engine: config table + blog_posts extensions

-- 1. mkt_linkedin_config
CREATE TABLE IF NOT EXISTS public.mkt_linkedin_config (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  linkedin_org_id          TEXT        NOT NULL DEFAULT '35932282',
  -- 9 IST time slots HH:MM, index 0-8
  experiment_slots         JSONB       NOT NULL DEFAULT '["07:30","08:30","10:00","12:00","13:30","15:30","17:30","19:00","21:00"]'::jsonb,
  start_date               DATE        NOT NULL DEFAULT CURRENT_DATE,
  experiment_complete      BOOLEAN     NOT NULL DEFAULT false,
  winning_slot             TEXT,       -- HH:MM IST, populated after 27 days
  last_posted_date         DATE,
  last_posted_slot_index   INTEGER     NOT NULL DEFAULT -1,
  last_posted_product_key  TEXT,
  active                   BOOLEAN     NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mkt_linkedin_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on mkt_linkedin_config"
  ON public.mkt_linkedin_config FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_mkt_linkedin_config_updated_at
  BEFORE UPDATE ON public.mkt_linkedin_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Extend blog_posts with LinkedIn tracking columns
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS linkedin_post_urn          TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_slot_index        INTEGER,    -- 0-8, which time slot
  ADD COLUMN IF NOT EXISTS linkedin_cycle             INTEGER,    -- 1-3 experiment cycle
  ADD COLUMN IF NOT EXISTS linkedin_impressions       INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linkedin_likes             INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linkedin_comments          INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linkedin_reposts           INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linkedin_engagement_score  NUMERIC(10,4), -- weighted: likes + comments*3 + reposts*5
  ADD COLUMN IF NOT EXISTS linkedin_engagement_fetched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_blog_posts_linkedin_urn
  ON public.blog_posts(linkedin_post_urn)
  WHERE linkedin_post_urn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blog_posts_linkedin_slot
  ON public.blog_posts(linkedin_slot_index, linkedin_cycle)
  WHERE linkedin_slot_index IS NOT NULL;

-- 3. pg_cron jobs: 9 time slots + 1 nightly engagement tracker
-- All times UTC (IST = UTC+5:30)
SELECT cron.schedule('linkedin-slot-0', '0 2 * * *',    -- 07:30 IST
  $$SELECT net.http_post(url:='https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-blog-writer',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"}'::jsonb,body:='{}'::jsonb) AS request_id$$);

SELECT cron.schedule('linkedin-slot-1', '0 3 * * *',    -- 08:30 IST
  $$SELECT net.http_post(url:='https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-blog-writer',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"}'::jsonb,body:='{}'::jsonb) AS request_id$$);

SELECT cron.schedule('linkedin-slot-2', '30 4 * * *',   -- 10:00 IST
  $$SELECT net.http_post(url:='https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-blog-writer',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"}'::jsonb,body:='{}'::jsonb) AS request_id$$);

SELECT cron.schedule('linkedin-slot-3', '30 6 * * *',   -- 12:00 IST
  $$SELECT net.http_post(url:='https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-blog-writer',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"}'::jsonb,body:='{}'::jsonb) AS request_id$$);

SELECT cron.schedule('linkedin-slot-4', '0 8 * * *',    -- 13:30 IST
  $$SELECT net.http_post(url:='https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-blog-writer',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"}'::jsonb,body:='{}'::jsonb) AS request_id$$);

SELECT cron.schedule('linkedin-slot-5', '0 10 * * *',   -- 15:30 IST
  $$SELECT net.http_post(url:='https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-blog-writer',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"}'::jsonb,body:='{}'::jsonb) AS request_id$$);

SELECT cron.schedule('linkedin-slot-6', '0 12 * * *',   -- 17:30 IST
  $$SELECT net.http_post(url:='https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-blog-writer',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"}'::jsonb,body:='{}'::jsonb) AS request_id$$);

SELECT cron.schedule('linkedin-slot-7', '30 13 * * *',  -- 19:00 IST
  $$SELECT net.http_post(url:='https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-blog-writer',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"}'::jsonb,body:='{}'::jsonb) AS request_id$$);

SELECT cron.schedule('linkedin-slot-8', '30 15 * * *',  -- 21:00 IST
  $$SELECT net.http_post(url:='https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-blog-writer',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"}'::jsonb,body:='{}'::jsonb) AS request_id$$);

SELECT cron.schedule('linkedin-engagement-tracker', '30 17 * * *',  -- 23:00 IST
  $$SELECT net.http_post(url:='https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-linkedin-engagement-tracker',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"}'::jsonb,body:='{}'::jsonb) AS request_id$$);
