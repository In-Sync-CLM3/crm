-- =============================================================================
-- Fix: "Document number 'PI-2627-0005' already exists" when no such PI is
-- visible in the Proforma Invoices list.
--
-- ROOT CAUSE
-- ----------
-- src/components/Billing/BillingDocumentList.tsx:28 filters the Proforma tab
-- client-side with `documents.filter(d => d.doc_type === "proforma")`. The
-- duplicate-check query at src/hooks/useBillingData.ts:287-298, by contrast,
-- only matches on `(org_id, doc_number)` -- with NO doc_type filter -- because
-- billing_documents has a unique constraint on (org_id, doc_number) that is
-- shared across all doc_types (proforma / invoice / credit_note). That's
-- intentional: you can't have a PI and an Invoice with the same number.
--
-- Therefore: a row with doc_number = 'PI-2627-0005' exists in this org with
-- doc_type != 'proforma' (most likely 'invoice', less likely 'credit_note').
-- It stays hidden on the Proforma tab but still trips the duplicate guard
-- when the auto-suggested next number for a new PI is 0005. A separate
-- possibility is a stray proforma row whose local state was never cleared
-- by the UI but is still in the table.
--
-- USAGE
-- -----
--   1. Run STEP 1 to locate the row and confirm its doc_type.
--   2. Pick ONE of STEP 2A / 2B / 2C based on what STEP 1 returns:
--        2A -- the row is junk: delete it.
--        2B -- the row is a real document that was mis-numbered: rename it
--              to its correct prefix (INV or CN) and slot.
--        2C -- you accept the row and just want to skip 0005 for the new PI:
--              bump billing_settings.next_proforma_number past it.
--   3. STEP 3 verifies the resulting state -- run after committing 2A/2B/2C.
-- =============================================================================


-- =============================================================================
-- STEP 1 -- LOCATE the row holding 'PI-2627-0005'.
-- =============================================================================
-- Replace the org_id with the org you're operating as if you have multiple.
-- If you only have one org, the inner `org_id IN (...)` matches all your orgs.

SELECT
  d.id,
  d.org_id,
  d.doc_type,
  d.doc_number,
  d.status,
  d.doc_date,
  d.client_name,
  d.total_amount,
  d.balance_due,
  d.created_at,
  d.updated_at,
  d.converted_from_id,
  d.original_invoice_id,
  d.original_invoice_number,
  (SELECT COUNT(*) FROM public.billing_document_items i WHERE i.document_id = d.id) AS item_count,
  (SELECT COUNT(*) FROM public.billing_payments p WHERE p.document_id = d.id)       AS payment_count
FROM public.billing_documents d
WHERE d.doc_number = 'PI-2627-0005';

-- Also show the current proforma counter and neighbours, so you can see why
-- the UI suggested 0005 and what the next safe slot would be.
SELECT
  bs.org_id,
  bs.proforma_prefix,
  bs.next_proforma_number,
  bs.invoice_prefix,
  bs.next_invoice_number,
  bs.credit_note_prefix,
  bs.next_credit_note_number
FROM public.billing_settings bs
WHERE bs.org_id IN (
  SELECT org_id FROM public.billing_documents WHERE doc_number = 'PI-2627-0005'
);

SELECT
  doc_type,
  doc_number,
  status,
  doc_date,
  client_name,
  total_amount
FROM public.billing_documents
WHERE org_id IN (
  SELECT org_id FROM public.billing_documents WHERE doc_number = 'PI-2627-0005'
)
  AND doc_number LIKE 'PI-2627-%'
ORDER BY doc_number;


-- =============================================================================
-- STEP 2A -- DELETE the phantom row (use only if STEP 1 shows it's junk:
--            no payments, no items, status = 'draft', no converted_from_id,
--            and the user does not recognise it).
--
-- billing_document_items and billing_payments cascade-delete via FK -- no
-- separate cleanup needed.
-- =============================================================================
BEGIN;

