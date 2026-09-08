-- Backend tracker for Amit's personal job-application matching engine.
-- Single-user, not multi-tenant -- no org_id, no RLS beyond service-role access.
-- Research-depth is the point: one row per JD actually researched, not a bulk queue.
CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,               -- mercor, micro1, linkedin, naukri, indeed, wellfound, handshake
  company text,
  role_title text NOT NULL,
  jd_url text,
  jd_text text NOT NULL,
  pay_range text,
  posted_date date,
  posted_by text,
  work_arrangement text,                -- remote / hybrid / onsite
  location_scope text,                  -- worldwide_remote / named_countries / gurgaon / other
  company_profile_notes text,
  hiring_trend_notes text,
  verdict text CHECK (verdict IN ('high_match', 'reject')),
  confidence text CHECK (confidence IN ('high', 'medium', 'low')),
  match_reasoning text,
  matched_requirements jsonb NOT NULL DEFAULT '[]',
  missing_requirements jsonb NOT NULL DEFAULT '[]',
  quoted_compensation text,
  -- 'error' is a DISTINCT terminal state from 'reject' -- a failed lookup must
  -- never masquerade as "evaluated and rejected". See feedback memory on not
  -- swallowing per-item failures behind a blanket success.
  status text NOT NULL DEFAULT 'evaluated' CHECK (status IN ('evaluated', 'applied', 'skipped', 'error')),
  error_detail text,
  applied_by text CHECK (applied_by IN ('amit', 'automation')),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_applications_platform_date ON job_applications (platform, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON job_applications (status);
CREATE INDEX IF NOT EXISTS idx_job_applications_created_at ON job_applications (created_at DESC);

ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
-- Service-role only (called from the edge function and by Amit via Claude/CLI) -- no anon/authenticated policy needed.

-- One row per digest send attempt -- lets Health Sentinel check "did the
-- digest actually fire today", the same outcome-based question the BD
-- pipeline check asks, not just "did the function return 200".
CREATE TABLE IF NOT EXISTS job_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'error', 'skipped_no_activity')),
  evaluated_count integer NOT NULL DEFAULT 0,
  applied_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_digest_runs_date ON job_digest_runs (run_date DESC);

ALTER TABLE job_digest_runs ENABLE ROW LEVEL SECURITY;
