-- mkt_click_events: raw click log for all channels (email, whatsapp).
-- One row per click attempt. mkt_sequence_actions.clicked_at remains the
-- first-touch timestamp (existing behaviour). This table gives full per-click
-- fidelity for attribution, bot auditing, and dedup analysis.

CREATE TABLE IF NOT EXISTS public.mkt_click_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_id    uuid        REFERENCES public.mkt_sequence_actions(id) ON DELETE SET NULL,
  contact_id   uuid        REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel      text        NOT NULL DEFAULT 'email',   -- email | whatsapp
  url          text,
  clicked_at   timestamptz NOT NULL DEFAULT now(),
  user_agent   text,
  ip_hash      text,       -- SHA-256 of client IP — never store raw IP
  is_bot       boolean     NOT NULL DEFAULT false,
  bot_reason   text,       -- timing_heuristic | ua_match | null
  is_duplicate boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS mkt_click_events_action_id  ON public.mkt_click_events(action_id);
CREATE INDEX IF NOT EXISTS mkt_click_events_contact_id ON public.mkt_click_events(contact_id);
CREATE INDEX IF NOT EXISTS mkt_click_events_clicked_at ON public.mkt_click_events(clicked_at DESC);

ALTER TABLE public.mkt_click_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read click events"
  ON public.mkt_click_events FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );
