-- Addition 1: Add Vapi assistant columns to mkt_call_scripts
-- Each call script row gets its own Vapi assistant, created at product onboarding time.

ALTER TABLE public.mkt_call_scripts
  ADD COLUMN IF NOT EXISTS vapi_assistant_id text,
  ADD COLUMN IF NOT EXISTS vapi_assistant_created_at timestamptz;

COMMENT ON COLUMN public.mkt_call_scripts.vapi_assistant_id
  IS 'Vapi assistant ID created during product onboarding — one per script';
COMMENT ON COLUMN public.mkt_call_scripts.vapi_assistant_created_at
  IS 'Timestamp when the Vapi assistant was created via the API';
