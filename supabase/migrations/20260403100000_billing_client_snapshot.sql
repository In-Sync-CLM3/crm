-- Add client_billing_snapshot JSONB column to billing_documents
-- This stores the client's name, address, and GST details at the time of invoice creation
-- so they persist on the document even if the client's details change later.
ALTER TABLE public.billing_documents
  ADD COLUMN IF NOT EXISTS client_billing_snapshot JSONB;
