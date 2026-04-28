-- =============================================================================
-- Restore client_invoices / client_documents file_urls that point at missing
-- storage objects, by matching the trailing filename to an existing object in
-- the `client-documents` bucket.
--
-- USAGE:
--   1. Run STEP 1 (dry run) and review the output. Each row shows the row
--      whose file_url is broken, and the storage path we'd point it to.
--   2. If the matches look right, run STEP 2 (transactional apply). Review
--      the RETURNING rows, then COMMIT or ROLLBACK.
--
-- Both scripts are restartable — re-running them only acts on rows still
-- broken.
-- =============================================================================


-- =============================================================================
-- STEP 1 -- DRY RUN: show what would be restored, do not modify anything.
-- =============================================================================
WITH broken_rows AS (
  SELECT
    'client_invoices'::text                                       AS source_table,
    ci.id                                                         AS row_id,
    ci.invoice_number                                             AS doc_label,
    ci.file_url                                                   AS old_url,
    regexp_replace(ci.file_url, '^.*/client-documents/', '')      AS expected_path,
    regexp_replace(ci.file_url, '^.*/', '')                       AS expected_filename,
    -- everything before /client-documents/<path>: the public-URL prefix
    regexp_replace(ci.file_url, '/client-documents/.*$', '/client-documents/') AS url_prefix
  FROM public.client_invoices ci
  WHERE ci.file_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects so
      WHERE so.bucket_id = 'client-documents'
        AND so.name = regexp_replace(ci.file_url, '^.*/client-documents/', '')
    )
  UNION ALL
  SELECT
    'client_documents'::text,
    cd.id,
    cd.document_name,
    cd.file_url,
    regexp_replace(cd.file_url, '^.*/client-documents/', ''),
    regexp_replace(cd.file_url, '^.*/', ''),
    regexp_replace(cd.file_url, '/client-documents/.*$', '/client-documents/')
  FROM public.client_documents cd
  WHERE cd.file_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects so
      WHERE so.bucket_id = 'client-documents'
        AND so.name = regexp_replace(cd.file_url, '^.*/client-documents/', '')
    )
),
candidates AS (
  -- For each broken row, find ALL storage objects whose path ends in the
  -- same filename. Some rows might match multiple; we pick the most-recent.
  SELECT
    br.*,
    so.name        AS candidate_path,
    so.created_at  AS candidate_created_at,
    ROW_NUMBER() OVER (
      PARTITION BY br.source_table, br.row_id
      ORDER BY so.created_at DESC NULLS LAST
    ) AS rn
  FROM broken_rows br
  JOIN storage.objects so
    ON so.bucket_id = 'client-documents'
   AND so.name LIKE '%' || br.expected_filename
)
SELECT
  source_table,
  row_id,
  doc_label,
  old_url,
  url_prefix || candidate_path AS proposed_new_url,
  candidate_path,
  candidate_created_at
FROM candidates
WHERE rn = 1
ORDER BY source_table, doc_label;


-- =============================================================================
-- STEP 2 -- APPLY: actually update the file_urls inside a transaction.
--
-- Run the whole BEGIN..COMMIT block. Inspect the RETURNING output. If it looks
-- right, the COMMIT at the end will persist the changes; if anything looks
-- wrong, replace the trailing COMMIT with ROLLBACK and re-run.
-- =============================================================================

BEGIN;

WITH broken_invoices AS (
  SELECT
    ci.id,
    ci.file_url                                                   AS old_url,
    regexp_replace(ci.file_url, '^.*/', '')                       AS expected_filename,
    regexp_replace(ci.file_url, '/client-documents/.*$', '/client-documents/') AS url_prefix
  FROM public.client_invoices ci
  WHERE ci.file_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects so
      WHERE so.bucket_id = 'client-documents'
        AND so.name = regexp_replace(ci.file_url, '^.*/client-documents/', '')
    )
),
matches_invoices AS (
  SELECT DISTINCT ON (bi.id)
    bi.id,
    bi.old_url,
    bi.url_prefix || so.name AS new_url
  FROM broken_invoices bi
  JOIN storage.objects so
    ON so.bucket_id = 'client-documents'
   AND so.name LIKE '%' || bi.expected_filename
  ORDER BY bi.id, so.created_at DESC NULLS LAST
)
UPDATE public.client_invoices ci
SET file_url   = m.new_url,
    updated_at = now()
FROM matches_invoices m
WHERE ci.id = m.id
RETURNING ci.id, ci.invoice_number, m.old_url, ci.file_url AS new_url;


WITH broken_documents AS (
  SELECT
    cd.id,
    cd.file_url                                                   AS old_url,
    regexp_replace(cd.file_url, '^.*/', '')                       AS expected_filename,
    regexp_replace(cd.file_url, '/client-documents/.*$', '/client-documents/') AS url_prefix
  FROM public.client_documents cd
  WHERE cd.file_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects so
      WHERE so.bucket_id = 'client-documents'
        AND so.name = regexp_replace(cd.file_url, '^.*/client-documents/', '')
    )
),
matches_documents AS (
  SELECT DISTINCT ON (bd.id)
    bd.id,
    bd.old_url,
    bd.url_prefix || so.name AS new_url
  FROM broken_documents bd
  JOIN storage.objects so
    ON so.bucket_id = 'client-documents'
   AND so.name LIKE '%' || bd.expected_filename
  ORDER BY bd.id, so.created_at DESC NULLS LAST
)
UPDATE public.client_documents cd
SET file_url   = m.new_url,
    updated_at = now()
FROM matches_documents m
WHERE cd.id = m.id
RETURNING cd.id, cd.document_name, m.old_url, cd.file_url AS new_url;

COMMIT;
-- If the RETURNING rows above look wrong, replace COMMIT with:
-- ROLLBACK;
