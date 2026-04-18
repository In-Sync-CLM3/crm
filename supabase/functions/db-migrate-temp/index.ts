import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const MIGRATION = `
CREATE OR REPLACE FUNCTION public.mkt_campaign_daily_stats(
  p_org_id uuid,
  p_days   int DEFAULT 30
)
RETURNS TABLE (
  campaign_id   uuid,
  campaign_name text,
  date          date,
  sent          bigint,
  failed        bigint,
  opens         bigint,
  clicks        bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.id               AS campaign_id,
    c.name             AS campaign_name,
    a.created_at::date AS date,
    COUNT(*) FILTER (WHERE a.status IN ('sent','delivered')) AS sent,
    COUNT(*) FILTER (WHERE a.status = 'failed')              AS failed,
    COUNT(*) FILTER (WHERE a.opened_at  IS NOT NULL)         AS opens,
    COUNT(*) FILTER (WHERE a.clicked_at IS NOT NULL)         AS clicks
  FROM public.mkt_campaigns            c
  JOIN public.mkt_sequence_enrollments e ON e.campaign_id  = c.id
  JOIN public.mkt_sequence_actions     a ON a.enrollment_id = e.id
  WHERE c.org_id      = p_org_id
    AND a.created_at >= now() - (p_days || ' days')::interval
  GROUP BY c.id, c.name, a.created_at::date
  ORDER BY c.name, a.created_at::date;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_campaign_daily_stats(uuid, int) TO authenticated;
`;

serve(async (_req) => {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(MIGRATION);
    return new Response(JSON.stringify({ ok: true, message: "mkt_campaign_daily_stats created" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    await sql.end();
  }
});
