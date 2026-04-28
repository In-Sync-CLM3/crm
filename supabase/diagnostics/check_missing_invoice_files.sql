-- Diagnostic: reconcile client_invoices.file_url / client_documents.file_url
-- against actual objects in the `client-documents` storage bucket.
--
-- Run these in the Supabase SQL Editor. They are read-only.

-- =============================================================
-- 1) DB rows with file_url that point at MISSING storage objects
-- =============================================================
WITH invoice_rows AS (
  SELECT
    'client_invoices'::text                                         AS source_table,
    ci.id                                                           AS row_id,
    ci.invoice_number                                               AS doc_number,
    ci.file_url,
    regexp_replace(ci.file_url, '^.*/client-documents/', '')        AS storage_path
  FROM public.client_invoices ci
  WHERE ci.file_url IS NOT NULL
  UNION ALL
  SELECT
    'client_documents'::text,
    cd.id,
    cd.document_name,
    cd.file_url,
    regexp_replace(cd.file_url, '^.*/client-documents/', '')
  FROM public.client_documents cd
  WHERE cd.file_url IS NOT NULL
)
SELECT
  ir.source_table,
  ir.row_id,
  ir.doc_number,
  ir.storage_path,
  ir.file_url
FROM invoice_rows ir
LEFT JOIN storage.objects so
  ON so.bucket_id = 'client-documents'
 AND so.name      = ir.storage_path
WHERE so.name IS NULL
ORDER BY ir.source_table, ir.doc_number;

-- =============================================================
-- 2) Storage objects in client-documents that NO db row references
--    (potential leftovers — the file is there but the link was lost)
-- =============================================================
SELECT
  so.name                              AS storage_path,
  so.created_at,
  (so.metadata->>'size')::bigint       AS size_bytes
FROM storage.objects so
WHERE so.bucket_id = 'client-documents'
  AND NOT EXISTS (
    SELECT 1 FROM public.client_invoices ci
    WHERE ci.file_url IS NOT NULL
      AND regexp_replace(ci.file_url, '^.*/client-documents/', '') = so.name
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.client_documents cd
    WHERE cd.file_url IS NOT NULL
      AND regexp_replace(cd.file_url, '^.*/client-documents/', '') = so.name
  )
ORDER BY so.created_at DESC;

-- =============================================================
-- 3) Try to MATCH each missing-DB row to an orphan storage object
--    by the trailing filename (timestamp + extension). If a match
--    appears here, the file IS in storage — just at a different path —
--    and the file_url just needs to be updated to point at it.
-- =============================================================
WITH missing AS (
  SELECT
    'client_invoices'::text                                       AS source_table,
    ci.id                                                         AS row_id,
    ci.invoice_number                                             AS doc_number,
    ci.file_url,
    regexp_replace(ci.file_url, '^.*/client-documents/', '')      AS expected_path,
    regexp_replace(ci.file_url, '^.*/', '')                       AS expected_filename
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
    regexp_replace(cd.file_url, '^.*/', '')
  FROM public.client_documents cd
  WHERE cd.file_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects so
      WHERE so.bucket_id = 'client-documents'
        AND so.name = regexp_replace(cd.file_url, '^.*/client-documents/', '')
    )
)
SELECT
  m.source_table,
  m.row_id,
  m.doc_number,
  m.expected_path,
  so.name        AS possible_match_in_storage,
  so.created_at  AS object_created_at
FROM missing m
LEFT JOIN storage.objects so
  ON so.bucket_id = 'client-documents'
 AND so.name LIKE '%' || m.expected_filename
ORDER BY m.source_table, m.doc_number;

-- =============================================================
-- 4) Summary counts
-- =============================================================
SELECT
  (SELECT COUNT(*) FROM public.client_invoices  WHERE file_url IS NOT NULL) AS invoices_with_url,
  (SELECT COUNT(*) FROM public.client_documents WHERE file_url IS NOT NULL) AS documents_with_url,
  (SELECT COUNT(*) FROM storage.objects WHERE bucket_id = 'client-documents') AS objects_in_bucket;
