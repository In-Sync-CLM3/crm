-- Add mkt_native_contact_id to contacts so we can guarantee a native dataset
-- contact is never used by more than one product within the same org.
--
-- The phone/email dedup in mkt-source-leads already handles most cases, but
-- contacts with no phone AND no email slip through — they can appear in
-- multiple product pools.  Tracking the native UUID closes that gap.
--
-- Index on (org_id, mkt_native_contact_id) lets the dedup check run as a
-- fast index scan rather than a seq scan.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS mkt_native_contact_id uuid DEFAULT NULL;

CREATE INDEX IF NOT EXISTS contacts_org_native_id_idx
  ON contacts (org_id, mkt_native_contact_id)
  WHERE mkt_native_contact_id IS NOT NULL;
