import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const MIGRATIONS = [
  // 1. Engine daily stats
  `CREATE OR REPLACE FUNCTION public.mkt_engine_daily_stats(p_org_id uuid, p_days int DEFAULT 30)
RETURNS TABLE (date date, channel text, sent bigint, opens bigint, clicks bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT a.created_at::date AS date, a.channel,
    COUNT(a.id) FILTER (WHERE a.status IN ('sent','delivered')) AS sent,
    COUNT(a.id) FILTER (WHERE a.opened_at  IS NOT NULL)         AS opens,
    COUNT(a.id) FILTER (WHERE a.clicked_at IS NOT NULL)         AS clicks
  FROM public.mkt_campaigns c
  JOIN public.mkt_sequence_enrollments e ON e.campaign_id  = c.id
  JOIN public.mkt_sequence_actions     a ON a.enrollment_id = e.id
  WHERE c.org_id = p_org_id AND a.created_at >= now() - (p_days||' days')::interval
  GROUP BY a.created_at::date, a.channel
  ORDER BY a.created_at::date, a.channel;
$$;
GRANT EXECUTE ON FUNCTION public.mkt_engine_daily_stats(uuid,int) TO authenticated;`,

  // 2. Channel plan table
  `CREATE TABLE IF NOT EXISTS public.mkt_channel_plan (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_key         text        NOT NULL,
  channel             text        NOT NULL CHECK (channel IN ('email','whatsapp','calling','google_ads','meta_ads','linkedin','blog','social')),
  planned_start_date  date,
  actual_start_date   date,
  status              text        NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','paused','not_applicable')),
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (org_id, product_key, channel)
);
ALTER TABLE public.mkt_channel_plan ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mkt_channel_plan' AND policyname='org members can read channel plan') THEN
    CREATE POLICY "org members can read channel plan" ON public.mkt_channel_plan FOR SELECT
      USING (org_id IN (SELECT org_id FROM public.team_members WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mkt_channel_plan' AND policyname='org members can manage channel plan') THEN
    CREATE POLICY "org members can manage channel plan" ON public.mkt_channel_plan FOR ALL
      USING (org_id IN (SELECT org_id FROM public.team_members WHERE user_id = auth.uid()));
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_channel_plan TO authenticated;`,

  // 3. Auto-activation trigger
  `CREATE OR REPLACE FUNCTION public.auto_activate_channel_plan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_product_key text; v_org_id uuid;
BEGIN
  IF NEW.status NOT IN ('sent','delivered') THEN RETURN NEW; END IF;
  SELECT camp.product_key, camp.org_id INTO v_product_key, v_org_id
    FROM public.mkt_sequence_enrollments e
    JOIN public.mkt_campaigns camp ON camp.id = e.campaign_id
   WHERE e.id = NEW.enrollment_id;
  IF v_product_key IS NULL THEN RETURN NEW; END IF;
  UPDATE public.mkt_channel_plan
     SET status = 'active', actual_start_date = COALESCE(actual_start_date, CURRENT_DATE), updated_at = now()
   WHERE org_id = v_org_id AND product_key = v_product_key AND channel = NEW.channel AND status = 'planned';
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_auto_activate_channel_plan ON public.mkt_sequence_actions;
CREATE TRIGGER trg_auto_activate_channel_plan
  AFTER INSERT OR UPDATE OF status ON public.mkt_sequence_actions
  FOR EACH ROW EXECUTE FUNCTION public.auto_activate_channel_plan();`,

  // 4. Seed channel plan
  `INSERT INTO public.mkt_channel_plan (org_id, product_key, channel, status)
SELECT p.org_id, p.product_key, c.channel, 'planned'
FROM public.mkt_products p
CROSS JOIN (VALUES ('email'),('whatsapp'),('calling'),('google_ads'),('meta_ads'),('linkedin'),('blog'),('social')) AS c(channel)
ON CONFLICT (org_id, product_key, channel) DO NOTHING;
UPDATE public.mkt_channel_plan cp
   SET status = 'active', actual_start_date = sub.first_date, updated_at = now()
  FROM (SELECT camp.org_id, camp.product_key, a.channel, MIN(a.created_at::date) AS first_date
          FROM public.mkt_campaigns camp
          JOIN public.mkt_sequence_enrollments e ON e.campaign_id = camp.id
          JOIN public.mkt_sequence_actions a ON a.enrollment_id = e.id
         WHERE a.status IN ('sent','delivered')
         GROUP BY camp.org_id, camp.product_key, a.channel) sub
 WHERE cp.org_id = sub.org_id AND cp.product_key = sub.product_key AND cp.channel = sub.channel AND cp.status = 'planned';`,

  // 5. Product channel summary RPC
  `CREATE OR REPLACE FUNCTION public.mkt_product_channel_summary(p_org_id uuid)
RETURNS TABLE (product_key text, channel text, plan_status text, planned_start_date date, actual_start_date date, sent bigint, failed bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, last_active_date date, daily_7d_avg numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT cp.product_key, cp.channel, cp.status AS plan_status, cp.planned_start_date, cp.actual_start_date,
    COALESCE(COUNT(a.id) FILTER (WHERE a.status IN ('sent','delivered')),0) AS sent,
    COALESCE(COUNT(a.id) FILTER (WHERE a.status = 'failed'),0)              AS failed,
    COALESCE(COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL),0)       AS delivered,
    COALESCE(COUNT(a.id) FILTER (WHERE a.opened_at   IS NOT NULL),0)        AS opens,
    COALESCE(COUNT(a.id) FILTER (WHERE a.clicked_at  IS NOT NULL),0)        AS clicks,
    COALESCE(COUNT(a.id) FILTER (WHERE a.replied_at  IS NOT NULL),0)        AS replies,
    MAX(a.created_at)::date AS last_active_date,
    ROUND(COALESCE(COUNT(a.id) FILTER (WHERE a.status IN ('sent','delivered') AND a.created_at >= now()-'7 days'::interval),0)::numeric/7,1) AS daily_7d_avg
  FROM public.mkt_channel_plan cp
  LEFT JOIN public.mkt_campaigns camp ON camp.org_id = cp.org_id AND camp.product_key = cp.product_key
  LEFT JOIN public.mkt_sequence_enrollments e ON e.campaign_id = camp.id
  LEFT JOIN public.mkt_sequence_actions a ON a.enrollment_id = e.id AND a.channel = cp.channel
  WHERE cp.org_id = p_org_id
  GROUP BY cp.product_key, cp.channel, cp.status, cp.planned_start_date, cp.actual_start_date
  ORDER BY cp.product_key, cp.channel;
$$;
GRANT EXECUTE ON FUNCTION public.mkt_product_channel_summary(uuid) TO authenticated;`,

  // 6. Hot leads RPC
  `CREATE OR REPLACE FUNCTION public.mkt_hot_leads(p_org_id uuid, p_limit int DEFAULT 15)
RETURNS TABLE (lead_id uuid, full_name text, company text, product_key text, channels text[], opens bigint, clicks bigint, replies bigint, wa_delivered bigint, fit_score integer, intent_score integer, db_eng_score integer, activity_score bigint, total_score bigint, last_activity timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT e.lead_id,
    TRIM(COALESCE(c.first_name,'')||' '||COALESCE(c.last_name,'')) AS full_name,
    COALESCE(c.company,'') AS company,
    camp.product_key,
    ARRAY_AGG(DISTINCT a.channel) FILTER (WHERE a.status IN ('sent','delivered')) AS channels,
    COUNT(a.id) FILTER (WHERE a.opened_at   IS NOT NULL) AS opens,
    COUNT(a.id) FILTER (WHERE a.clicked_at  IS NOT NULL) AS clicks,
    COUNT(a.id) FILTER (WHERE a.replied_at  IS NOT NULL) AS replies,
    COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL AND a.channel='whatsapp') AS wa_delivered,
    COALESCE(ls.fit_score,0)        AS fit_score,
    COALESCE(ls.intent_score,0)     AS intent_score,
    COALESCE(ls.engagement_score,0) AS db_eng_score,
    (COUNT(a.id) FILTER (WHERE a.opened_at  IS NOT NULL)*1 +
     COUNT(a.id) FILTER (WHERE a.clicked_at IS NOT NULL)*3 +
     COUNT(a.id) FILTER (WHERE a.replied_at IS NOT NULL)*10 +
     COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL AND a.channel='whatsapp')*2) AS activity_score,
    (COALESCE(ls.fit_score,0)+COALESCE(ls.intent_score,0)+COALESCE(ls.engagement_score,0)+
     COUNT(a.id) FILTER (WHERE a.opened_at  IS NOT NULL)*1 +
     COUNT(a.id) FILTER (WHERE a.clicked_at IS NOT NULL)*3 +
     COUNT(a.id) FILTER (WHERE a.replied_at IS NOT NULL)*10 +
     COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL AND a.channel='whatsapp')*2)::bigint AS total_score,
    MAX(GREATEST(
      COALESCE(a.opened_at,'-infinity'::timestamptz), COALESCE(a.clicked_at,'-infinity'::timestamptz),
      COALESCE(a.replied_at,'-infinity'::timestamptz), COALESCE(a.delivered_at,'-infinity'::timestamptz)
    )) FILTER (WHERE a.opened_at IS NOT NULL OR a.clicked_at IS NOT NULL OR a.replied_at IS NOT NULL OR a.delivered_at IS NOT NULL) AS last_activity
  FROM public.mkt_campaigns camp
  JOIN public.mkt_sequence_enrollments e  ON e.campaign_id  = camp.id
  JOIN public.mkt_leads                l  ON l.id           = e.lead_id
  LEFT JOIN public.contacts            c  ON c.id           = l.contact_id
  JOIN public.mkt_sequence_actions     a  ON a.enrollment_id = e.id
  LEFT JOIN public.mkt_lead_scores     ls ON ls.lead_id     = e.lead_id
  WHERE camp.org_id = p_org_id
  GROUP BY e.lead_id, c.first_name, c.last_name, c.company, camp.product_key, ls.fit_score, ls.intent_score, ls.engagement_score
  HAVING (COUNT(a.id) FILTER (WHERE a.opened_at IS NOT NULL)+COUNT(a.id) FILTER (WHERE a.clicked_at IS NOT NULL)+COUNT(a.id) FILTER (WHERE a.replied_at IS NOT NULL)+COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL))>0
  ORDER BY (COALESCE(ls.fit_score,0)+COALESCE(ls.intent_score,0)+COALESCE(ls.engagement_score,0)+
    COUNT(a.id) FILTER (WHERE a.opened_at IS NOT NULL)*1+COUNT(a.id) FILTER (WHERE a.clicked_at IS NOT NULL)*3+
    COUNT(a.id) FILTER (WHERE a.replied_at IS NOT NULL)*10+COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL AND a.channel='whatsapp')*2) DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.mkt_hot_leads(uuid,int) TO authenticated;`
];

serve(async (_req) => {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), { status: 500, headers: { "Content-Type": "application/json" } });
  const sql = postgres(dbUrl, { max: 1 });
  const results: string[] = [];
  try {
    for (let i = 0; i < MIGRATIONS.length; i++) {
      await sql.unsafe(MIGRATIONS[i]);
      results.push(`migration ${i + 1} ok`);
    }
    return new Response(JSON.stringify({ ok: true, results }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), results }), { status: 500, headers: { "Content-Type": "application/json" } });
  } finally {
    await sql.end();
  }
});
