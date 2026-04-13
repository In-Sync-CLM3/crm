-- Phase 3: Convert pure-DB edge functions to RPC
-- Eliminates cold-start latency (~200-500ms) for pure database operations

-- 1. create_import_session: replaces create-import-session edge function
CREATE OR REPLACE FUNCTION create_import_session(
  _table_name text,
  _file_name text,
  _total_records int
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  _org_id uuid;
  _user_id uuid;
  _batch_size int := 5000;
  _total_batches int;
  _result record;
BEGIN
  -- Get the calling user's org
  SELECT p.org_id INTO _org_id
  FROM profiles p
  WHERE p.id = auth.uid();

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  _user_id := auth.uid();
  _total_batches := CEIL(_total_records::numeric / _batch_size);

  INSERT INTO bulk_import_history (
    org_id, user_id, table_name, file_name,
    total_records, total_batches, status
  ) VALUES (
    _org_id, _user_id, _table_name, _file_name,
    _total_records, _total_batches, 'pending'
  )
  RETURNING id INTO _result;

  RETURN json_build_object(
    'importId', _result.id,
    'totalBatches', _total_batches,
    'batchSize', _batch_size
  );
END;
$$;

-- 2. cancel_import: replaces cancel-import edge function
CREATE OR REPLACE FUNCTION cancel_import(_import_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  _org_id uuid;
BEGIN
  SELECT p.org_id INTO _org_id
  FROM profiles p
  WHERE p.id = auth.uid();

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Cancel the import
  UPDATE bulk_import_history
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = _import_id;

  -- Delete staging records
  DELETE FROM import_staging
  WHERE import_id = _import_id;

  RETURN json_build_object('success', true);
END;
$$;

-- 3. get-monthly-actuals already calls get_monthly_actuals_optimized RPC.
-- Frontend will call that RPC directly. No new RPC needed — just delete the edge function wrapper.

-- 4. freeze_monthly_actuals: replaces freeze-monthly-actuals edge function
-- This is complex business logic but pure DB operations.
CREATE OR REPLACE FUNCTION freeze_monthly_actuals(
  _year int DEFAULT NULL,
  _month int DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  _target_year int;
  _target_month int;
  _org record;
  _results json[] := '{}';
  _processed int := 0;
  _period_start date;
  _period_end date;
  _qualified_ids uuid[];
  _proposal_ids uuid[];
  _deal_ids uuid[];
  _invoiced_ids uuid[];
  _received_ids uuid[];
  _revenue_invoiced numeric;
  _revenue_received numeric;
  _existing_id uuid;
  _demo_stage_ids uuid[];
  _proposal_stage_ids uuid[];
  _won_stage_ids uuid[];
BEGIN
  -- Default to previous month if not specified
  _target_year := COALESCE(_year, EXTRACT(YEAR FROM (now() - interval '1 month'))::int);
  _target_month := COALESCE(_month, EXTRACT(MONTH FROM (now() - interval '1 month'))::int);

  _period_start := make_date(_target_year, _target_month, 1);
  _period_end := _period_start + interval '1 month';

  -- Process all orgs
  FOR _org IN SELECT id FROM organizations LOOP
    BEGIN
      -- Get pipeline stage IDs by name pattern
      SELECT array_agg(id) INTO _demo_stage_ids
      FROM pipeline_stages
      WHERE org_id = _org.id AND lower(name) IN ('demo', 'qualified', 'discovery');

      SELECT array_agg(id) INTO _proposal_stage_ids
      FROM pipeline_stages
      WHERE org_id = _org.id AND lower(name) IN ('proposal', 'negotiation');

      SELECT array_agg(id) INTO _won_stage_ids
      FROM pipeline_stages
      WHERE org_id = _org.id AND lower(name) IN ('won', 'closed won', 'closed-won');

      -- Qualified opportunities
      SELECT COALESCE(array_agg(DISTINCT contact_id), '{}')
      INTO _qualified_ids
      FROM pipeline_movement_history
      WHERE org_id = _org.id
        AND to_stage_id = ANY(COALESCE(_demo_stage_ids, '{}'))
        AND moved_at >= _period_start AND moved_at < _period_end;

      -- Proposals
      SELECT COALESCE(array_agg(DISTINCT contact_id), '{}')
      INTO _proposal_ids
      FROM pipeline_movement_history
      WHERE org_id = _org.id
        AND to_stage_id = ANY(COALESCE(_proposal_stage_ids, '{}'))
        AND moved_at >= _period_start AND moved_at < _period_end;

      -- Won deals
      SELECT COALESCE(array_agg(DISTINCT contact_id), '{}')
      INTO _deal_ids
      FROM pipeline_movement_history
      WHERE org_id = _org.id
        AND to_stage_id = ANY(COALESCE(_won_stage_ids, '{}'))
        AND moved_at >= _period_start AND moved_at < _period_end;

      -- Invoiced
      SELECT COALESCE(array_agg(id), '{}'), COALESCE(sum(amount), 0)
      INTO _invoiced_ids, _revenue_invoiced
      FROM client_invoices
      WHERE org_id = _org.id
        AND invoice_date >= _period_start AND invoice_date < _period_end;

      -- Received (paid)
      SELECT COALESCE(array_agg(id), '{}'), COALESCE(sum(amount), 0)
      INTO _received_ids, _revenue_received
      FROM client_invoices
      WHERE org_id = _org.id
        AND status = 'paid'
        AND updated_at >= _period_start AND updated_at < _period_end;

      -- Upsert snapshot
      SELECT id INTO _existing_id
      FROM monthly_actuals_snapshot
      WHERE org_id = _org.id AND year = _target_year AND month = _target_month;

      IF _existing_id IS NOT NULL THEN
        UPDATE monthly_actuals_snapshot SET
          qualified_opps = array_length(_qualified_ids, 1),
          proposals = array_length(_proposal_ids, 1),
          deals_closed = array_length(_deal_ids, 1),
          revenue_invoiced = _revenue_invoiced,
          revenue_received = _revenue_received,
          qualified_contact_ids = _qualified_ids,
          proposal_contact_ids = _proposal_ids,
          deal_contact_ids = _deal_ids,
          invoiced_invoice_ids = _invoiced_ids,
          received_invoice_ids = _received_ids,
          frozen_at = now(),
          updated_at = now()
        WHERE id = _existing_id;
      ELSE
        INSERT INTO monthly_actuals_snapshot (
          org_id, year, month,
          qualified_opps, proposals, deals_closed,
          revenue_invoiced, revenue_received,
          qualified_contact_ids, proposal_contact_ids, deal_contact_ids,
          invoiced_invoice_ids, received_invoice_ids
        ) VALUES (
          _org.id, _target_year, _target_month,
          COALESCE(array_length(_qualified_ids, 1), 0),
          COALESCE(array_length(_proposal_ids, 1), 0),
          COALESCE(array_length(_deal_ids, 1), 0),
          _revenue_invoiced, _revenue_received,
          _qualified_ids, _proposal_ids, _deal_ids,
          _invoiced_ids, _received_ids
        );
      END IF;

      _processed := _processed + 1;
      _results := _results || json_build_object('org_id', _org.id, 'success', true)::json;

    EXCEPTION WHEN OTHERS THEN
      _results := _results || json_build_object('org_id', _org.id, 'success', false, 'error', SQLERRM)::json;
    END;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'year', _target_year,
    'month', _target_month,
    'organizations_processed', _processed,
    'results', to_json(_results)
  );
END;
$$;
