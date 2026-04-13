-- Re-point all foreign keys from mkt_leads(id) → contacts(id)
-- Root cause: leads now live in contacts table, but legacy FKs still reference mkt_leads.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      tc.table_name,
      tc.constraint_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema = rc.constraint_schema
    JOIN information_schema.table_constraints tc2
      ON rc.unique_constraint_name = tc2.constraint_name
      AND rc.unique_constraint_schema = tc2.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc2.table_name = 'mkt_leads'
      AND tc.table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES contacts(id) ON DELETE CASCADE',
      r.table_name, r.constraint_name, r.column_name);
    RAISE NOTICE 'Re-pointed FK %.% → contacts(id)', r.table_name, r.constraint_name;
  END LOOP;
END $$;

-- Also ensure mkt_unsubscribes.lead_id FK (may use contacts directly already)
ALTER TABLE mkt_unsubscribes DROP CONSTRAINT IF EXISTS mkt_unsubscribes_lead_id_fkey;
ALTER TABLE mkt_unsubscribes ADD CONSTRAINT mkt_unsubscribes_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES contacts(id) ON DELETE CASCADE;
