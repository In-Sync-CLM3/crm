-- mkt_channel_plan: Master plan table for all channels per product.
-- Tracks planned vs active channels across the full marketing strategy.

CREATE TABLE IF NOT EXISTS public.mkt_channel_plan (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_key         text        NOT NULL,
  channel             text        NOT NULL CHECK (channel IN (
                        'email','whatsapp','calling',
                        'google_ads','meta_ads','linkedin',
                        'blog','social'
                      )),
  planned_start_date  date,
  actual_start_date   date,
  status              text        NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned','active','paused','not_applicable')),
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (org_id, product_key, channel)
);

-- RLS
ALTER TABLE public.mkt_channel_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read channel plan"
  ON public.mkt_channel_plan FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org members can manage channel plan"
  ON public.mkt_channel_plan FOR ALL
  USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

-- Auto-activation trigger: fires when an action is sent/delivered
CREATE OR REPLACE FUNCTION public.auto_activate_channel_plan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product_key text;
  v_org_id      uuid;
BEGIN
  IF NEW.status NOT IN ('sent','delivered') THEN
    RETURN NEW;
  END IF;
  SELECT camp.product_key, camp.org_id
    INTO v_product_key, v_org_id
    FROM public.mkt_sequence_enrollments e
    JOIN public.mkt_campaigns camp ON camp.id = e.campaign_id
   WHERE e.id = NEW.enrollment_id;
  IF v_product_key IS NULL THEN RETURN NEW; END IF;
  UPDATE public.mkt_channel_plan
     SET status            = 'active',
         actual_start_date = COALESCE(actual_start_date, CURRENT_DATE),
         updated_at        = now()
   WHERE org_id      = v_org_id
     AND product_key = v_product_key
     AND channel     = NEW.channel
     AND status      = 'planned';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_activate_channel_plan
  AFTER INSERT OR UPDATE OF status ON public.mkt_sequence_actions
  FOR EACH ROW EXECUTE FUNCTION public.auto_activate_channel_plan();

-- Seed: all existing products × all 8 channels as 'planned'
INSERT INTO public.mkt_channel_plan (org_id, product_key, channel, status)
SELECT p.org_id, p.product_key, c.channel, 'planned'
FROM   public.mkt_products p
CROSS JOIN (VALUES
  ('email'),('whatsapp'),('calling'),
  ('google_ads'),('meta_ads'),('linkedin'),
  ('blog'),('social')
) AS c(channel)
ON CONFLICT (org_id, product_key, channel) DO NOTHING;

-- Auto-detect already-active channels from existing action history
UPDATE public.mkt_channel_plan cp
   SET status            = 'active',
       actual_start_date = sub.first_date,
       updated_at        = now()
  FROM (
    SELECT camp.org_id, camp.product_key, a.channel,
           MIN(a.created_at::date) AS first_date
      FROM public.mkt_campaigns            camp
      JOIN public.mkt_sequence_enrollments e    ON e.campaign_id   = camp.id
      JOIN public.mkt_sequence_actions     a    ON a.enrollment_id = e.id
     WHERE a.status IN ('sent','delivered')
     GROUP BY camp.org_id, camp.product_key, a.channel
  ) sub
 WHERE cp.org_id      = sub.org_id
   AND cp.product_key = sub.product_key
   AND cp.channel     = sub.channel
   AND cp.status      = 'planned';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_channel_plan TO authenticated;
