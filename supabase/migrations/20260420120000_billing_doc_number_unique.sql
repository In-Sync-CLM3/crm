-- Strict duplicate policy for billing document numbers.
-- One doc_number per org; reinforced at the DB so no code path or manual
-- edit can produce two docs with the same number.

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_documents_org_doc_number
  ON public.billing_documents (org_id, doc_number);
