-- Billing Documents table
CREATE TABLE IF NOT EXISTS public.billing_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('quotation', 'proforma', 'invoice', 'credit_note')),
  doc_number TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT NOT NULL,
  doc_date DATE NOT NULL,
  due_date DATE,
  financial_year TEXT,
  supply_type TEXT CHECK (supply_type IN ('intra_state', 'inter_state')),
  subtotal NUMERIC NOT NULL DEFAULT 0,
  total_tax NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  balance_due NUMERIC NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled', 'accepted', 'rejected', 'expired', 'issued')),
  notes TEXT,
  terms_and_conditions TEXT,
  original_invoice_id UUID REFERENCES public.billing_documents(id),
  original_invoice_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_documents_org ON public.billing_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_documents_doc_type ON public.billing_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_billing_documents_status ON public.billing_documents(status);

-- Billing Document Items (line items)
CREATE TABLE IF NOT EXISTS public.billing_document_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.billing_documents(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hsn_sac TEXT,
  qty NUMERIC NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'Nos',
  rate NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 18,
  taxable NUMERIC DEFAULT 0,
  cgst NUMERIC DEFAULT 0,
  sgst NUMERIC DEFAULT 0,
  igst NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_items_document ON public.billing_document_items(document_id);

-- Billing Payments
CREATE TABLE IF NOT EXISTS public.billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.billing_documents(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  payment_mode TEXT CHECK (payment_mode IN ('bank_transfer', 'upi', 'cheque', 'cash', 'online')),
  reference_number TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_payments_org ON public.billing_payments(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_document ON public.billing_payments(document_id);

-- Billing Settings (one per org)
CREATE TABLE IF NOT EXISTS public.billing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  company_name TEXT,
  company_gstin TEXT,
  company_pan TEXT,
  company_state TEXT,
  company_state_code TEXT,
  company_address TEXT,
  company_email TEXT,
  company_phone TEXT,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_branch TEXT,
  bank_upi_id TEXT,
  default_terms TEXT DEFAULT '1. Payment is due within 30 days.
2. Subject to local jurisdiction.',
  default_quotation_terms TEXT,
  default_proforma_terms TEXT,
  default_credit_note_terms TEXT,
  default_tax_rate NUMERIC DEFAULT 18,
  default_due_days INTEGER DEFAULT 30,
  default_hsn TEXT DEFAULT '998314',
  invoice_prefix TEXT DEFAULT 'INV',
  quotation_prefix TEXT DEFAULT 'QTN',
  proforma_prefix TEXT DEFAULT 'PI',
  credit_note_prefix TEXT DEFAULT 'CN',
  next_invoice_number INTEGER DEFAULT 1,
  next_quotation_number INTEGER DEFAULT 1,
  next_proforma_number INTEGER DEFAULT 1,
  next_credit_note_number INTEGER DEFAULT 1,
  logo_url TEXT,
  signature_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_settings_org ON public.billing_settings(org_id);

-- Enable RLS on all billing tables
ALTER TABLE public.billing_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for billing_documents
CREATE POLICY "Users can view their org billing documents"
  ON public.billing_documents FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create billing documents in their org"
  ON public.billing_documents FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their org billing documents"
  ON public.billing_documents FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete their org billing documents"
  ON public.billing_documents FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- RLS Policies for billing_document_items (via parent document)
CREATE POLICY "Users can view billing items via document"
  ON public.billing_document_items FOR SELECT
  USING (document_id IN (SELECT id FROM public.billing_documents WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can create billing items via document"
  ON public.billing_document_items FOR INSERT
  WITH CHECK (document_id IN (SELECT id FROM public.billing_documents WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can update billing items via document"
  ON public.billing_document_items FOR UPDATE
  USING (document_id IN (SELECT id FROM public.billing_documents WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can delete billing items via document"
  ON public.billing_document_items FOR DELETE
  USING (document_id IN (SELECT id FROM public.billing_documents WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())));

-- RLS Policies for billing_payments
CREATE POLICY "Users can view their org billing payments"
  ON public.billing_payments FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create billing payments in their org"
  ON public.billing_payments FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their org billing payments"
  ON public.billing_payments FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete their org billing payments"
  ON public.billing_payments FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- RLS Policies for billing_settings
CREATE POLICY "Users can view their org billing settings"
  ON public.billing_settings FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create billing settings for their org"
  ON public.billing_settings FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their org billing settings"
  ON public.billing_settings FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Platform admin policies (can access all orgs)
CREATE POLICY "Platform admins can view all billing documents"
  ON public.billing_documents FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "Platform admins can manage all billing documents"
  ON public.billing_documents FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "Platform admins can view all billing items"
  ON public.billing_document_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "Platform admins can manage all billing items"
  ON public.billing_document_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "Platform admins can view all billing payments"
  ON public.billing_payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "Platform admins can manage all billing payments"
  ON public.billing_payments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "Platform admins can view all billing settings"
  ON public.billing_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "Platform admins can manage all billing settings"
  ON public.billing_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));
