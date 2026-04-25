-- Split mkt_daily_campaign_stats by outreach_type (cold_outreach vs followup).
-- Powers the Daily Report UI which now shows two labelled rows per campaign.
-- Also registers the pg_cron job for mkt-outreach-executor (step-1 cold outreach).

-- 1. Drop old signature (p_org_id, p_date) and replace with version that adds outreach_type.
DROP FUNCTION IF EXISTS public.mkt_daily_campaign_stats(uuid, date);

CREATE OR REPLACE FUNCTION public.mkt_daily_campaign_stats(p_org_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  campaign_id   uuid,
  channel       text,
  outreach_type text,   -- 'cold_outreach' (step_number = 1) | 'followup' (step_number > 1)
  sent          bigint,
  delivered     bigint,
  opens         bigint,
  clicks        bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    e.campaign_id,
    a.channel,
    CASE WHEN a.step_number = 1 THEN 'cold_outreach' ELSE 'followup' END AS outreach_type,
    COUNT(*) FILTER (WHERE a.status IN ('sent','delivered','bounced')) AS sent,
    COUNT(*) FILTER (WHERE a.delivered_at IS NOT NULL)                 AS delivered,
    COUNT(*) FILTER (WHERE a.opened_at   IS NOT NULL)                  AS opens,
    COUNT(*) FILTER (WHERE a.clicked_at  IS NOT NULL)                  AS clicks
  FROM public.mkt_sequence_actions     a
  JOIN public.mkt_sequence_enrollments e ON e.id = a.enrollment_id
  JOIN public.mkt_campaigns            c ON c.id = e.campaign_id
  WHERE c.org_id   = p_org_id
    AND a.channel  IN ('email', 'whatsapp')
    AND a.created_at >= p_date::timestamptz
    AND a.created_at <  (p_date + 1)::timestamptz
  GROUP BY e.campaign_id, a.channel, (a.step_number = 1)
  ORDER BY e.campaign_id, a.channel, outreach_type;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_daily_campaign_stats(uuid, date) TO authenticated;

-- 2. Register pg_cron job for mkt-outreach-executor (step-1 cold outreach, every 5 min).
--    Runs in the same window as mkt-sequence-executor (follow-ups).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old job if it exists (idempotent)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mkt-outreach-executor') THEN
      PERFORM cron.unschedule('mkt-outreach-executor');
    END IF;
    PERFORM cron.schedule(
      'mkt-outreach-executor',
      '*/5 * * * *',
      $sql$SELECT net.http_post(
        url     := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-outreach-executor',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body    := '{}'::jsonb
      )$sql$
    );
  END IF;
END $$;
