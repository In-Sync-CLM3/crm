-- ============================================================================
-- Arohan Conversation History
-- Stores every message between Amit and Arohan.
-- Messages in the same chat session share a thread_id (UUID set by frontend).
-- Amit messages flagged as suggestions are tracked separately for follow-up.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mkt_arohan_conversations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Thread grouping: all messages in one chat session share a thread_id.
  -- Frontend generates a new UUID per session via crypto.randomUUID().
  thread_id             uuid NOT NULL,

  role                  text NOT NULL CHECK (role IN ('amit', 'arohan')),
  message               text NOT NULL,

  -- Context snapshot fed to Claude when Arohan generated this response.
  -- Only populated on 'arohan' rows.
  context_snapshot      jsonb,

  -- Actions Arohan triggered as a result of this exchange.
  -- e.g. [{"type": "icp_update", "product_key": "xyz", "version": 3}]
  actions_triggered     jsonb NOT NULL DEFAULT '[]',

  -- Suggestion tracking (only relevant on 'amit' rows)
  is_suggestion         boolean NOT NULL DEFAULT false,
  -- Structured extract of the suggestion for downstream use.
  -- e.g. {"type": "icp_field", "product_key": "xyz", "field": "industries", "value": ["Finance"]}
  suggestion_payload    jsonb,
  suggestion_applied    boolean NOT NULL DEFAULT false,
  suggestion_applied_at timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mkt_arohan_conversations ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mkt_arohan_conv_thread
  ON public.mkt_arohan_conversations (org_id, thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_mkt_arohan_conv_recent
  ON public.mkt_arohan_conversations (org_id, created_at DESC);

-- Fast lookup for pending (unapplied) suggestions
CREATE INDEX IF NOT EXISTS idx_mkt_arohan_conv_pending_suggestions
  ON public.mkt_arohan_conversations (org_id, is_suggestion, suggestion_applied)
  WHERE is_suggestion = true AND suggestion_applied = false;


-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Service role: full access
CREATE POLICY "Service role has full access to mkt_arohan_conversations"
  ON public.mkt_arohan_conversations FOR ALL TO service_role USING (true);

-- Authenticated: read own org
CREATE POLICY "Users can select mkt_arohan_conversations in their org"
  ON public.mkt_arohan_conversations FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

-- Authenticated: insert own org (frontend inserts Amit's message before calling edge fn)
CREATE POLICY "Users can insert mkt_arohan_conversations in their org"
  ON public.mkt_arohan_conversations FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

-- Authenticated: update own org (for marking suggestion_applied from UI)
CREATE POLICY "Users can update mkt_arohan_conversations in their org"
  ON public.mkt_arohan_conversations FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));
