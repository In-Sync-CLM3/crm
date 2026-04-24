-- Add per-doc-type default notes to billing_settings, mirroring the existing
-- default_terms / default_proforma_terms / default_credit_note_terms pattern.
-- These seed the Notes field on new billing documents.

ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS default_notes TEXT DEFAULT 'We value your business and trust.',
  ADD COLUMN IF NOT EXISTS default_proforma_notes TEXT,
  ADD COLUMN IF NOT EXISTS default_credit_note_notes TEXT;
