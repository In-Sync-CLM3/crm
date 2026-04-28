-- Add billing-specific fields to clients so they only need to be entered once.
-- Previously GSTIN / PAN / billing address / state code were captured only on
-- billing_documents.client_billing_snapshot, so each new invoice for the same
-- client started with empty billing fields (the localStorage cache in
-- useBillingClientCache is device-local and didn't help across browsers/users).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS pan TEXT,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS billing_state_code TEXT,
  ADD COLUMN IF NOT EXISTS invoice_company_name TEXT;

-- Backfill from existing invoice snapshots: for each client, take the most
-- recent NON-EMPTY value of each field across all their prior billing
-- documents. This means clients who already have any past invoice with
-- billing details filled in will get those rolled up onto their master
-- record automatically.
WITH ranked AS (
  SELECT
    client_id::uuid AS client_id,
    NULLIF(client_billing_snapshot->>'gstin', '')                AS gstin,
    NULLIF(client_billing_snapshot->>'pan', '')                  AS pan,
    NULLIF(client_billing_snapshot->>'billing_address', '')      AS billing_address,
    NULLIF(client_billing_snapshot->>'billing_state_code', '')   AS billing_state_code,
    NULLIF(client_billing_snapshot->>'invoice_company_name', '') AS invoice_company_name,
    NULLIF(client_billing_snapshot->>'state', '')                AS state,
    NULLIF(client_billing_snapshot->>'city', '')                 AS city,
    NULLIF(client_billing_snapshot->>'pin_code', '')             AS pin_code,
    created_at
  FROM public.billing_documents
  WHERE client_id IS NOT NULL
    AND client_id <> ''
    AND client_billing_snapshot IS NOT NULL
),
backfill AS (
  SELECT
    client_id,
    (array_remove(array_agg(gstin                ORDER BY created_at DESC), NULL))[1] AS gstin,
    (array_remove(array_agg(pan                  ORDER BY created_at DESC), NULL))[1] AS pan,
    (array_remove(array_agg(billing_address      ORDER BY created_at DESC), NULL))[1] AS billing_address,
    (array_remove(array_agg(billing_state_code   ORDER BY created_at DESC), NULL))[1] AS billing_state_code,
    (array_remove(array_agg(invoice_company_name ORDER BY created_at DESC), NULL))[1] AS invoice_company_name,
    (array_remove(array_agg(state                ORDER BY created_at DESC), NULL))[1] AS state,
    (array_remove(array_agg(city                 ORDER BY created_at DESC), NULL))[1] AS city,
    (array_remove(array_agg(pin_code             ORDER BY created_at DESC), NULL))[1] AS pin_code
  FROM ranked
  GROUP BY client_id
)
UPDATE public.clients c
SET
  gstin                = COALESCE(NULLIF(c.gstin, ''),                b.gstin),
  pan                  = COALESCE(NULLIF(c.pan, ''),                  b.pan),
  billing_address      = COALESCE(NULLIF(c.billing_address, ''),      b.billing_address, NULLIF(c.address, '')),
  billing_state_code   = COALESCE(NULLIF(c.billing_state_code, ''),   b.billing_state_code),
  invoice_company_name = COALESCE(NULLIF(c.invoice_company_name, ''), b.invoice_company_name),
  state                = COALESCE(NULLIF(c.state, ''),                b.state),
  city                 = COALESCE(NULLIF(c.city, ''),                 b.city),
  postal_code          = COALESCE(NULLIF(c.postal_code, ''),          b.pin_code)
FROM backfill b
WHERE b.client_id = c.id;
