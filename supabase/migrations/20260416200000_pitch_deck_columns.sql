-- Add pitch deck storage columns to mkt_products.
-- pitch_deck_html      : Claude-generated HTML page served by mkt-pitch-deck function
-- pitch_deck_built_at  : timestamp of last generation (used for cache-control header)

ALTER TABLE mkt_products
  ADD COLUMN IF NOT EXISTS pitch_deck_html      text,
  ADD COLUMN IF NOT EXISTS pitch_deck_built_at  timestamptz;
