-- Prevent duplicate document numbers within an organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_documents_org_doc_number
  ON public.billing_documents (org_id, doc_number);
