-- ============================================================================
-- Phase 4: RLS Optimisation
-- ============================================================================
-- !! DANGER — DO NOT APPLY !!
--
-- The original version of this migration replaced all org_id RLS checks with
-- `auth.uid() IS NOT NULL`, effectively removing tenant isolation entirely.
--
-- This CRM is MULTI-TENANT (9+ client orgs). Weakening RLS would allow any
-- authenticated user in Org A to read data from Org B.
--
-- The correct RLS optimisation is to cache get_user_org_id() at the session
-- level (e.g. via a SET LOCAL variable in a login trigger), NOT to remove
-- the org_id check. That work belongs in a future migration that has been
-- reviewed against multi-tenancy requirements.
--
-- This file is intentionally a no-op.
-- ============================================================================

SELECT 1; -- intentional no-op
