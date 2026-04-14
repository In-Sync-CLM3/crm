-- Section 20.1 + 20.7: Add pricing, pitch deck, and URL columns to mkt_products
ALTER TABLE public.mkt_products
  ADD COLUMN IF NOT EXISTS product_url                      text,
  ADD COLUMN IF NOT EXISTS payment_url                      text,
  ADD COLUMN IF NOT EXISTS pricing_page_url                 text,
  ADD COLUMN IF NOT EXISTS icp_hints                        jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS price_enterprise_monthly_paise   integer,
  ADD COLUMN IF NOT EXISTS price_annual_discount_pct        integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pitch_deck_html                  text,
  ADD COLUMN IF NOT EXISTS pitch_deck_built_at              timestamptz,
  ADD COLUMN IF NOT EXISTS schema_drift_detected            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS schema_drift_details             jsonb,
  ADD COLUMN IF NOT EXISTS last_schema_validated_at         timestamptz;
