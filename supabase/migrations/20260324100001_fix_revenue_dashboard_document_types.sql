-- RC2: Expand document_type CHECK constraint to allow proforma and credit_note
-- The frontend types support 4 document types but the DB only allowed 2,
-- causing proforma invoices and credit notes to silently fail on insert.

ALTER TABLE client_invoices DROP CONSTRAINT IF EXISTS client_invoices_document_type_check;
ALTER TABLE client_invoices ADD CONSTRAINT client_invoices_document_type_check
  CHECK (document_type IN ('quotation', 'proforma', 'invoice', 'credit_note'));

-- RC3: Safety-net trigger to auto-populate payment_received_date when status changes to 'paid'
-- The frontend already sets this, but this ensures data consistency for any code path.

CREATE OR REPLACE FUNCTION set_payment_received_date_on_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND (NEW.payment_received_date IS NULL) THEN
    NEW.payment_received_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_payment_received_date ON client_invoices;
CREATE TRIGGER trg_set_payment_received_date
  BEFORE INSERT OR UPDATE ON client_invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_payment_received_date_on_paid();

-- Backfill: fix any existing paid invoices that are missing payment_received_date
UPDATE client_invoices
SET payment_received_date = invoice_date
WHERE status = 'paid' AND payment_received_date IS NULL;
