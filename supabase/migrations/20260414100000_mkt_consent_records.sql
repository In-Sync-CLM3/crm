-- Section 20.3: DPDP Compliance — consent records table
CREATE TABLE IF NOT EXISTS public.mkt_consent_records (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid    NOT NULL,
  contact_id        uuid    REFERENCES public.contacts(id) ON DELETE SET NULL,
  email             text,
  phone             text,
  consent_type      text    NOT NULL,
  -- 'marketing_email' | 'marketing_whatsapp' | 'marketing_call'
  consent_given     boolean NOT NULL DEFAULT false,
  consent_method    text    NOT NULL DEFAULT 'explicit',
  -- 'trial_signup_form' | 'import_consent_checkbox' | 'inbound_inquiry' | 'explicit'
  consent_text      text,
  ip_hash           text,   -- SHA-256 hash of IP — never raw IP
  user_agent        text,
  source_url        text,
  given_at          timestamptz,
  withdrawn_at      timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mkt_consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can access consent records"
  ON public.mkt_consent_records
  FOR ALL
  USING (org_id = auth.uid() OR auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_mkt_consent_contact
  ON public.mkt_consent_records(contact_id, consent_type);

CREATE INDEX IF NOT EXISTS idx_mkt_consent_email
  ON public.mkt_consent_records(email, consent_type);

CREATE INDEX IF NOT EXISTS idx_mkt_consent_org
  ON public.mkt_consent_records(org_id, consent_type, consent_given);

-- mkt_erasure_log: permanent audit trail for data erasure requests (DPDP)
CREATE TABLE IF NOT EXISTS public.mkt_erasure_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL,
  email_hash      text        NOT NULL,  -- SHA-256, never raw email
  erased_at       timestamptz NOT NULL DEFAULT now(),
  erased_by       text        NOT NULL DEFAULT 'system',
  tables_cleared  text[]      NOT NULL DEFAULT '{}'
);
-- Append-only: no UPDATE or DELETE allowed
CREATE POLICY "Service role only — erasure log"
  ON public.mkt_erasure_log
  FOR ALL
  USING (auth.role() = 'service_role');
ALTER TABLE public.mkt_erasure_log ENABLE ROW LEVEL SECURITY;
