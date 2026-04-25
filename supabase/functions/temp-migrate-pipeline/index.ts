import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const SQL = `
CREATE OR REPLACE FUNCTION public.mkt_step1_pipeline(p_org_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  campaign_id      uuid,
  queued           bigint,
  delivered_today  bigint,
  in_flight_today  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH step1_steps AS (
    SELECT cs.id AS step_id, cs.campaign_id
    FROM public.mkt_campaign_steps cs
    JOIN public.mkt_campaigns c ON c.id = cs.campaign_id
    WHERE c.org_id = p_org_id AND cs.step_number = 1 AND cs.is_active = true
  ),
  queued AS (
    SELECT se.campaign_id, COUNT(*) AS queued
    FROM public.mkt_sequence_enrollments se
    JOIN public.mkt_campaigns c ON c.id = se.campaign_id
    WHERE c.org_id = p_org_id AND se.status = 'active' AND se.current_step = 1
    GROUP BY se.campaign_id
  ),
  today_actions AS (
    SELECT s.campaign_id,
      COUNT(*) FILTER (WHERE a.delivered_at IS NOT NULL) AS delivered_today,
      COUNT(*) FILTER (WHERE a.status IN ('sent','pending') AND a.delivered_at IS NULL) AS in_flight_today
    FROM public.mkt_sequence_actions a
    JOIN step1_steps s ON s.step_id = a.step_id
    WHERE a.created_at >= p_date::timestamptz AND a.created_at < (p_date + 1)::timestamptz
    GROUP BY s.campaign_id
  )
  SELECT
    c.id AS campaign_id,
    COALESCE(q.queued, 0)          AS queued,
    COALESCE(t.delivered_today, 0) AS delivered_today,
    COALESCE(t.in_flight_today, 0) AS in_flight_today
  FROM public.mkt_campaigns c
  LEFT JOIN queued        q ON q.campaign_id = c.id
  LEFT JOIN today_actions t ON t.campaign_id = c.id
  WHERE c.org_id = p_org_id AND c.sequence_priority IS NOT NULL
  ORDER BY c.sequence_priority;
$$;
GRANT EXECUTE ON FUNCTION public.mkt_step1_pipeline(uuid, date) TO authenticated;
`;

serve(async (_req) => {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), { status: 500, headers: { "Content-Type": "application/json" } });
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(SQL);
    return new Response(JSON.stringify({ ok: true, result: "mkt_step1_pipeline created" }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  } finally {
    await sql.end();
  }
});
