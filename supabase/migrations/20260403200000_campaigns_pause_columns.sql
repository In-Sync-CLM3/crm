-- Add paused_reason and paused_at columns to mkt_campaigns for breakpoint auto-pause
ALTER TABLE public.mkt_campaigns ADD COLUMN IF NOT EXISTS paused_reason text;
ALTER TABLE public.mkt_campaigns ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE public.mkt_campaigns ADD COLUMN IF NOT EXISTS product_key text;
