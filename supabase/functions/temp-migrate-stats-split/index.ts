import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const SQL_UPDATE_RPC = `
DROP FUNCTION IF EXISTS public.mkt_daily_campaign_stats(uuid, date);

CREATE OR REPLACE FUNCTION public.mkt_daily_campaign_stats(p_org_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  campaign_id   uuid,
  channel       text,
  outreach_type text,
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
`;

const SQL_ADD_CRON = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
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
`;

serve(async (_req) => {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const sql = postgres(dbUrl, { max: 1 });
  const results: string[] = [];
  try {
    await sql.unsafe(SQL_UPDATE_RPC);
    results.push("mkt_daily_campaign_stats RPC updated");

    await sql.unsafe(SQL_ADD_CRON);
    results.push("pg_cron job mkt-outreach-executor registered");

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), results }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  } finally {
    await sql.end();
  }
});
