-- Add git_repo_url to mkt_products so Arohan can crawl the repo README
-- during ICP inference. Optional field — NULL means not provided.
ALTER TABLE mkt_products
  ADD COLUMN IF NOT EXISTS git_repo_url text;
