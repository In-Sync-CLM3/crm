-- Records of Claude checking whether a local browser-automation profile
-- (LinkedIn, Mercor, Micro1, etc) is still signed in. These sessions live on
-- Amit's own PC via Playwright -- Health Sentinel (cloud) cannot test them
-- directly, so this table is the only way a login failure becomes visible
-- to the cloud-side monitoring/escalation chain.
CREATE TABLE IF NOT EXISTS platform_session_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  logged_in boolean NOT NULL,
  notes text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_session_checks_platform_time ON platform_session_checks (platform, checked_at DESC);

ALTER TABLE platform_session_checks ENABLE ROW LEVEL SECURITY;