DELETE FROM public.billing_documents
WHERE doc_number = 'PI-2627-0005'
RETURNING id, doc_type, doc_number, status, total_amount;

-- Reconcile next_proforma_number to max(numeric suffix among remaining
-- proforma rows in the same FY) + 1, the same logic deleteDocument() uses
-- in src/hooks/useBillingData.ts:415-437. This makes the next "Create PI"
-- click suggest the correct slot.
WITH ctx AS (
  SELECT bs.id AS settings_id, bs.org_id
  FROM public.billing_settings bs
  WHERE bs.org_id IN (
    SELECT DISTINCT org_id FROM public.billing_documents
    WHERE doc_number LIKE 'PI-2627-%'
  )
),
maxnum AS (
  SELECT
    ctx.settings_id,
    COALESCE(MAX(
      CASE
        WHEN d.doc_number ~ '-(\d+)$'
        THEN (regexp_match(d.doc_number, '-(\d+)$'))[1]::int
        ELSE 0
      END
    ), 0) AS max_suffix
  FROM ctx
  LEFT JOIN public.billing_documents d
    ON d.org_id = ctx.org_id
   AND d.doc_type = 'proforma'
   AND d.doc_number LIKE 'PI-2627-%'
  GROUP BY ctx.settings_id
)
UPDATE public.billing_settings bs
SET next_proforma_number = m.max_suffix + 1,
    updated_at = now()
FROM maxnum m
WHERE bs.id = m.settings_id
RETURNING bs.org_id, bs.next_proforma_number;

-- COMMIT;   -- uncomment to apply
-- ROLLBACK; -- uncomment to discard


-- =============================================================================
-- STEP 2B -- RENAME the mis-numbered row to its correct prefix.
--            Use this if STEP 1 shows the row is a real INVOICE or CREDIT NOTE
--            that was somehow saved with the 'PI-' prefix.
--
-- This block is fully self-determining: it reads the row's actual doc_type,
-- picks the right prefix (INV for invoice, CN for credit_note), finds the
-- next free slot in that prefix series for the same org+FY (FY = "2627"
-- segment from the existing PI number), bumps the matching billing_settings
-- counter past it, and renames in one transaction.
--
-- Refuses to run if doc_type is 'proforma' (use STEP 2A or 2C instead).
-- =============================================================================
BEGIN;

WITH target AS (
  SELECT id, org_id, doc_type
  FROM public.billing_documents
  WHERE doc_number = 'PI-2627-0005'
),
guard AS (
  -- Hard-stop if the row is itself a proforma -- renaming a proforma to INV/CN
  -- would be data corruption. The /0 forces an error.
  SELECT
    CASE WHEN doc_type = 'proforma'
         THEN 1/0
         ELSE 1
    END AS ok
  FROM target
),
plan AS (
  SELECT
    t.id,
    t.org_id,
    t.doc_type,
    CASE t.doc_type
      WHEN 'invoice'     THEN COALESCE(bs.invoice_prefix,     'INV')
      WHEN 'credit_note' THEN COALESCE(bs.credit_note_prefix, 'CN')
    END AS prefix,
    bs.id AS settings_id
  FROM target t
  JOIN public.billing_settings bs ON bs.org_id = t.org_id
  CROSS JOIN guard
),
maxnum AS (
  SELECT
    p.id,
    p.org_id,
    p.doc_type,
    p.prefix,
    p.settings_id,
    COALESCE(MAX(
      (regexp_match(d.doc_number, '-(\d+)$'))[1]::int
    ), 0) AS max_suffix
  FROM plan p
  LEFT JOIN public.billing_documents d
    ON d.org_id = p.org_id
   AND d.doc_type = p.doc_type
   AND d.doc_number LIKE p.prefix || '-2627-%'
   AND d.doc_number ~ '-(\d+)$'
   AND d.id <> p.id  -- exclude the row being renamed
  GROUP BY p.id, p.org_id, p.doc_type, p.prefix, p.settings_id
),
renamed AS (
  UPDATE public.billing_documents d
  SET doc_number = m.prefix || '-2627-' || lpad((m.max_suffix + 1)::text, 4, '0'),
      updated_at = now()
  FROM maxnum m
  WHERE d.id = m.id
  RETURNING d.id, d.org_id, d.doc_type, d.doc_number
)
-- Bump the matching counter past the slot we just consumed so the next
-- "Create Invoice" / "Create Credit Note" click suggests the right number.
UPDATE public.billing_settings bs
SET
  next_invoice_number = CASE
    WHEN r.doc_type = 'invoice'
     AND bs.next_invoice_number <= (regexp_match(r.doc_number, '-(\d+)$'))[1]::int
    THEN (regexp_match(r.doc_number, '-(\d+)$'))[1]::int + 1
    ELSE bs.next_invoice_number
  END,
  next_credit_note_number = CASE
    WHEN r.doc_type = 'credit_note'
     AND bs.next_credit_note_number <= (regexp_match(r.doc_number, '-(\d+)$'))[1]::int
    THEN (regexp_match(r.doc_number, '-(\d+)$'))[1]::int + 1
    ELSE bs.next_credit_note_number
  END,
  updated_at = now()
