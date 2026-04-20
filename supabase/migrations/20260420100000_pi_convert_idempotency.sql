-- Track which Proforma Invoice a Tax Invoice was converted from,
-- and enforce one-Tax-Invoice-per-PI at the DB level so repeated
-- clicks on "Convert to Tax Invoice" cannot produce duplicate drafts.

ALTER TABLE public.billing_documents
  ADD COLUMN IF NOT EXISTS converted_from_id uuid
  REFERENCES public.billing_documents(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_documents_converted_from_unique
  ON public.billing_documents (converted_from_id)
  WHERE converted_from_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_documents_converted_from
  ON public.billing_documents (converted_from_id);
