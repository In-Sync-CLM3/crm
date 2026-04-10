-- ============================================================================
-- Product ICP Table + RPCs
-- Stores versioned Ideal Customer Profiles per product.
-- Every evolution inserts a new row — history is never deleted.
-- Current ICP = MAX(version) for a given org + product_key.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mkt_product_icp (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_key         text NOT NULL,

  -- ICP fields
  industries          text[] NOT NULL DEFAULT '{}',
  company_sizes       text[] NOT NULL DEFAULT '{}',
  designations        text[] NOT NULL DEFAULT '{}',
  geographies         text[] NOT NULL DEFAULT '{}',
  languages           text[] NOT NULL DEFAULT '{en}',
  budget_range        jsonb  NOT NULL DEFAULT '{"min_paise": 0, "max_paise": 0, "currency": "INR"}',
  pain_points         text[] NOT NULL DEFAULT '{}',
  aha_moment_days     integer,

  -- Versioning and confidence
  version             integer NOT NULL DEFAULT 1,
  confidence_score    numeric(4,3) NOT NULL DEFAULT 0.300
                        CHECK (confidence_score >= 0 AND confidence_score <= 1),
  -- 0.0–1.0; starts at 0.3 (50-record onboarding sample), grows toward 0.95

  -- Evolution metadata
  last_evolved_at     timestamptz NOT NULL DEFAULT now(),
  evolution_reason    text,
  evolved_by          text NOT NULL DEFAULT 'system',
  -- 'onboarding' | 'optimizer' | 'manual' | 'amit_suggestion'

  -- Audit
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, product_key, version)
);

ALTER TABLE public.mkt_product_icp ENABLE ROW LEVEL SECURITY;

-- Indexes
-- Single composite index covers both (org_id, product_key) and (org_id, product_key, version DESC) queries.
CREATE INDEX IF NOT EXISTS idx_mkt_product_icp_current
  ON public.mkt_product_icp (org_id, product_key, version DESC);

-- updated_at trigger
CREATE TRIGGER update_mkt_product_icp_updated_at
  BEFORE UPDATE ON public.mkt_product_icp
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Service role: full access (edge functions use service role)
CREATE POLICY "Service role has full access to mkt_product_icp"
  ON public.mkt_product_icp FOR ALL TO service_role USING (true);

-- Authenticated: read own org
CREATE POLICY "Users can select mkt_product_icp in their org"
  ON public.mkt_product_icp FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

-- Authenticated: insert own org
CREATE POLICY "Users can insert mkt_product_icp in their org"
  ON public.mkt_product_icp FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

-- Authenticated: update own org (confidence_score manual override only)
CREATE POLICY "Users can update mkt_product_icp in their org"
  ON public.mkt_product_icp FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

-- No DELETE policy — ICP versions are immutable history.


-- ============================================================================
-- RPCs
-- ============================================================================

-- Returns the single current ICP row (highest version) for a product.
CREATE OR REPLACE FUNCTION public.get_current_icp(
  _org_id     uuid,
  _product_key text
)
RETURNS SETOF public.mkt_product_icp
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT *
  FROM   public.mkt_product_icp
  WHERE  org_id      = _org_id
    AND  product_key = _product_key
  ORDER  BY version DESC
  LIMIT  1;
$$;

-- Returns all ICP versions for a product (newest first).
CREATE OR REPLACE FUNCTION public.get_icp_history(
  _org_id     uuid,
  _product_key text
)
RETURNS SETOF public.mkt_product_icp
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT *
  FROM   public.mkt_product_icp
  WHERE  org_id      = _org_id
    AND  product_key = _product_key
  ORDER  BY version DESC;
$$;

-- Returns the current ICP for every product in an org (one row per product).
CREATE OR REPLACE FUNCTION public.get_all_current_icps(_org_id uuid)
RETURNS SETOF public.mkt_product_icp
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (product_key) *
  FROM   public.mkt_product_icp
  WHERE  org_id = _org_id
  ORDER  BY product_key, version DESC;
$$;
