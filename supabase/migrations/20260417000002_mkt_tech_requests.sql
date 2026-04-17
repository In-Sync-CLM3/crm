CREATE TABLE IF NOT EXISTS public.mkt_tech_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL,
  priority      text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'dismissed')),
  context       jsonb,
  thread_id     text,
  requested_by  text NOT NULL DEFAULT 'arohan',
  implemented_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_tech_requests_org_status ON public.mkt_tech_requests(org_id, status);

ALTER TABLE public.mkt_tech_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_access" ON public.mkt_tech_requests
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()));

CREATE POLICY "service_role_full" ON public.mkt_tech_requests
  TO service_role USING (true) WITH CHECK (true);
