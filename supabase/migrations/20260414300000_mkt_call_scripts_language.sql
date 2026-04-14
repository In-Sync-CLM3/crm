-- Section 20.4: Add language support to call scripts and contacts
ALTER TABLE public.mkt_call_scripts
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';

-- contacts: preferred_language for Vapi language routing
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en';

-- Drop old unique constraint if it exists, recreate with language
DO $$
BEGIN
  -- Drop any existing unique index that doesn't include language
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'mkt_call_scripts'
      AND indexname = 'mkt_call_scripts_product_key_call_type_key'
  ) THEN
    DROP INDEX mkt_call_scripts_product_key_call_type_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS mkt_call_scripts_product_call_lang_unique
  ON public.mkt_call_scripts(org_id, product_key, call_type, language)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_contacts_preferred_language
  ON public.contacts(preferred_language)
  WHERE preferred_language != 'en';
