-- mkt_ga4_traffic: daily GA4 landing page traffic attributed to Arohan campaigns.
-- Synced by mkt-ga4-sync (cron: daily 4 AM UTC).
-- Keyed by product hostname + campaign slug + medium + date.
-- SoT for product mapping: mkt_products.product_url hostname.

CREATE TABLE IF NOT EXISTS public.mkt_ga4_traffic (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_key      text    NOT NULL,   -- from mkt_products.product_key
  hostname         text    NOT NULL,   -- e.g. work.in-sync.co.in
  campaign_slug    text,               -- utm_campaign value from GA4
  medium           text,               -- email | whatsapp | (direct) etc.
  date             date    NOT NULL,
  sessions         integer NOT NULL DEFAULT 0,
  active_users     integer NOT NULL DEFAULT 0,
  engaged_sessions integer NOT NULL DEFAULT 0,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_key, hostname, campaign_slug, medium, date)
);

CREATE INDEX IF NOT EXISTS mkt_ga4_traffic_product_date
  ON public.mkt_ga4_traffic (product_key, date DESC);

CREATE INDEX IF NOT EXISTS mkt_ga4_traffic_campaign
  ON public.mkt_ga4_traffic (campaign_slug, date DESC);

ALTER TABLE public.mkt_ga4_traffic ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read ga4 traffic"
  ON public.mkt_ga4_traffic FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