FROM renamed r
WHERE bs.org_id = r.org_id
RETURNING bs.org_id, bs.next_invoice_number, bs.next_credit_note_number;

-- After the rename, the PI series for this FY ends at 0004, so the next PI
-- should be 0005. Reconcile next_proforma_number to that.
WITH ctx AS (
  SELECT bs.id AS settings_id, bs.org_id
  FROM public.billing_settings bs
  WHERE bs.org_id IN (
    SELECT DISTINCT org_id FROM public.billing_documents
    WHERE doc_number LIKE 'PI-2627-%'
  )
),
maxpi AS (
  SELECT
    ctx.settings_id,
    COALESCE(MAX(
      (regexp_match(d.doc_number, '-(\d+)$'))[1]::int
    ), 0) AS max_suffix
  FROM ctx
  LEFT JOIN public.billing_documents d
    ON d.org_id = ctx.org_id
   AND d.doc_type = 'proforma'
   AND d.doc_number LIKE 'PI-2627-%'
   AND d.doc_number ~ '-(\d+)$'
  GROUP BY ctx.settings_id
)
UPDATE public.billing_settings bs
SET next_proforma_number = m.max_suffix + 1,
    updated_at = now()
FROM maxpi m
WHERE bs.id = m.settings_id
RETURNING bs.org_id, bs.next_proforma_number;

-- COMMIT;   -- uncomment to apply
-- ROLLBACK; -- uncomment to discard


-- =============================================================================
-- STEP 2C -- SKIP slot 0005 for the next new PI.
--            Use this if you want to keep the existing row exactly as-is
--            (it's a legitimate document with that number) and simply have
--            the next PI take 0006 or higher.
-- =============================================================================
BEGIN;

UPDATE public.billing_settings
SET next_proforma_number = 6,  -- or whatever slot is actually free
    updated_at = now()
WHERE org_id IN (
  SELECT org_id FROM public.billing_documents WHERE doc_number = 'PI-2627-0005'
)
RETURNING org_id, next_proforma_number;

-- COMMIT;
-- ROLLBACK;


-- =============================================================================
-- STEP 3 -- VERIFY (run after any of 2A / 2B / 2C committed).
-- =============================================================================
SELECT
  doc_type,
  doc_number,
  status,
  client_name
FROM public.billing_documents
WHERE org_id IN (
  SELECT id FROM public.organizations  -- adjust if your org table differs
)
  AND (doc_number LIKE 'PI-2627-%' OR doc_number LIKE 'INV-2627-%')
ORDER BY doc_type, doc_number;

SELECT org_id, next_proforma_number, next_invoice_number, next_credit_note_number
FROM public.billing_settings;
