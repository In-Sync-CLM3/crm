-- mkt_hot_leads: Top contacts by cross-channel engagement + lead scores.
-- Combines mkt_lead_scores (fit/intent/engagement) with activity signals
-- from mkt_sequence_actions to surface most conversion-ready leads.

CREATE OR REPLACE FUNCTION public.mkt_hot_leads(p_org_id uuid, p_limit int DEFAULT 15)
RETURNS TABLE (
  lead_id        uuid,
  full_name      text,
  company        text,
  product_key    text,
  channels       text[],
  opens          bigint,
  clicks         bigint,
  replies        bigint,
  wa_delivered   bigint,
  fit_score      integer,
  intent_score   integer,
  db_eng_score   integer,
  activity_score bigint,
  total_score    bigint,
  last_activity  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    e.lead_id,
    TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))    AS full_name,
    COALESCE(c.company, '')                                                 AS company,
    camp.product_key,
    ARRAY_AGG(DISTINCT a.channel)
      FILTER (WHERE a.status IN ('sent','delivered'))                       AS channels,
    COUNT(a.id) FILTER (WHERE a.opened_at   IS NOT NULL)                   AS opens,
    COUNT(a.id) FILTER (WHERE a.clicked_at  IS NOT NULL)                   AS clicks,
    COUNT(a.id) FILTER (WHERE a.replied_at  IS NOT NULL)                   AS replies,
    COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL
                          AND a.channel = 'whatsapp')                      AS wa_delivered,
    COALESCE(ls.fit_score,        0)                                        AS fit_score,
    COALESCE(ls.intent_score,     0)                                        AS intent_score,
    COALESCE(ls.engagement_score, 0)                                        AS db_eng_score,
    -- Activity score from raw signals
    (COUNT(a.id) FILTER (WHERE a.opened_at  IS NOT NULL) * 1 +
     COUNT(a.id) FILTER (WHERE a.clicked_at IS NOT NULL) * 3 +
     COUNT(a.id) FILTER (WHERE a.replied_at IS NOT NULL) * 10 +
     COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL
                           AND a.channel = 'whatsapp') * 2)                AS activity_score,
    -- Combined total (db scores + activity signals)
    (COALESCE(ls.fit_score,0) + COALESCE(ls.intent_score,0) +
     COALESCE(ls.engagement_score,0) +
     COUNT(a.id) FILTER (WHERE a.opened_at  IS NOT NULL) * 1 +
     COUNT(a.id) FILTER (WHERE a.clicked_at IS NOT NULL) * 3 +
     COUNT(a.id) FILTER (WHERE a.replied_at IS NOT NULL) * 10 +
     COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL
                           AND a.channel = 'whatsapp') * 2)::bigint        AS total_score,
    MAX(GREATEST(
      COALESCE(a.opened_at,    '-infinity'::timestamptz),
      COALESCE(a.clicked_at,   '-infinity'::timestamptz),
      COALESCE(a.replied_at,   '-infinity'::timestamptz),
      COALESCE(a.delivered_at, '-infinity'::timestamptz)
    )) FILTER (WHERE
      a.opened_at IS NOT NULL OR a.clicked_at IS NOT NULL OR
      a.replied_at IS NOT NULL OR a.delivered_at IS NOT NULL
    )                                                                       AS last_activity
  FROM public.mkt_campaigns            camp
  JOIN public.mkt_sequence_enrollments e   ON e.campaign_id   = camp.id
  JOIN public.mkt_leads                l   ON l.id            = e.lead_id
  LEFT JOIN public.contacts            c   ON c.id            = l.contact_id
  JOIN public.mkt_sequence_actions     a   ON a.enrollment_id = e.id
  LEFT JOIN public.mkt_lead_scores     ls  ON ls.lead_id      = e.lead_id
  WHERE camp.org_id = p_org_id
  GROUP BY e.lead_id, c.first_name, c.last_name, c.company,
           camp.product_key, ls.fit_score, ls.intent_score, ls.engagement_score
  HAVING (
    COUNT(a.id) FILTER (WHERE a.opened_at  IS NOT NULL) +
    COUNT(a.id) FILTER (WHERE a.clicked_at IS NOT NULL) +
    COUNT(a.id) FILTER (WHERE a.replied_at IS NOT NULL) +
    COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL)
  ) > 0
  ORDER BY (
    COALESCE(ls.fit_score,0) + COALESCE(ls.intent_score,0) +
    COALESCE(ls.engagement_score,0) +
    COUNT(a.id) FILTER (WHERE a.opened_at  IS NOT NULL) * 1 +
    COUNT(a.id) FILTER (WHERE a.clicked_at IS NOT NULL) * 3 +
    COUNT(a.id) FILTER (WHERE a.replied_at IS NOT NULL) * 10 +
    COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL
                          AND a.channel = 'whatsapp') * 2
  ) DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_hot_leads(uuid, int) TO authenticated;
