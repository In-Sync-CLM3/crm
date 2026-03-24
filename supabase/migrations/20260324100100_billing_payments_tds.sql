-- Add TDS column to billing_payments
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS tds_amount NUMERIC DEFAULT 0;
