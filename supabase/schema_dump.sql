--
-- PostgreSQL database dump
--

\restrict hLbRlLZLVqBkL7ja8FSb4DbemiJwKjJeriH3pKg7tAPLy97GX661POEPwE1itrh

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'super_admin',
    'admin',
    'sales_manager',
    'sales_agent',
    'support_manager',
    'support_agent',
    'analyst'
);


--
-- Name: import_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.import_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'partial',
    'cancelled',
    'reverted'
);


--
-- Name: aggregate_automation_performance_daily(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aggregate_automation_performance_daily(_date date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO automation_performance_daily (
    org_id,
    rule_id,
    report_date,
    total_triggered,
    total_sent,
    total_failed,
    total_opened,
    total_clicked,
    total_converted,
    unique_opens,
    unique_clicks,
    avg_time_to_open_minutes,
    avg_time_to_click_minutes,
    avg_time_to_convert_minutes,
    total_conversion_value
  )
  SELECT
    e.org_id,
    e.rule_id,
    _date,
    COUNT(*) FILTER (WHERE e.status IN ('sent', 'scheduled', 'pending', 'failed')) as total_triggered,
    COUNT(*) FILTER (WHERE e.status = 'sent') as total_sent,
    COUNT(*) FILTER (WHERE e.status = 'failed') as total_failed,
    COUNT(*) FILTER (WHERE ec.opened_at IS NOT NULL) as total_opened,
    COUNT(*) FILTER (WHERE ec.first_clicked_at IS NOT NULL) as total_clicked,
    COUNT(*) FILTER (WHERE e.converted_at IS NOT NULL) as total_converted,
    COUNT(DISTINCT e.contact_id) FILTER (WHERE ec.opened_at IS NOT NULL) as unique_opens,
    COUNT(DISTINCT e.contact_id) FILTER (WHERE ec.first_clicked_at IS NOT NULL) as unique_clicks,
    AVG(EXTRACT(EPOCH FROM (ec.opened_at - e.sent_at)) / 60) FILTER (WHERE ec.opened_at IS NOT NULL) as avg_time_to_open_minutes,
    AVG(EXTRACT(EPOCH FROM (ec.first_clicked_at - e.sent_at)) / 60) FILTER (WHERE ec.first_clicked_at IS NOT NULL) as avg_time_to_click_minutes,
    AVG(EXTRACT(EPOCH FROM (e.converted_at - e.sent_at)) / 60) FILTER (WHERE e.converted_at IS NOT NULL) as avg_time_to_convert_minutes,
    SUM(e.conversion_value) FILTER (WHERE e.converted_at IS NOT NULL) as total_conversion_value
  FROM email_automation_executions e
  LEFT JOIN email_conversations ec ON ec.id = e.email_conversation_id
  WHERE DATE(e.created_at) = _date
  GROUP BY e.org_id, e.rule_id
  ON CONFLICT (org_id, rule_id, report_date)
  DO UPDATE SET
    total_triggered = EXCLUDED.total_triggered,
    total_sent = EXCLUDED.total_sent,
    total_failed = EXCLUDED.total_failed,
    total_opened = EXCLUDED.total_opened,
    total_clicked = EXCLUDED.total_clicked,
    total_converted = EXCLUDED.total_converted,
    unique_opens = EXCLUDED.unique_opens,
    unique_clicks = EXCLUDED.unique_clicks,
    avg_time_to_open_minutes = EXCLUDED.avg_time_to_open_minutes,
    avg_time_to_click_minutes = EXCLUDED.avg_time_to_click_minutes,
    avg_time_to_convert_minutes = EXCLUDED.avg_time_to_convert_minutes,
    total_conversion_value = EXCLUDED.total_conversion_value;
END;
$$;


--
-- Name: auto_generate_webhook_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_generate_webhook_token() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  IF NEW.connector_type = 'webhook' AND NEW.webhook_token IS NULL THEN
    NEW.webhook_token := generate_webhook_token();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: auto_mark_automation_conversions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_mark_automation_conversions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  won_stage_id UUID;
BEGIN
  -- Only proceed if stage changed to "Won"
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    SELECT id INTO won_stage_id
    FROM pipeline_stages
    WHERE org_id = NEW.org_id AND LOWER(name) = 'won'
    LIMIT 1;

    IF NEW.pipeline_stage_id = won_stage_id THEN
      -- Mark recent executions (within 30 days) as converted
      UPDATE email_automation_executions
      SET converted_at = NOW(),
          conversion_type = 'deal_won',
          conversion_value = 0
      WHERE contact_id = NEW.id
        AND status = 'sent'
        AND sent_at >= NOW() - INTERVAL '30 days'
        AND converted_at IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: auto_populate_contact_communications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_populate_contact_communications() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Auto-populate contact_emails if email exists
  IF NEW.email IS NOT NULL AND NEW.email != '' THEN
    INSERT INTO public.contact_emails (contact_id, org_id, email, email_type, is_primary)
    VALUES (NEW.id, NEW.org_id, NEW.email, 'work', true)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Auto-populate contact_phones if phone exists
  IF NEW.phone IS NOT NULL AND NEW.phone != '' THEN
    INSERT INTO public.contact_phones (contact_id, org_id, phone, phone_type, is_primary)
    VALUES (NEW.id, NEW.org_id, NEW.phone, 'mobile', true)
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: bulk_delete_verified(text, uuid[], uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_delete_verified(_table_name text, _record_ids uuid[], _org_id uuid, _user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  deleted_count INT;
  valid_tables TEXT[] := ARRAY[
    'contacts', 'clients', 'tasks', 'client_invoices', 
    'client_documents', 'contact_activities', 'email_templates',
    'forms', 'teams', 'inventory_items', 'redefine_repository'
  ];
  records_in_org INT;
BEGIN
  -- Validate table name (prevent SQL injection)
  IF NOT (_table_name = ANY(valid_tables)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid table name: ' || _table_name
    );
  END IF;
  
  -- Verify all records belong to org
  EXECUTE format(
    'SELECT COUNT(*) FROM %I WHERE id = ANY($1) AND org_id = $2',
    _table_name
  ) INTO records_in_org USING _record_ids, _org_id;
  
  IF records_in_org != array_length(_record_ids, 1) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Some records do not belong to the organization',
      'found', records_in_org,
      'requested', array_length(_record_ids, 1)
    );
  END IF;
  
  -- Delete records
  EXECUTE format(
    'DELETE FROM %I WHERE id = ANY($1) AND org_id = $2',
    _table_name
  ) USING _record_ids, _org_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted', deleted_count,
    'table', _table_name
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$_$;


--
-- Name: calculate_monthly_amount(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_monthly_amount(_org_id uuid) RETURNS numeric
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  user_count INT;
  per_user_cost NUMERIC;
  monthly_amount NUMERIC;
BEGIN
  SELECT COUNT(*) INTO user_count
  FROM profiles
  WHERE org_id = _org_id;
  
  SELECT per_user_monthly_cost INTO per_user_cost
  FROM subscription_pricing
  WHERE is_active = true
  LIMIT 1;
  
  monthly_amount := user_count * per_user_cost;
  
  RETURN monthly_amount;
END;
$$;


--
-- Name: can_create_import_job(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_create_import_job(_user_id uuid, _org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND (org_id = _org_id OR is_platform_admin = true)
      AND is_active = true
  )
$$;


--
-- Name: capture_carry_forward_optimized(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.capture_carry_forward_optimized(_org_id uuid, _reference_year integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  contact_ids UUID[];
  snapshot_id UUID;
  existing_snapshot_id UUID;
BEGIN
  -- Check existing snapshot
  SELECT id INTO existing_snapshot_id
  FROM carry_forward_snapshot 
  WHERE org_id = _org_id AND reference_year = _reference_year;
  
  IF existing_snapshot_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'exists', true,
      'id', existing_snapshot_id
    );
  END IF;
  
  -- Get qualified contacts created before reference year in single query
  SELECT COALESCE(array_agg(c.id), '{}') INTO contact_ids
  FROM contacts c
  JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
  WHERE c.org_id = _org_id
  AND c.created_at < make_date(_reference_year, 1, 1)
  AND LOWER(ps.name) IN ('demo', 'qualified');
  
  -- Insert snapshot
  INSERT INTO carry_forward_snapshot (org_id, reference_year, qualified_contact_ids, captured_at)
  VALUES (_org_id, _reference_year, contact_ids, NOW())
  RETURNING id INTO snapshot_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'id', snapshot_id,
    'count', COALESCE(array_length(contact_ids, 1), 0)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: check_admin_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_admin_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  admin_count INTEGER;
BEGIN
  -- Only check if the role being inserted/updated is admin or super_admin
  IF NEW.role IN ('admin', 'super_admin') THEN
    -- Count existing admins for this org (excluding the current record if it's an update)
    SELECT COUNT(*) INTO admin_count
    FROM public.user_roles
    WHERE org_id = NEW.org_id 
      AND role IN ('admin', 'super_admin')
      AND (TG_OP = 'INSERT' OR id != NEW.id);
    
    -- Check if limit would be exceeded
    IF admin_count >= 5 THEN
      RAISE EXCEPTION 'Maximum number of admins (5) reached for this organization';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: check_and_increment_daily_limit(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_increment_daily_limit(_org_id uuid, _contact_id uuid, _max_per_day integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Get or create today's record
  INSERT INTO email_automation_daily_limits (
    org_id, contact_id, send_date, email_count, last_sent_at
  )
  VALUES (_org_id, _contact_id, CURRENT_DATE, 0, NOW())
  ON CONFLICT (org_id, contact_id, send_date) DO NOTHING;

  -- Get current count with row lock
  SELECT email_count INTO current_count
  FROM email_automation_daily_limits
  WHERE org_id = _org_id 
    AND contact_id = _contact_id 
    AND send_date = CURRENT_DATE
  FOR UPDATE;

  -- Check if limit would be exceeded
  IF current_count >= _max_per_day THEN
    RETURN false;
  END IF;

  -- Increment count
  UPDATE email_automation_daily_limits
  SET email_count = email_count + 1,
      last_sent_at = NOW()
  WHERE org_id = _org_id 
    AND contact_id = _contact_id 
    AND send_date = CURRENT_DATE;

  RETURN true;
END;
$$;


--
-- Name: check_and_update_subscription_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_update_subscription_status(_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  sub RECORD;
  latest_invoice RECORD;
  days_overdue INT;
  new_status TEXT;
BEGIN
  -- Get subscription
  SELECT * INTO sub
  FROM organization_subscriptions
  WHERE org_id = _org_id;
  
  -- Skip if subscription override is active
  IF sub.suspension_override_until IS NOT NULL AND sub.suspension_override_until >= CURRENT_DATE THEN
    RETURN;
  END IF;
  
  -- Get latest unpaid invoice
  SELECT * INTO latest_invoice
  FROM subscription_invoices
  WHERE org_id = _org_id
    AND payment_status IN ('pending', 'overdue')
    AND due_date <= CURRENT_DATE
  ORDER BY due_date DESC
  LIMIT 1;
  
  -- If no overdue invoice, ensure status is active
  IF latest_invoice IS NULL THEN
    IF sub.subscription_status != 'active' THEN
      UPDATE organization_subscriptions
      SET subscription_status = 'active',
          suspension_date = NULL,
          suspension_reason = NULL,
          updated_at = NOW()
      WHERE org_id = _org_id;
      
      UPDATE organizations
      SET services_enabled = true
      WHERE id = _org_id;
    END IF;
    RETURN;
  END IF;
  
  -- Calculate days overdue
  days_overdue := CURRENT_DATE - latest_invoice.due_date;
  
  -- Determine new status
  IF days_overdue >= 0 AND days_overdue <= 3 THEN
    new_status := 'suspended_grace';
  ELSIF days_overdue >= 4 AND days_overdue <= 10 THEN
    new_status := 'suspended_readonly';
  ELSIF days_overdue >= 11 THEN
    new_status := 'suspended_locked';
  ELSE
    new_status := 'active';
  END IF;
  
  -- Update if status changed
  IF sub.subscription_status != new_status THEN
    UPDATE organization_subscriptions
    SET subscription_status = new_status,
        suspension_date = CASE WHEN new_status != 'active' THEN NOW() ELSE NULL END,
        suspension_reason = CASE WHEN new_status != 'active' 
          THEN 'Payment overdue for invoice ' || latest_invoice.invoice_number 
          ELSE NULL END,
        grace_period_end = latest_invoice.due_date + INTERVAL '3 days',
        readonly_period_end = latest_invoice.due_date + INTERVAL '10 days',
        lockout_date = latest_invoice.due_date + INTERVAL '11 days',
        updated_at = NOW()
    WHERE org_id = _org_id;
    
    -- Update organizations table
    UPDATE organizations
    SET services_enabled = CASE WHEN new_status = 'active' THEN true ELSE false END
    WHERE id = _org_id;
    
    -- Update invoice status
    IF new_status != 'active' THEN
      UPDATE subscription_invoices
      SET payment_status = 'overdue'
      WHERE id = latest_invoice.id;
    END IF;
  END IF;
END;
$$;


--
-- Name: check_circular_dependency(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_circular_dependency(_rule_id uuid, _depends_on_rule_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  has_cycle BOOLEAN;
BEGIN
  -- Check if adding this dependency would create a cycle
  WITH RECURSIVE dependency_chain AS (
    -- Start from the depends_on_rule
    SELECT depends_on_rule_id as rule_id, 1 as depth
    FROM email_automation_rule_dependencies
    WHERE rule_id = _depends_on_rule_id
    
    UNION ALL
    
    -- Follow the chain
    SELECT d.depends_on_rule_id, dc.depth + 1
    FROM email_automation_rule_dependencies d
    INNER JOIN dependency_chain dc ON d.rule_id = dc.rule_id
    WHERE dc.depth < 10 -- Prevent infinite loops
  )
  SELECT EXISTS(
    SELECT 1 FROM dependency_chain WHERE rule_id = _rule_id
  ) INTO has_cycle;
  
  RETURN COALESCE(has_cycle, false);
END;
$$;


--
-- Name: check_connector_rate_limit(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_connector_rate_limit(_form_id uuid, _limit integer) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM connector_logs
  WHERE form_id = _form_id
    AND created_at > NOW() - INTERVAL '1 minute';
  
  RETURN recent_count < _limit;
END;
$$;


--
-- Name: check_inactive_contacts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_inactive_contacts() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  rule_record RECORD;
  contact_record RECORD;
  last_activity_date TIMESTAMPTZ;
  days_inactive INTEGER;
BEGIN
  -- Loop through all active inactivity rules
  FOR rule_record IN 
    SELECT * FROM email_automation_rules 
    WHERE trigger_type = 'inactivity' 
    AND is_active = true
  LOOP
    -- Get inactivity threshold from config
    days_inactive := COALESCE((rule_record.trigger_config->>'inactivity_days')::INTEGER, 30);
    
    -- Find contacts in this org that haven't had activity in X days
    FOR contact_record IN
      SELECT c.id, c.org_id,
             MAX(ca.created_at) as last_activity
      FROM contacts c
      LEFT JOIN contact_activities ca ON ca.contact_id = c.id
      WHERE c.org_id = rule_record.org_id
      GROUP BY c.id, c.org_id
      HAVING MAX(ca.created_at) < NOW() - (days_inactive || ' days')::INTERVAL
         OR MAX(ca.created_at) IS NULL
    LOOP
      -- Trigger automation for this contact
      PERFORM net.http_post(
        url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/automation-trigger-handler',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'orgId', contact_record.org_id,
          'triggerType', 'inactivity',
          'contactId', contact_record.id,
          'triggerData', jsonb_build_object(
            'days_inactive', days_inactive,
            'last_activity', contact_record.last_activity
          )
        )
      );
    END LOOP;
  END LOOP;
END;
$$;


--
-- Name: cleanup_orphaned_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_orphaned_profile(user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
BEGIN
  -- Delete from user_roles first (if any exist) - fully qualify to avoid ambiguity
  DELETE FROM public.user_roles WHERE user_roles.user_id = cleanup_orphaned_profile.user_id;
  
  -- Delete profile
  DELETE FROM public.profiles WHERE profiles.id = cleanup_orphaned_profile.user_id;
  
  -- Delete from auth.users (cascades will handle remaining references)
  DELETE FROM auth.users WHERE users.id = cleanup_orphaned_profile.user_id;
END;
$$;


--
-- Name: create_default_call_dispositions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_call_dispositions(_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _interested_id UUID;
  _not_interested_id UUID;
  _callback_id UUID;
  _no_answer_id UUID;
BEGIN
  -- Insert main dispositions and capture IDs
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Interested', 'Customer showed interest', 'positive')
    RETURNING id INTO _interested_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Not Interested', 'Customer not interested', 'negative')
    RETURNING id INTO _not_interested_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Callback Requested', 'Customer requested callback', 'follow_up')
    RETURNING id INTO _callback_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'No Answer', 'No one answered the call', 'neutral')
    RETURNING id INTO _no_answer_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Wrong Number', 'Incorrect contact number', 'neutral'),
    (_org_id, 'Voicemail', 'Left voicemail message', 'neutral'),
    (_org_id, 'Do Not Call', 'Customer requested no more calls', 'negative');

  -- Insert sub-dispositions
  INSERT INTO public.call_sub_dispositions (disposition_id, org_id, name, description) VALUES
    (_interested_id, _org_id, 'Ready to Buy', 'Customer ready to purchase'),
    (_interested_id, _org_id, 'Needs More Info', 'Interested but needs details'),
    (_interested_id, _org_id, 'Budget Approval', 'Needs budget approval'),
    (_not_interested_id, _org_id, 'Too Expensive', 'Price is too high'),
    (_not_interested_id, _org_id, 'No Need', 'Doesn''t need the product'),
    (_not_interested_id, _org_id, 'Using Competitor', 'Already using competitor'),
    (_callback_id, _org_id, 'Specific Time', 'Call at specific time'),
    (_callback_id, _org_id, 'After Decision', 'Call after internal decision'),
    (_no_answer_id, _org_id, 'Busy', 'Line was busy'),
    (_no_answer_id, _org_id, 'No Pickup', 'Phone rang but no pickup');
END;
$$;


--
-- Name: create_default_pipeline_stages(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_pipeline_stages(_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.pipeline_stages (org_id, name, description, stage_order, probability, color) VALUES
    (_org_id, 'New', 'Newly created leads', 1, 10, '#8AD4EB'),
    (_org_id, 'Contacted', 'Initial contact made', 2, 25, '#01B8AA'),
    (_org_id, 'Qualified', 'Lead qualified', 3, 50, '#F2C80F'),
    (_org_id, 'Proposal', 'Proposal sent', 4, 70, '#A66999'),
    (_org_id, 'Negotiation', 'In negotiation', 5, 85, '#FE9666'),
    (_org_id, 'Won', 'Deal won', 6, 100, '#168980'),
    (_org_id, 'Lost', 'Deal lost', 7, 0, '#FD625E');
END;
$$;


--
-- Name: FUNCTION create_default_pipeline_stages(_org_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_default_pipeline_stages(_org_id uuid) IS 'Creates default pipeline stages for new org - SECURITY DEFINER with locked search_path';


--
-- Name: create_organization_for_user(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_organization_for_user(p_user_id uuid, p_org_name text, p_org_slug text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org_id uuid;
  v_unique_slug text;
  v_per_user_cost NUMERIC;
BEGIN
  -- Generate unique slug if needed
  v_unique_slug := generate_unique_slug(p_org_slug);
  
  -- Create organization
  INSERT INTO public.organizations (name, slug)
  VALUES (p_org_name, v_unique_slug)
  RETURNING id INTO v_org_id;
  
  -- Update profile with org_id
  UPDATE public.profiles
  SET org_id = v_org_id
  WHERE id = p_user_id;
  
  -- Assign admin role
  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES (p_user_id, v_org_id, 'admin');
  
  -- Get per user cost from active pricing
  SELECT per_user_monthly_cost INTO v_per_user_cost
  FROM subscription_pricing
  WHERE is_active = true
  LIMIT 1;
  
  -- Create initial subscription with 5000 wallet balance for new orgs
  INSERT INTO public.organization_subscriptions (
    org_id,
    subscription_status,
    billing_cycle_start,
    next_billing_date,
    user_count,
    monthly_subscription_amount,
    wallet_balance,
    wallet_minimum_balance,
    wallet_auto_topup_enabled
  ) VALUES (
    v_org_id,
    'active',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '1 month',
    1,
    COALESCE(v_per_user_cost, 500),
    5000,
    5000,
    true
  );
  
  -- Create default pipeline stages
  PERFORM create_default_pipeline_stages(v_org_id);
  
  -- Create default call dispositions
  PERFORM create_default_call_dispositions(v_org_id);
  
  RETURN v_org_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Organization name or URL is already taken';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create organization: %', SQLERRM;
END;
$$;


--
-- Name: deduct_from_wallet(uuid, numeric, text, uuid, numeric, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deduct_from_wallet(_org_id uuid, _amount numeric, _service_type text, _reference_id uuid, _quantity numeric, _unit_cost numeric, _user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_balance NUMERIC;
  min_balance NUMERIC;
  new_balance NUMERIC;
  wallet_txn_id UUID;
  result JSONB;
BEGIN
  -- Get current wallet balance with row lock
  SELECT wallet_balance, wallet_minimum_balance INTO current_balance, min_balance
  FROM organization_subscriptions
  WHERE org_id = _org_id
  FOR UPDATE;
  
  -- Check if sufficient balance
  IF current_balance - _amount < min_balance THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_wallet_balance',
      'current_balance', current_balance,
      'min_balance', min_balance
    );
  END IF;
  
  -- Calculate new balance
  new_balance := current_balance - _amount;
  
  -- Update wallet balance
  UPDATE organization_subscriptions
  SET wallet_balance = new_balance,
      updated_at = NOW()
  WHERE org_id = _org_id;
  
  -- Create wallet transaction
  INSERT INTO wallet_transactions (
    org_id, transaction_type, amount, balance_before, balance_after,
    reference_id, reference_type, quantity, unit_cost
  ) VALUES (
    _org_id, 
    CASE 
      WHEN _service_type = 'email' THEN 'deduction_email'
      WHEN _service_type = 'whatsapp' THEN 'deduction_whatsapp'
      WHEN _service_type = 'call' THEN 'deduction_call'
    END,
    -_amount, current_balance, new_balance,
    _reference_id, _service_type, _quantity, _unit_cost
  )
  RETURNING id INTO wallet_txn_id;
  
  -- Create usage log
  INSERT INTO service_usage_logs (
    org_id, service_type, reference_id, user_id,
    quantity, cost, wallet_deducted, wallet_transaction_id
  ) VALUES (
    _org_id, _service_type, _reference_id, _user_id,
    _quantity, _amount, true, wallet_txn_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'new_balance', new_balance,
    'wallet_transaction_id', wallet_txn_id
  );
END;
$$;


--
-- Name: delete_user_data(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_user_data(user_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Get user ID from auth.users
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found with email: %', user_email;
  END IF;

  -- Delete from all related tables in correct order
  DELETE FROM user_roles WHERE user_id = target_user_id;
  DELETE FROM contact_activities WHERE created_by = target_user_id;
  DELETE FROM contacts WHERE created_by = target_user_id OR assigned_to = target_user_id;
  DELETE FROM org_invites WHERE invited_by = target_user_id OR used_by = target_user_id;
  DELETE FROM team_members WHERE user_id = target_user_id;
  DELETE FROM teams WHERE manager_id = target_user_id;
  DELETE FROM profiles WHERE id = target_user_id;
  
  -- Delete from auth.users (cascades will handle remaining references)
  DELETE FROM auth.users WHERE id = target_user_id;
  
  RAISE NOTICE 'Successfully deleted all data for user: %', user_email;
END;
$$;


--
-- Name: designation_has_feature_access(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.designation_has_feature_access(_designation_id uuid, _feature_key text, _permission text DEFAULT 'view'::text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  has_access BOOLEAN;
BEGIN
  SELECT 
    CASE _permission
      WHEN 'view' THEN can_view
      WHEN 'create' THEN can_create
      WHEN 'edit' THEN can_edit
      WHEN 'delete' THEN can_delete
      ELSE false
    END
  INTO has_access
  FROM public.designation_feature_access
  WHERE designation_id = _designation_id 
    AND feature_key = _feature_key;
  
  RETURN COALESCE(has_access, true);
END;
$$;


--
-- Name: ensure_single_default_exophone(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_single_default_exophone() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.exotel_exophones 
    SET is_default = false 
    WHERE org_id = NEW.org_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_api_key(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_api_key() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  new_key TEXT;
  key_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate key with format: crm_bridge_<random 32 chars>
    new_key := 'crm_bridge_' || encode(gen_random_bytes(24), 'hex');
    
    -- Check if key already exists
    SELECT EXISTS(SELECT 1 FROM api_keys WHERE api_key = new_key) INTO key_exists;
    
    -- Exit loop if unique
    EXIT WHEN NOT key_exists;
  END LOOP;
  
  RETURN new_key;
END;
$$;


--
-- Name: generate_ticket_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_ticket_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 5) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.support_tickets
  WHERE org_id = NEW.org_id;
  
  NEW.ticket_number := 'TKT-' || LPAD(next_num::TEXT, 5, '0');
  RETURN NEW;
END;
$$;


--
-- Name: generate_unique_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_unique_slug(base_slug text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  final_slug TEXT;
  counter INT := 1;
BEGIN
  final_slug := base_slug;
  
  -- Keep trying until we find a unique slug
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = final_slug) LOOP
    final_slug := base_slug || '-' || counter;
    counter := counter + 1;
  END LOOP;
  
  RETURN final_slug;
END;
$$;


--
-- Name: generate_webhook_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_webhook_token() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  token TEXT;
  token_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate token with format: wh_<random 32 chars>
    token := 'wh_' || encode(gen_random_bytes(24), 'hex');
    
    -- Check if token already exists
    SELECT EXISTS(SELECT 1 FROM forms WHERE webhook_token = token) INTO token_exists;
    
    -- Exit loop if unique
    EXIT WHEN NOT token_exists;
  END LOOP;
  
  RETURN token;
END;
$$;


--
-- Name: get_active_pricing(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_pricing() RETURNS TABLE(one_time_setup_cost numeric, per_user_monthly_cost numeric, min_wallet_balance numeric, email_cost_per_unit numeric, whatsapp_cost_per_unit numeric, call_cost_per_minute numeric, call_cost_per_call numeric, auto_topup_amount numeric, gst_percentage numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    one_time_setup_cost, per_user_monthly_cost, min_wallet_balance,
    email_cost_per_unit, whatsapp_cost_per_unit, call_cost_per_minute, call_cost_per_call,
    auto_topup_amount, gst_percentage
  FROM subscription_pricing
  WHERE is_active = true
  LIMIT 1;
$$;


--
-- Name: get_activity_trends(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_activity_trends(p_org_id uuid, p_days integer DEFAULT 7) RETURNS TABLE(activity_date date, activity_type text, activity_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RAISE LOG '=== get_activity_trends START ===';
  RAISE LOG 'Parameter p_org_id: %, p_days: %', p_org_id, p_days;
  RAISE LOG 'Current auth.uid(): %', auth.uid();
  
  RETURN QUERY
  SELECT 
    DATE(created_at) as activity_date,
    activity_type,
    COUNT(*) as activity_count
  FROM contact_activities
  WHERE org_id = p_org_id
    AND created_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  GROUP BY DATE(created_at), activity_type
  ORDER BY activity_date DESC, activity_type;
  
  RAISE LOG '=== get_activity_trends END ===';
END;
$$;


--
-- Name: get_dashboard_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_stats(p_org_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result JSON;
  v_total_contacts INTEGER;
  v_active_deals INTEGER;
  v_calls_today INTEGER;
  v_prev_month_contacts INTEGER;
  v_conversion_rate NUMERIC;
  v_auth_uid UUID;
  v_user_org_id UUID;
BEGIN
  -- Get current user context for debugging
  v_auth_uid := auth.uid();
  v_user_org_id := get_user_org_id(v_auth_uid);
  
  RAISE LOG '=== get_dashboard_stats START ===';
  RAISE LOG 'Parameter p_org_id: %', p_org_id;
  RAISE LOG 'Current auth.uid(): %', v_auth_uid;
  RAISE LOG 'get_user_org_id(auth.uid()): %', v_user_org_id;
  
  -- Total contacts
  SELECT COUNT(*) INTO v_total_contacts
  FROM contacts
  WHERE org_id = p_org_id;
  
  RAISE LOG 'Total contacts found: %', v_total_contacts;
  RAISE LOG 'Query was: SELECT COUNT(*) FROM contacts WHERE org_id = %', p_org_id;

  -- Active deals (contacts in pipeline stages)
  SELECT COUNT(*) INTO v_active_deals
  FROM contacts
  WHERE org_id = p_org_id AND pipeline_stage_id IS NOT NULL;
  
  RAISE LOG 'Active deals found: %', v_active_deals;

  -- Calls today
  SELECT COUNT(*) INTO v_calls_today
  FROM contact_activities
  WHERE org_id = p_org_id 
    AND activity_type = 'call'
    AND DATE(created_at) = CURRENT_DATE;
  
  RAISE LOG 'Calls today found: %', v_calls_today;

  -- Previous month contacts for growth calculation
  SELECT COUNT(*) INTO v_prev_month_contacts
  FROM contacts
  WHERE org_id = p_org_id
    AND created_at < DATE_TRUNC('month', CURRENT_DATE);
  
  RAISE LOG 'Previous month contacts: %', v_prev_month_contacts;

  -- Conversion rate
  SELECT CASE 
    WHEN v_total_contacts > 0 THEN
      ROUND((COUNT(*)::NUMERIC / v_total_contacts::NUMERIC) * 100, 2)
    ELSE 0
  END INTO v_conversion_rate
  FROM contacts c
  INNER JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
  WHERE c.org_id = p_org_id AND ps.probability = 100;
  
  RAISE LOG 'Conversion rate calculated: %', v_conversion_rate;

  v_result := json_build_object(
    'total_contacts', v_total_contacts,
    'active_deals', v_active_deals,
    'calls_today', v_calls_today,
    'prev_month_contacts', v_prev_month_contacts,
    'conversion_rate', v_conversion_rate
  );
  
  RAISE LOG 'Final result: %', v_result;
  RAISE LOG '=== get_dashboard_stats END ===';

  RETURN v_result;
END;
$$;


--
-- Name: get_demo_stats_this_month(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_demo_stats_this_month(p_org_id uuid) RETURNS TABLE(demos_done integer, demos_upcoming integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_demo_stage_id UUID;
  v_month_start DATE;
  v_month_end DATE;
BEGIN
  -- Get the Demo stage ID for this org
  SELECT id INTO v_demo_stage_id
  FROM pipeline_stages
  WHERE org_id = p_org_id AND name = 'Demo'
  LIMIT 1;

  -- Calculate current month boundaries
  v_month_start := DATE_TRUNC('month', CURRENT_DATE);
  v_month_end := DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day';

  -- Return both counts
  RETURN QUERY
  SELECT
    -- Demos done: contacts that moved FROM Demo stage this month
    COALESCE((
      SELECT COUNT(DISTINCT contact_id)::INTEGER
      FROM pipeline_movement_history
      WHERE org_id = p_org_id
        AND from_stage_id = v_demo_stage_id
        AND moved_at >= v_month_start
        AND moved_at <= v_month_end + INTERVAL '1 day'
    ), 0) AS demos_done,
    
    -- Demos upcoming: contacts currently in Demo stage
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM contacts
      WHERE org_id = p_org_id
        AND pipeline_stage_id = v_demo_stage_id
    ), 0) AS demos_upcoming;
END;
$$;


--
-- Name: get_monthly_actuals_optimized(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_monthly_actuals_optimized(_org_id uuid, _year integer) RETURNS TABLE(month integer, qualified bigint, proposals bigint, deals bigint, invoiced numeric, received numeric, invoiced_invoice_ids uuid[], received_invoice_ids uuid[], qualified_contact_ids uuid[], proposal_contact_ids uuid[], deal_contact_ids uuid[])
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  qualified_stage_ids uuid[];
  proposal_stage_ids uuid[];
  deal_stage_ids uuid[];
BEGIN
  -- Get stage IDs for qualified stages (demo, qualified)
  SELECT array_agg(id) INTO qualified_stage_ids
  FROM pipeline_stages
  WHERE org_id = _org_id
    AND (lower(name) LIKE '%demo%' OR lower(name) LIKE '%qualified%');

  -- Get stage IDs for proposal stages (proposal, quote, quotation)
  SELECT array_agg(id) INTO proposal_stage_ids
  FROM pipeline_stages
  WHERE org_id = _org_id
    AND (lower(name) LIKE '%proposal%' OR lower(name) LIKE '%quote%' OR lower(name) LIKE '%quotation%');

  -- Get stage IDs for deal stages (won, deal, negotiation)
  SELECT array_agg(id) INTO deal_stage_ids
  FROM pipeline_stages
  WHERE org_id = _org_id
    AND (lower(name) LIKE '%won%' OR lower(name) LIKE '%deal%' OR lower(name) LIKE '%negotiation%');

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(1, 12) AS m
  ),
  pipeline_qualified AS (
    SELECT 
      EXTRACT(MONTH FROM pmh.moved_at)::integer AS m,
      COUNT(DISTINCT pmh.contact_id) AS cnt,
      array_agg(DISTINCT pmh.contact_id) AS contact_ids
    FROM pipeline_movement_history pmh
    WHERE pmh.org_id = _org_id
      AND EXTRACT(YEAR FROM pmh.moved_at) = _year
      AND pmh.to_stage_id = ANY(COALESCE(qualified_stage_ids, ARRAY[]::uuid[]))
    GROUP BY EXTRACT(MONTH FROM pmh.moved_at)
  ),
  pipeline_proposals AS (
    SELECT 
      EXTRACT(MONTH FROM pmh.moved_at)::integer AS m,
      COUNT(DISTINCT pmh.contact_id) AS cnt,
      array_agg(DISTINCT pmh.contact_id) AS contact_ids
    FROM pipeline_movement_history pmh
    WHERE pmh.org_id = _org_id
      AND EXTRACT(YEAR FROM pmh.moved_at) = _year
      AND pmh.to_stage_id = ANY(COALESCE(proposal_stage_ids, ARRAY[]::uuid[]))
    GROUP BY EXTRACT(MONTH FROM pmh.moved_at)
  ),
  pipeline_deals AS (
    SELECT 
      EXTRACT(MONTH FROM pmh.moved_at)::integer AS m,
      COUNT(DISTINCT pmh.contact_id) AS cnt,
      array_agg(DISTINCT pmh.contact_id) AS contact_ids
    FROM pipeline_movement_history pmh
    WHERE pmh.org_id = _org_id
      AND EXTRACT(YEAR FROM pmh.moved_at) = _year
      AND pmh.to_stage_id = ANY(COALESCE(deal_stage_ids, ARRAY[]::uuid[]))
    GROUP BY EXTRACT(MONTH FROM pmh.moved_at)
  ),
  -- FIXED: Include both invoices AND quotations in invoiced totals (removed document_type filter)
  invoiced_data AS (
    SELECT 
      EXTRACT(MONTH FROM invoice_date)::integer AS m,
      SUM(amount + COALESCE(tax_amount, 0)) AS total,
      array_agg(id) AS invoice_ids
    FROM client_invoices
    WHERE org_id = _org_id
      AND EXTRACT(YEAR FROM invoice_date) = _year
    GROUP BY EXTRACT(MONTH FROM invoice_date)
  ),
  -- FIXED: Include both invoices AND quotations in received totals (removed document_type filter)
  received_data AS (
    SELECT 
      EXTRACT(MONTH FROM payment_received_date)::integer AS m,
      SUM(COALESCE(net_received_amount, actual_payment_received, amount)) AS total,
      array_agg(id) AS invoice_ids
    FROM client_invoices
    WHERE org_id = _org_id
      AND EXTRACT(YEAR FROM payment_received_date) = _year
      AND status = 'paid'
    GROUP BY EXTRACT(MONTH FROM payment_received_date)
  )
  SELECT 
    months.m AS month,
    COALESCE(pq.cnt, 0) AS qualified,
    COALESCE(pp.cnt, 0) AS proposals,
    COALESCE(pd.cnt, 0) AS deals,
    COALESCE(inv.total, 0) AS invoiced,
    COALESCE(rec.total, 0) AS received,
    COALESCE(inv.invoice_ids, ARRAY[]::uuid[]) AS invoiced_invoice_ids,
    COALESCE(rec.invoice_ids, ARRAY[]::uuid[]) AS received_invoice_ids,
    COALESCE(pq.contact_ids, ARRAY[]::uuid[]) AS qualified_contact_ids,
    COALESCE(pp.contact_ids, ARRAY[]::uuid[]) AS proposal_contact_ids,
    COALESCE(pd.contact_ids, ARRAY[]::uuid[]) AS deal_contact_ids
  FROM months
  LEFT JOIN pipeline_qualified pq ON pq.m = months.m
  LEFT JOIN pipeline_proposals pp ON pp.m = months.m
  LEFT JOIN pipeline_deals pd ON pd.m = months.m
  LEFT JOIN invoiced_data inv ON inv.m = months.m
  LEFT JOIN received_data rec ON rec.m = months.m
  ORDER BY months.m;
END;
$$;


--
-- Name: get_optimal_send_time(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_optimal_send_time(_org_id uuid, _contact_id uuid, _default_hour integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  best_pattern RECORD;
  result JSONB;
BEGIN
  -- Get best performing time slot for this contact
  SELECT hour_of_day, day_of_week, engagement_score
  INTO best_pattern
  FROM email_engagement_patterns
  WHERE org_id = _org_id 
    AND contact_id = _contact_id
    AND engagement_score > 0
  ORDER BY engagement_score DESC
  LIMIT 1;

  IF FOUND THEN
    result := jsonb_build_object(
      'hour', best_pattern.hour_of_day,
      'day_of_week', best_pattern.day_of_week,
      'score', best_pattern.engagement_score,
      'optimized', true
    );
  ELSE
    -- Fall back to org-wide best time
    SELECT hour_of_day, day_of_week, AVG(engagement_score) as avg_score
    INTO best_pattern
    FROM email_engagement_patterns
    WHERE org_id = _org_id
      AND engagement_score > 0
    GROUP BY hour_of_day, day_of_week
    ORDER BY avg_score DESC
    LIMIT 1;

    IF FOUND THEN
      result := jsonb_build_object(
        'hour', best_pattern.hour_of_day,
        'day_of_week', best_pattern.day_of_week,
        'score', best_pattern.avg_score,
        'optimized', false
      );
    ELSE
      -- Use default
      result := jsonb_build_object(
        'hour', _default_hour,
        'day_of_week', 2, -- Tuesday
        'score', 0,
        'optimized', false
      );
    END IF;
  END IF;

  RETURN result;
END;
$$;


--
-- Name: get_org_statistics(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_org_statistics(p_org_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result JSON;
  v_user_count INTEGER;
  v_contact_count INTEGER;
  v_active_1d INTEGER;
  v_active_7d INTEGER;
  v_active_30d INTEGER;
  v_call_volume INTEGER;
  v_email_volume INTEGER;
BEGIN
  -- Count users in org
  SELECT COUNT(*) INTO v_user_count
  FROM profiles
  WHERE org_id = p_org_id;
  
  -- Count contacts in org
  SELECT COUNT(*) INTO v_contact_count
  FROM contacts
  WHERE org_id = p_org_id;
  
  -- Active users in last 1 day (based on activity creation)
  SELECT COUNT(DISTINCT created_by) INTO v_active_1d
  FROM contact_activities
  WHERE org_id = p_org_id
    AND created_at > NOW() - INTERVAL '1 day'
    AND created_by IS NOT NULL;
  
  -- Active users in last 7 days
  SELECT COUNT(DISTINCT created_by) INTO v_active_7d
  FROM contact_activities
  WHERE org_id = p_org_id
    AND created_at > NOW() - INTERVAL '7 days'
    AND created_by IS NOT NULL;
  
  -- Active users in last 30 days
  SELECT COUNT(DISTINCT created_by) INTO v_active_30d
  FROM contact_activities
  WHERE org_id = p_org_id
    AND created_at > NOW() - INTERVAL '30 days'
    AND created_by IS NOT NULL;
  
  -- Call volume (all time)
  SELECT COUNT(*) INTO v_call_volume
  FROM call_logs
  WHERE org_id = p_org_id;
  
  -- Email volume (outbound only)
  SELECT COUNT(*) INTO v_email_volume
  FROM email_conversations
  WHERE org_id = p_org_id
    AND direction = 'outbound';

  v_result := json_build_object(
    'user_count', v_user_count,
    'contact_count', v_contact_count,
    'active_users_1d', v_active_1d,
    'active_users_7d', v_active_7d,
    'active_users_30d', v_active_30d,
    'call_volume', v_call_volume,
    'email_volume', v_email_volume
  );

  RETURN v_result;
END;
$$;


--
-- Name: get_orphaned_profiles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_orphaned_profiles() RETURNS TABLE(user_id uuid, email text, first_name text, last_name text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    u.email::text,
    p.first_name,
    p.last_name,
    p.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.org_id IS NULL 
    AND p.is_platform_admin IS NOT TRUE
  ORDER BY p.created_at DESC;
END;
$$;


--
-- Name: get_pipeline_distribution(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pipeline_distribution(p_org_id uuid) RETURNS TABLE(stage_name text, contact_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RAISE LOG '=== get_pipeline_distribution START ===';
  RAISE LOG 'Parameter p_org_id: %', p_org_id;
  RAISE LOG 'Current auth.uid(): %', auth.uid();
  
  RETURN QUERY
  SELECT 
    COALESCE(ps.name, 'No Stage') as stage_name,
    COUNT(c.id) as contact_count
  FROM contacts c
  LEFT JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
  WHERE c.org_id = p_org_id
  GROUP BY ps.name
  ORDER BY contact_count DESC;
  
  RAISE LOG '=== get_pipeline_distribution END ===';
END;
$$;


--
-- Name: get_pipeline_performance_report(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pipeline_performance_report(p_org_id uuid) RETURNS TABLE(stage_id uuid, stage_name text, stage_order integer, stage_color text, contact_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.id as stage_id,
    ps.name as stage_name,
    ps.stage_order,
    ps.color as stage_color,
    COUNT(c.id) as contact_count
  FROM pipeline_stages ps
  LEFT JOIN contacts c ON c.pipeline_stage_id = ps.id AND c.org_id = p_org_id
  WHERE ps.org_id = p_org_id
  GROUP BY ps.id, ps.name, ps.stage_order, ps.color
  ORDER BY ps.stage_order;
END;
$$;


--
-- Name: get_platform_admin_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_platform_admin_stats() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result JSON;
  v_total_orgs INTEGER;
  v_total_users INTEGER;
  v_active_users_1d INTEGER;
  v_active_users_7d INTEGER;
  v_active_users_30d INTEGER;
  v_total_contacts INTEGER;
  v_call_volume INTEGER;
  v_email_volume INTEGER;
BEGIN
  -- Basic counts
  SELECT COUNT(DISTINCT id) INTO v_total_orgs FROM organizations;
  SELECT COUNT(*) INTO v_total_users FROM profiles;
  SELECT COUNT(*) INTO v_total_contacts FROM contacts;
  
  -- Active users based on activity creation
  SELECT COUNT(DISTINCT created_by) INTO v_active_users_1d 
  FROM contact_activities 
  WHERE created_at > NOW() - INTERVAL '1 day'
    AND created_by IS NOT NULL;
  
  SELECT COUNT(DISTINCT created_by) INTO v_active_users_7d 
  FROM contact_activities 
  WHERE created_at > NOW() - INTERVAL '7 days'
    AND created_by IS NOT NULL;
  
  SELECT COUNT(DISTINCT created_by) INTO v_active_users_30d 
  FROM contact_activities 
  WHERE created_at > NOW() - INTERVAL '30 days'
    AND created_by IS NOT NULL;
  
  -- Call and email volume
  SELECT COUNT(*) INTO v_call_volume FROM call_logs;
  
  SELECT COUNT(*) INTO v_email_volume 
  FROM email_conversations 
  WHERE direction = 'outbound';

  v_result := json_build_object(
    'total_organizations', v_total_orgs,
    'total_users', v_total_users,
    'active_users_1d', v_active_users_1d,
    'active_users_7d', v_active_users_7d,
    'active_users_30d', v_active_users_30d,
    'total_contacts', v_total_contacts,
    'call_volume', v_call_volume,
    'email_volume', v_email_volume
  );

  RETURN v_result;
END;
$$;


--
-- Name: get_reporting_chain(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_reporting_chain(p_designation_id uuid) RETURNS TABLE(designation_id uuid, level integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH RECURSIVE chain AS (
    -- Base case: the designation itself
    SELECT 
      p_designation_id as designation_id,
      0 as level
    
    UNION ALL
    
    -- Recursive case: manager of current designation
    SELECT 
      rh.reports_to_designation_id,
      c.level + 1
    FROM public.reporting_hierarchy rh
    INNER JOIN chain c ON rh.designation_id = c.designation_id
    WHERE rh.reports_to_designation_id IS NOT NULL
  )
  SELECT * FROM chain WHERE designation_id IS NOT NULL;
$$;


--
-- Name: FUNCTION get_reporting_chain(p_designation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_reporting_chain(p_designation_id uuid) IS 'Returns reporting chain up to top - SECURITY DEFINER with locked search_path';


--
-- Name: get_rule_execution_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_rule_execution_order(_org_id uuid) RETURNS TABLE(rule_id uuid, execution_level integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE rule_levels AS (
    -- Level 0: Rules with no dependencies
    SELECT r.id as rule_id, 0 as level
    FROM email_automation_rules r
    WHERE r.org_id = _org_id
      AND r.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM email_automation_rule_dependencies d
        WHERE d.rule_id = r.id
      )
    
    UNION ALL
    
    -- Higher levels: Rules that depend on previous levels
    SELECT r.id, rl.level + 1
    FROM email_automation_rules r
    INNER JOIN email_automation_rule_dependencies d ON d.rule_id = r.id
    INNER JOIN rule_levels rl ON rl.rule_id = d.depends_on_rule_id
    WHERE r.org_id = _org_id
      AND r.is_active = true
      AND rl.level < 10
  )
  SELECT DISTINCT ON (rl.rule_id) rl.rule_id, rl.level
  FROM rule_levels rl
  ORDER BY rl.rule_id, rl.level;
END;
$$;


--
-- Name: get_sales_performance_report(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_sales_performance_report(p_org_id uuid, p_start_date timestamp with time zone) RETURNS TABLE(user_id uuid, user_name text, total_contacts bigint, total_calls bigint, total_emails bigint, total_meetings bigint, deals_won bigint, conversion_rate numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH user_contacts AS (
    SELECT 
      c.created_by,
      COUNT(*) as contact_count
    FROM contacts c
    WHERE c.org_id = p_org_id
      AND c.created_at >= p_start_date
      AND c.created_by IS NOT NULL
    GROUP BY c.created_by
  ),
  user_activities AS (
    SELECT
      ca.created_by,
      COUNT(*) FILTER (WHERE ca.activity_type = 'call') as call_count,
      COUNT(*) FILTER (WHERE ca.activity_type = 'email') as email_count,
      COUNT(*) FILTER (WHERE ca.activity_type = 'meeting') as meeting_count
    FROM contact_activities ca
    WHERE ca.org_id = p_org_id
      AND ca.created_at >= p_start_date
      AND ca.created_by IS NOT NULL
    GROUP BY ca.created_by
  ),
  won_stage AS (
    SELECT id as stage_id
    FROM pipeline_stages
    WHERE org_id = p_org_id
      AND LOWER(name) = 'won'
    LIMIT 1
  ),
  user_deals AS (
    SELECT
      c.created_by,
      COUNT(*) as won_count
    FROM contacts c
    CROSS JOIN won_stage ws
    WHERE c.org_id = p_org_id
      AND c.pipeline_stage_id = ws.stage_id
      AND c.created_by IS NOT NULL
    GROUP BY c.created_by
  )
  SELECT
    p.id as user_id,
    COALESCE(p.first_name || ' ' || COALESCE(p.last_name, ''), 'Unknown') as user_name,
    COALESCE(uc.contact_count, 0) as total_contacts,
    COALESCE(ua.call_count, 0) as total_calls,
    COALESCE(ua.email_count, 0) as total_emails,
    COALESCE(ua.meeting_count, 0) as total_meetings,
    COALESCE(ud.won_count, 0) as deals_won,
    CASE 
      WHEN COALESCE(uc.contact_count, 0) > 0 
      THEN ROUND((COALESCE(ud.won_count, 0)::numeric / uc.contact_count::numeric) * 100, 2)
      ELSE 0
    END as conversion_rate
  FROM profiles p
  LEFT JOIN user_contacts uc ON p.id = uc.created_by
  LEFT JOIN user_activities ua ON p.id = ua.created_by
  LEFT JOIN user_deals ud ON p.id = ud.created_by
  WHERE p.org_id = p_org_id
    AND (uc.contact_count > 0 OR ua.call_count > 0 OR ua.email_count > 0 OR ua.meeting_count > 0 OR ud.won_count > 0)
  ORDER BY p.first_name;
END;
$$;


--
-- Name: get_subordinates(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_subordinates(p_designation_id uuid) RETURNS TABLE(designation_id uuid, level integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH RECURSIVE subordinates AS (
    -- Base case: direct reports
    SELECT 
      rh.designation_id,
      1 as level
    FROM public.reporting_hierarchy rh
    WHERE rh.reports_to_designation_id = p_designation_id
    
    UNION ALL
    
    -- Recursive case: reports of reports
    SELECT 
      rh.designation_id,
      s.level + 1
    FROM public.reporting_hierarchy rh
    INNER JOIN subordinates s ON rh.reports_to_designation_id = s.designation_id
  )
  SELECT * FROM subordinates;
$$;


--
-- Name: FUNCTION get_subordinates(p_designation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_subordinates(p_designation_id uuid) IS 'Returns all subordinates in reporting hierarchy - SECURITY DEFINER with locked search_path';


--
-- Name: get_unified_inbox(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unified_inbox(p_org_id uuid, p_limit integer DEFAULT 50) RETURNS TABLE(id uuid, conversation_id text, contact_id uuid, channel text, direction text, sender_name text, preview text, is_read boolean, sent_at timestamp with time zone, contact_name text, phone_number text, email_address text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wm.id,
    wm.conversation_id::TEXT,
    wm.contact_id,
    'whatsapp'::TEXT as channel,
    wm.direction,
    wm.sender_name,
    LEFT(wm.message_content, 100) as preview,
    COALESCE(wm.read_at IS NOT NULL, FALSE) as is_read,
    wm.sent_at,
    COALESCE(c.first_name || ' ' || COALESCE(c.last_name, ''), wm.sender_name) as contact_name,
    wm.phone_number,
    NULL::TEXT as email_address
  FROM whatsapp_messages wm
  LEFT JOIN contacts c ON c.id = wm.contact_id
  WHERE wm.org_id = p_org_id
  
  UNION ALL
  
  SELECT 
    ec.id,
    ec.conversation_id::TEXT,
    ec.contact_id,
    'email'::TEXT as channel,
    ec.direction,
    ec.from_name as sender_name,
    LEFT(ec.subject || ': ' || ec.email_content, 100) as preview,
    ec.is_read,
    ec.sent_at,
    COALESCE(c.first_name || ' ' || COALESCE(c.last_name, ''), ec.from_name) as contact_name,
    NULL::TEXT as phone_number,
    ec.from_email as email_address
  FROM email_conversations ec
  LEFT JOIN contacts c ON c.id = ec.contact_id
  WHERE ec.org_id = p_org_id
  
  ORDER BY sent_at DESC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_user_org_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_org_id(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT org_id
  FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org_id uuid;
  v_default_role app_role;
BEGIN
  -- Extract org_id from metadata if provided during signup
  v_org_id := (NEW.raw_user_meta_data->>'org_id')::uuid;
  
  -- Insert profile with org_id from metadata
  INSERT INTO public.profiles (id, first_name, last_name, org_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    v_org_id
  );

  -- If org_id is set, assign a default role
  IF v_org_id IS NOT NULL THEN
    -- Check if this is the first user in the org (they should be admin)
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE org_id = v_org_id
    ) THEN
      v_default_role := 'admin'::app_role;
    ELSE
      v_default_role := 'sales_agent'::app_role;
    END IF;

    -- Insert the role (SECURITY DEFINER allows this to bypass RLS)
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, v_default_role);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: increment_automation_cooldown(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_automation_cooldown(_rule_id uuid, _contact_id uuid, _org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO email_automation_cooldowns (
    rule_id, contact_id, org_id, last_sent_at, send_count
  )
  VALUES (_rule_id, _contact_id, _org_id, NOW(), 1)
  ON CONFLICT (rule_id, contact_id)
  DO UPDATE SET
    last_sent_at = NOW(),
    send_count = email_automation_cooldowns.send_count + 1;
END;
$$;


--
-- Name: increment_automation_rule_stats(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_automation_rule_stats(_rule_id uuid, _stat_type text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF _stat_type = 'triggered' THEN
    UPDATE email_automation_rules
    SET total_triggered = total_triggered + 1
    WHERE id = _rule_id;
  ELSIF _stat_type = 'sent' THEN
    UPDATE email_automation_rules
    SET total_sent = total_sent + 1
    WHERE id = _rule_id;
  ELSIF _stat_type = 'failed' THEN
    UPDATE email_automation_rules
    SET total_failed = total_failed + 1
    WHERE id = _rule_id;
  END IF;
END;
$$;


--
-- Name: increment_campaign_stats(uuid, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_campaign_stats(p_campaign_id uuid, p_sent_increment integer DEFAULT 0, p_failed_increment integer DEFAULT 0, p_pending_increment integer DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE whatsapp_bulk_campaigns
  SET 
    sent_count = sent_count + p_sent_increment,
    failed_count = failed_count + p_failed_increment,
    pending_count = pending_count + p_pending_increment,
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$;


--
-- Name: increment_email_campaign_stats(uuid, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_email_campaign_stats(p_campaign_id uuid, p_sent_increment integer DEFAULT 0, p_failed_increment integer DEFAULT 0, p_pending_increment integer DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE email_bulk_campaigns
  SET 
    sent_count = sent_count + p_sent_increment,
    failed_count = failed_count + p_failed_increment,
    pending_count = pending_count + p_pending_increment,
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$;


--
-- Name: increment_sms_campaign_stats(uuid, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_sms_campaign_stats(p_campaign_id uuid, p_sent_increment integer DEFAULT 0, p_failed_increment integer DEFAULT 0, p_pending_increment integer DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE sms_bulk_campaigns
  SET 
    sent_count = sent_count + p_sent_increment,
    failed_count = failed_count + p_failed_increment,
    pending_count = pending_count + p_pending_increment,
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$;


--
-- Name: is_admin_of_conversation(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_of_conversation(conv_id uuid, check_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = conv_id AND user_id = check_user_id AND is_admin = true
  );
END;
$$;


--
-- Name: is_email_suppressed(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_email_suppressed(_org_id uuid, _email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.email_suppression_list
    WHERE org_id = _org_id AND LOWER(email) = LOWER(_email)
  );
$$;


--
-- Name: is_email_unsubscribed(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_email_unsubscribed(_org_id uuid, _email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM email_unsubscribes
    WHERE org_id = _org_id AND LOWER(email) = LOWER(_email)
  );
$$;


--
-- Name: is_feature_enabled_for_org(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_feature_enabled_for_org(_org_id uuid, _feature_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM public.org_feature_access 
     WHERE org_id = _org_id AND feature_key = _feature_key),
    true
  );
$$;


--
-- Name: is_participant_in_conversation(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_participant_in_conversation(conv_id uuid, check_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = conv_id AND user_id = check_user_id
  );
END;
$$;


--
-- Name: is_platform_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE id = _user_id),
    false
  )
$$;


--
-- Name: is_within_business_hours(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_within_business_hours(_org_id uuid, _check_time timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_day_of_week INTEGER;
  v_current_time TIME;
  v_timezone TEXT;
  v_business_hours RECORD;
BEGIN
  -- Get org timezone from business hours config
  SELECT timezone INTO v_timezone
  FROM public.org_business_hours
  WHERE org_id = _org_id
  LIMIT 1;
  
  -- Default to UTC if no timezone configured
  v_timezone := COALESCE(v_timezone, 'UTC');
  
  -- Convert check time to org timezone
  v_day_of_week := EXTRACT(DOW FROM _check_time AT TIME ZONE v_timezone)::INTEGER;
  v_current_time := (_check_time AT TIME ZONE v_timezone)::TIME;
  
  -- Check if there's an enabled business hour for this day
  SELECT * INTO v_business_hours
  FROM public.org_business_hours
  WHERE org_id = _org_id 
    AND day_of_week = v_day_of_week
    AND is_enabled = true;
  
  -- If no business hours configured for this day, consider it outside business hours
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if current time is within the configured hours
  RETURN v_current_time >= v_business_hours.start_time 
    AND v_current_time <= v_business_hours.end_time;
END;
$$;


--
-- Name: log_contact_creation_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_contact_creation_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Create an activity for the contact creation
  INSERT INTO public.contact_activities (
    org_id,
    contact_id,
    activity_type,
    subject,
    description,
    created_by,
    created_at,
    completed_at
  ) VALUES (
    NEW.org_id,
    NEW.id,
    'note',
    'Contact Created',
    'Contact added to system' || 
    CASE 
      WHEN NEW.source IS NOT NULL THEN ' via ' || NEW.source
      ELSE ''
    END,
    NEW.created_by,
    NEW.created_at,
    NEW.created_at
  );
  
  RETURN NEW;
END;
$$;


--
-- Name: log_redefine_repository_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_redefine_repository_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO redefine_repository_audit (repository_record_id, action, changed_by, old_values)
    VALUES (OLD.id, 'delete', auth.uid(), row_to_json(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO redefine_repository_audit (repository_record_id, action, changed_by, old_values, new_values)
    VALUES (NEW.id, 'update', auth.uid(), row_to_json(OLD), row_to_json(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO redefine_repository_audit (repository_record_id, action, changed_by, new_values)
    VALUES (NEW.id, 'insert', auth.uid(), row_to_json(NEW));
    RETURN NEW;
  END IF;
END;
$$;


--
-- Name: manage_webhook_trigger(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manage_webhook_trigger(p_table_name text, p_operation text, p_action text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  trigger_name TEXT;
  sql_statement TEXT;
BEGIN
  -- Generate unique trigger name
  trigger_name := 'webhook_' || p_table_name || '_' || lower(p_operation);
  
  IF p_action = 'create' THEN
    -- Drop existing trigger first
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, p_table_name);
    
    -- Create trigger
    sql_statement := format(
      'CREATE TRIGGER %I AFTER %s ON public.%I FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic()',
      trigger_name,
      p_operation,
      p_table_name
    );
    EXECUTE sql_statement;
  ELSIF p_action = 'drop' THEN
    -- Drop trigger if exists
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, p_table_name);
  END IF;
END;
$$;


--
-- Name: mark_automation_conversion(uuid, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_automation_conversion(_execution_id uuid, _conversion_type text, _conversion_value numeric DEFAULT NULL::numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE email_automation_executions
  SET converted_at = NOW(),
      conversion_type = _conversion_type,
      conversion_value = _conversion_value
  WHERE id = _execution_id AND converted_at IS NULL;
END;
$$;


--
-- Name: merge_clients_atomic(uuid, uuid[], uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_clients_atomic(_primary_client_id uuid, _duplicate_client_ids uuid[], _org_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  deleted_count INT;
  docs_transferred INT;
  invoices_transferred INT;
  contacts_transferred INT;
BEGIN
  -- Verify primary client belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM clients 
    WHERE id = _primary_client_id AND org_id = _org_id
  ) THEN
    RAISE EXCEPTION 'Primary client does not belong to organization';
  END IF;

  -- Verify all duplicate clients belong to org
  IF EXISTS (
    SELECT 1 FROM clients 
    WHERE id = ANY(_duplicate_client_ids) 
    AND org_id != _org_id
  ) THEN
    RAISE EXCEPTION 'One or more duplicate clients do not belong to organization';
  END IF;
  
  -- Verify primary is not in duplicates list
  IF _primary_client_id = ANY(_duplicate_client_ids) THEN
    RAISE EXCEPTION 'Primary client cannot be in the duplicates list';
  END IF;

  -- Transfer documents
  UPDATE client_documents 
  SET client_id = _primary_client_id, updated_at = NOW()
  WHERE client_id = ANY(_duplicate_client_ids);
  GET DIAGNOSTICS docs_transferred = ROW_COUNT;
  
  -- Transfer invoices
  UPDATE client_invoices 
  SET client_id = _primary_client_id, updated_at = NOW()
  WHERE client_id = ANY(_duplicate_client_ids);
  GET DIAGNOSTICS invoices_transferred = ROW_COUNT;
  
  -- Transfer alternate contacts
  UPDATE client_alternate_contacts 
  SET client_id = _primary_client_id, updated_at = NOW()
  WHERE client_id = ANY(_duplicate_client_ids);
  GET DIAGNOSTICS contacts_transferred = ROW_COUNT;
  
  -- Delete duplicates
  DELETE FROM clients 
  WHERE id = ANY(_duplicate_client_ids) AND org_id = _org_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', deleted_count,
    'documents_transferred', docs_transferred,
    'invoices_transferred', invoices_transferred,
    'contacts_transferred', contacts_transferred
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: process_bulk_import_batch(uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_bulk_import_batch(p_import_id uuid, p_table_name text, p_org_id uuid, p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_record RECORD;
  v_new_record_id UUID;
  v_processed INTEGER := 0;
  v_inserted INTEGER := 0;
  v_failed INTEGER := 0;
  v_skipped INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
BEGIN
  FOR v_record IN 
    SELECT * FROM import_staging 
    WHERE import_id = p_import_id AND NOT processed
    ORDER BY row_number
  LOOP
    BEGIN
      CASE p_table_name
        WHEN 'contacts' THEN
          INSERT INTO contacts (
            org_id, created_by, first_name, last_name, email, phone, 
            company, job_title, source, status, address, city, state, country, postal_code, notes
          ) 
          VALUES (
            p_org_id,
            p_user_id,
            COALESCE(v_record.raw_data->>'first_name', ''),
            v_record.raw_data->>'last_name',
            v_record.raw_data->>'email',
            v_record.raw_data->>'phone',
            v_record.raw_data->>'company',
            v_record.raw_data->>'job_title',
            COALESCE(v_record.raw_data->>'source', 'bulk_import'),
            COALESCE(v_record.raw_data->>'status', 'new'),
            v_record.raw_data->>'address',
            v_record.raw_data->>'city',
            v_record.raw_data->>'state',
            v_record.raw_data->>'country',
            v_record.raw_data->>'postal_code',
            v_record.raw_data->>'notes'
          )
          ON CONFLICT DO NOTHING
          RETURNING id INTO v_new_record_id;

        WHEN 'inventory' THEN
          INSERT INTO inventory_items (
            org_id, created_by, import_job_id, item_id_sku, item_name, 
            uom, available_qty, selling_price, pending_po, pending_so, amount
          )
          VALUES (
            p_org_id,
            p_user_id,
            p_import_id,
            v_record.raw_data->>'item_id_sku',
            v_record.raw_data->>'item_name',
            v_record.raw_data->>'uom',
            COALESCE((v_record.raw_data->>'available_qty')::numeric, 0),
            (v_record.raw_data->>'selling_price')::numeric,
            COALESCE((v_record.raw_data->>'pending_po')::integer, 0),
            COALESCE((v_record.raw_data->>'pending_so')::integer, 0),
            COALESCE((v_record.raw_data->>'amount')::numeric, 0)
          )
          ON CONFLICT (org_id, item_id_sku) DO UPDATE SET
            item_name = EXCLUDED.item_name,
            uom = EXCLUDED.uom,
            available_qty = EXCLUDED.available_qty,
            selling_price = EXCLUDED.selling_price,
            pending_po = EXCLUDED.pending_po,
            pending_so = EXCLUDED.pending_so,
            amount = EXCLUDED.amount,
            updated_at = now()
          RETURNING id INTO v_new_record_id;

        WHEN 'redefine_repository' THEN
          INSERT INTO redefine_data_repository (
            org_id, created_by, email, first_name, last_name, phone,
            company, job_title, source, linkedin_url, city, state, country
          )
          VALUES (
            p_org_id,
            p_user_id,
            v_record.raw_data->>'email',
            v_record.raw_data->>'first_name',
            v_record.raw_data->>'last_name',
            v_record.raw_data->>'phone',
            v_record.raw_data->>'company',
            v_record.raw_data->>'job_title',
            COALESCE(v_record.raw_data->>'source', 'bulk_import'),
            v_record.raw_data->>'linkedin_url',
            v_record.raw_data->>'city',
            v_record.raw_data->>'state',
            v_record.raw_data->>'country'
          )
          ON CONFLICT DO NOTHING
          RETURNING id INTO v_new_record_id;

        ELSE
          -- Unsupported table
          v_failed := v_failed + 1;
          v_errors := v_errors || jsonb_build_object(
            'row', v_record.row_number,
            'error', 'Unsupported table: ' || p_table_name
          );
          CONTINUE;
      END CASE;

      -- Track the inserted record for revert capability
      IF v_new_record_id IS NOT NULL THEN
        INSERT INTO bulk_import_records (import_id, record_id, table_name, row_number)
        VALUES (p_import_id, v_new_record_id, p_table_name, v_record.row_number);
        v_inserted := v_inserted + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;

      -- Mark as processed
      UPDATE import_staging SET processed = true WHERE id = v_record.id;
      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object(
        'row', v_record.row_number,
        'error', SQLERRM
      );
      -- Mark as processed even on error
      UPDATE import_staging SET processed = true WHERE id = v_record.id;
      v_processed := v_processed + 1;
    END;
  END LOOP;

  -- Clean up staging records for this import
  DELETE FROM import_staging WHERE import_id = p_import_id;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'failed', v_failed,
    'errors', v_errors
  );
END;
$$;


--
-- Name: process_time_based_triggers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_time_based_triggers() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  rule_record RECORD;
  contact_record RECORD;
  trigger_date TIMESTAMPTZ;
  relative_days INTEGER;
BEGIN
  -- Loop through all active time-based rules
  FOR rule_record IN 
    SELECT * FROM email_automation_rules 
    WHERE trigger_type = 'time_based' 
    AND is_active = true
  LOOP
    relative_days := COALESCE((rule_record.trigger_config->>'relative_days')::INTEGER, 0);
    
    -- Check contacts that match the time criteria
    IF rule_record.trigger_config->>'trigger_date_type' = 'contact_created' THEN
      FOR contact_record IN
        SELECT id, org_id, created_at
        FROM contacts
        WHERE org_id = rule_record.org_id
        AND DATE(created_at + (relative_days || ' days')::INTERVAL) = CURRENT_DATE
      LOOP
        PERFORM net.http_post(
          url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/automation-trigger-handler',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := jsonb_build_object(
            'orgId', contact_record.org_id,
            'triggerType', 'time_based',
            'contactId', contact_record.id,
            'triggerData', jsonb_build_object(
              'trigger_date_type', 'contact_created',
              'relative_days', relative_days,
              'contact_created_at', contact_record.created_at
            )
          )
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;


--
-- Name: refresh_contacts_with_stages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_contacts_with_stages() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY contacts_with_stages;
END;
$$;


--
-- Name: revert_bulk_import(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revert_bulk_import(p_import_id uuid, p_org_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_record RECORD;
  v_deleted INTEGER := 0;
  v_table_name TEXT;
BEGIN
  -- Get the table name
  SELECT table_name INTO v_table_name 
  FROM bulk_import_history 
  WHERE id = p_import_id AND org_id = p_org_id;

  IF v_table_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Import not found');
  END IF;

  -- Delete all records from the import
  FOR v_record IN 
    SELECT record_id FROM bulk_import_records 
    WHERE import_id = p_import_id
  LOOP
    CASE v_table_name
      WHEN 'contacts' THEN
        DELETE FROM contacts WHERE id = v_record.record_id AND org_id = p_org_id;
      WHEN 'inventory' THEN
        DELETE FROM inventory_items WHERE id = v_record.record_id AND org_id = p_org_id;
      WHEN 'redefine_repository' THEN
        DELETE FROM redefine_data_repository WHERE id = v_record.record_id AND org_id = p_org_id;
    END CASE;
    v_deleted := v_deleted + 1;
  END LOOP;

  -- Update import history
  UPDATE bulk_import_history 
  SET status = 'reverted', reverted_at = now(), can_revert = false, updated_at = now()
  WHERE id = p_import_id;

  -- Clean up import records
  DELETE FROM bulk_import_records WHERE import_id = p_import_id;

  RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$$;


--
-- Name: set_task_completed_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_task_completed_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = now();
  ELSIF NEW.status != 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_ticket_deadline(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_ticket_deadline() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.due_at := CASE NEW.priority
    WHEN 'critical' THEN now() + interval '4 hours'
    WHEN 'high' THEN now() + interval '24 hours'
    WHEN 'medium' THEN now() + interval '48 hours'
    ELSE now() + interval '72 hours'
  END;
  RETURN NEW;
END;
$$;


--
-- Name: sync_inbound_email_to_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_inbound_email_to_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only create activity for inbound emails with a valid contact_id
  IF NEW.direction = 'inbound' AND NEW.contact_id IS NOT NULL THEN
    INSERT INTO contact_activities (
      org_id,
      contact_id,
      activity_type,
      subject,
      description,
      created_at,
      completed_at
    ) VALUES (
      NEW.org_id,
      NEW.contact_id,
      'email',
      'Reply: ' || NEW.subject,
      'Received email reply: ' || LEFT(NEW.email_content, 200) || CASE WHEN LENGTH(NEW.email_content) > 200 THEN '...' ELSE '' END,
      COALESCE(NEW.received_at, NEW.created_at),
      COALESCE(NEW.received_at, NEW.created_at)
    );
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: sync_outbound_email_to_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_outbound_email_to_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only create activity for outbound emails with a valid contact_id
  IF NEW.direction = 'outbound' AND NEW.contact_id IS NOT NULL THEN
    INSERT INTO contact_activities (
      org_id,
      contact_id,
      activity_type,
      subject,
      description,
      created_by,
      created_at,
      completed_at
    ) VALUES (
      NEW.org_id,
      NEW.contact_id,
      'email',
      NEW.subject,
      'Sent email: ' || LEFT(NEW.email_content, 200) || CASE WHEN LENGTH(NEW.email_content) > 200 THEN '...' ELSE '' END,
      NEW.sent_by,
      NEW.sent_at,
      NEW.sent_at
    );
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: sync_platform_email_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_platform_email_list() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Merge data from contacts.email and contact_emails
  INSERT INTO platform_email_sending_list (email, name, source_type, is_unsubscribed, first_seen_at, last_synced_at)
  SELECT DISTINCT ON (LOWER(email))
    LOWER(email) as email,
    COALESCE(name, 'Subscriber') as name,
    source_type,
    COALESCE((SELECT true FROM email_unsubscribes WHERE LOWER(email_unsubscribes.email) = LOWER(source.email) LIMIT 1), false) as is_unsubscribed,
    NOW() as first_seen_at,
    NOW() as last_synced_at
  FROM (
    -- From contacts.email
    SELECT 
      c.email,
      TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')) as name,
      'contact' as source_type
    FROM contacts c
    WHERE c.email IS NOT NULL AND c.email != ''
    
    UNION ALL
    
    -- From contact_emails with contact name lookup
    SELECT 
      ce.email,
      TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')) as name,
      'contact_email' as source_type
    FROM contact_emails ce
    LEFT JOIN contacts c ON c.id = ce.contact_id
    WHERE ce.email IS NOT NULL AND ce.email != ''
  ) source
  ORDER BY LOWER(email), LENGTH(name) DESC
  ON CONFLICT (email) 
  DO UPDATE SET
    name = CASE 
      WHEN LENGTH(COALESCE(EXCLUDED.name, '')) > LENGTH(COALESCE(platform_email_sending_list.name, ''))
      THEN EXCLUDED.name
      ELSE platform_email_sending_list.name
    END,
    last_synced_at = NOW(),
    is_unsubscribed = EXCLUDED.is_unsubscribed;
    
  -- Mark unsubscribed emails
  UPDATE platform_email_sending_list
  SET is_unsubscribed = true
  WHERE email IN (SELECT LOWER(email) FROM email_unsubscribes);
END;
$$;


--
-- Name: sync_primary_email_to_contact(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_primary_email_to_contact() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- If a primary email is being set
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.is_primary = true THEN
      -- Update the contact's email field
      UPDATE contacts 
      SET email = NEW.email, updated_at = now()
      WHERE id = NEW.contact_id AND org_id = NEW.org_id;
      
      -- Unset any other primary emails for this contact
      UPDATE contact_emails
      SET is_primary = false
      WHERE contact_id = NEW.contact_id 
        AND org_id = NEW.org_id 
        AND id != NEW.id 
        AND is_primary = true;
    END IF;
  END IF;
  
  -- If a primary email is being deleted, clear the contact's email
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_primary = true THEN
      UPDATE contacts 
      SET email = NULL, updated_at = now()
      WHERE id = OLD.contact_id AND org_id = OLD.org_id;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: sync_user_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_user_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Get email from auth.users and update profiles
  UPDATE profiles
  SET email = (
    SELECT email FROM auth.users WHERE id = NEW.id
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;


--
-- Name: track_pipeline_movement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_pipeline_movement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only track if stage actually changed
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    -- Calculate days in previous stage
    INSERT INTO pipeline_movement_history (
      contact_id,
      org_id,
      from_stage_id,
      to_stage_id,
      moved_at,
      days_in_previous_stage,
      moved_by
    ) VALUES (
      NEW.id,
      NEW.org_id,
      OLD.pipeline_stage_id,
      NEW.pipeline_stage_id,
      NOW(),
      EXTRACT(EPOCH FROM (NOW() - OLD.updated_at)) / 86400,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_activity_logged_automation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_activity_logged_automation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/automation-trigger-handler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'orgId', NEW.org_id,
      'triggerType', 'activity_logged',
      'contactId', NEW.contact_id,
      'triggerData', jsonb_build_object(
        'activity_id', NEW.id,
        'activity_type', NEW.activity_type,
        'subject', NEW.subject,
        'description', NEW.description,
        'call_duration', NEW.call_duration,
        'meeting_duration_minutes', NEW.meeting_duration_minutes
      )
    )
  );
  RETURN NEW;
END;
$$;


--
-- Name: trigger_assignment_changed_automation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_assignment_changed_automation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to OR 
     OLD.assigned_team_id IS DISTINCT FROM NEW.assigned_team_id THEN
    PERFORM net.http_post(
      url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'orgId', NEW.org_id,
        'triggerType', 'assignment_changed',
        'contactId', NEW.id,
        'triggerData', jsonb_build_object(
          'old_user_id', OLD.assigned_to,
          'new_user_id', NEW.assigned_to,
          'old_team_id', OLD.assigned_team_id,
          'new_team_id', NEW.assigned_team_id
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_auto_enrichment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_auto_enrichment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_config JSONB;
  v_auto_enrich_enabled BOOLEAN;
  v_enrich_on_create BOOLEAN;
  v_enrich_on_email_change BOOLEAN;
  v_reveal_phone BOOLEAN;
  v_reveal_email BOOLEAN;
  v_should_enrich BOOLEAN := false;
BEGIN
  -- Get apollo_config from organizations table
  SELECT apollo_config INTO v_config
  FROM organizations
  WHERE id = NEW.org_id;

  -- Extract configuration values
  v_auto_enrich_enabled := COALESCE((v_config->>'autoEnrichEnabled')::boolean, false);
  v_enrich_on_create := COALESCE((v_config->>'enrichOnCreate')::boolean, false);
  v_enrich_on_email_change := COALESCE((v_config->>'enrichOnEmailChange')::boolean, false);
  v_reveal_phone := COALESCE((v_config->>'defaultRevealPhone')::boolean, false);
  v_reveal_email := COALESCE((v_config->>'defaultRevealEmail')::boolean, false);

  -- Check if auto-enrichment is enabled
  IF NOT v_auto_enrich_enabled THEN
    RETURN NEW;
  END IF;

  -- Determine if we should enrich
  IF TG_OP = 'INSERT' AND v_enrich_on_create AND NEW.email IS NOT NULL THEN
    v_should_enrich := true;
  ELSIF TG_OP = 'UPDATE' AND v_enrich_on_email_change 
    AND OLD.email IS DISTINCT FROM NEW.email 
    AND NEW.email IS NOT NULL THEN
    v_should_enrich := true;
  END IF;

  -- Trigger enrichment if conditions are met
  IF v_should_enrich THEN
    PERFORM extensions.net.http_post(
      url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/enrich-contact',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpemdweGFxdnR2dnFhcnpqbXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MTcwNzYsImV4cCI6MjA3NTE5MzA3Nn0.eBLy2zBEiZoLiDXFpLupi7bUOaOk4XNJo_wEIiLuLpE'
      ),
      body := jsonb_build_object(
        'contactId', NEW.id,
        'revealPhoneNumber', v_reveal_phone,
        'revealPersonalEmail', v_reveal_email
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trigger_blog_post_email_campaign(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_blog_post_email_campaign() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  template_id UUID;
  campaign_id UUID;
  supabase_url TEXT := 'https://knuewnenaswscgaldjej.supabase.co';
BEGIN
  -- Only proceed if status is 'posted' and social is posted
  IF NEW.status = 'posted' AND NEW.social_posted = true THEN
    
    -- Get "Blog Announcement" email template
    SELECT id INTO template_id
    FROM email_templates
    WHERE org_id = NEW.org_id
      AND name = 'Blog Announcement'
      AND is_active = true
    LIMIT 1;
    
    -- If no template found, log and skip
    IF template_id IS NULL THEN
      RAISE NOTICE 'No blog announcement template found for org %', NEW.org_id;
      RETURN NEW;
    END IF;
    
    -- Create bulk email campaign
    INSERT INTO email_bulk_campaigns (
      org_id,
      campaign_name,
      template_id,
      status,
      variable_mappings,
      created_at
    )
    VALUES (
      NEW.org_id,
      'Blog: ' || NEW.blog_title,
      template_id,
      'pending',
      jsonb_build_object(
        'blog_title', NEW.blog_title,
        'blog_url', NEW.blog_url,
        'blog_excerpt', COALESCE(NEW.blog_excerpt, ''),
        'featured_image_url', COALESCE(NEW.featured_image_url, '')
      ),
      NOW()
    )
    RETURNING id INTO campaign_id;
    
    -- Update blog post with campaign_id
    UPDATE blog_posts
    SET campaign_id = campaign_id,
        updated_at = NOW()
    WHERE id = NEW.id;
    
    -- Insert recipients from platform_email_sending_list (all users across all orgs)
    INSERT INTO email_campaign_recipients (
      campaign_id,
      org_id,
      contact_email,
      contact_name,
      status,
      created_at
    )
    SELECT 
      campaign_id,
      NEW.org_id,
      email,
      name,
      'pending',
      NOW()
    FROM platform_email_sending_list
    WHERE is_unsubscribed = false 
      AND bounce_count < 3;
    
    -- Call bulk email sender function
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-bulk-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'sub'
      ),
      body := jsonb_build_object(
        'campaignId', campaign_id,
        'orgId', NEW.org_id
      )
    );
    
    RAISE NOTICE 'Blog campaign created: % for blog post: %', campaign_id, NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: trigger_disposition_set_automation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_disposition_set_automation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  -- Trigger when disposition is set (either INSERT with disposition or UPDATE changing disposition)
  IF (TG_OP = 'INSERT' AND NEW.call_disposition_id IS NOT NULL) OR
     (TG_OP = 'UPDATE' AND OLD.call_disposition_id IS DISTINCT FROM NEW.call_disposition_id AND NEW.call_disposition_id IS NOT NULL) THEN
    PERFORM net.http_post(
      url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'orgId', NEW.org_id,
        'triggerType', 'disposition_set',
        'contactId', NEW.contact_id,
        'triggerData', jsonb_build_object(
          'activity_id', NEW.id,
          'activity_type', NEW.activity_type,
          'disposition_id', NEW.call_disposition_id,
          'sub_disposition_id', NEW.call_sub_disposition_id,
          'subject', NEW.subject
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_email_engagement_automation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_email_engagement_automation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  supabase_url TEXT;
BEGIN
  supabase_url := 'https://knuewnenaswscgaldjej.supabase.co';

  -- Trigger on first open
  IF OLD.opened_at IS NULL AND NEW.opened_at IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'orgId', NEW.org_id,
        'triggerType', 'email_engagement',
        'contactId', NEW.contact_id,
        'triggerData', jsonb_build_object(
          'engagement_type', 'opened',
          'email_id', NEW.id,
          'conversation_id', NEW.conversation_id,
          'opened_at', NEW.opened_at
        )
      )
    );
  END IF;

  -- Trigger on first click
  IF OLD.first_clicked_at IS NULL AND NEW.first_clicked_at IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'orgId', NEW.org_id,
        'triggerType', 'email_engagement',
        'contactId', NEW.contact_id,
        'triggerData', jsonb_build_object(
          'engagement_type', 'clicked',
          'email_id', NEW.id,
          'conversation_id', NEW.conversation_id,
          'clicked_at', NEW.first_clicked_at
        )
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trigger_field_updated_automation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_field_updated_automation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  IF OLD.field_value IS DISTINCT FROM NEW.field_value THEN
    PERFORM net.http_post(
      url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'orgId', (SELECT org_id FROM contacts WHERE id = NEW.contact_id),
        'triggerType', 'field_updated',
        'contactId', NEW.contact_id,
        'triggerData', jsonb_build_object(
          'custom_field_id', NEW.custom_field_id,
          'field_id', NEW.custom_field_id,
          'old_value', OLD.field_value,
          'new_value', NEW.field_value
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_outbound_webhook(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_outbound_webhook() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  trigger_event_name TEXT;
  trigger_data_json JSONB;
  target_org_id UUID;
BEGIN
  -- Determine event type from TG_ARGV
  trigger_event_name := TG_ARGV[0];
  
  -- Get org_id
  target_org_id := COALESCE(NEW.org_id, OLD.org_id);
  
  -- Build trigger data based on operation
  IF TG_OP = 'INSERT' THEN
    trigger_data_json := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    trigger_data_json := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    trigger_data_json := to_jsonb(OLD);
  END IF;
  
  -- Call edge function asynchronously
  PERFORM net.http_post(
    url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/outbound-webhook-handler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'orgId', target_org_id,
      'triggerEvent', trigger_event_name,
      'triggerData', trigger_data_json
    )
  );
  
  RETURN NEW;
END;
$$;


--
-- Name: trigger_outbound_webhook_generic(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_outbound_webhook_generic() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  trigger_data_json JSONB;
  target_org_id UUID;
  operation_name TEXT;
BEGIN
  -- Get org_id (must exist in the row)
  target_org_id := COALESCE(NEW.org_id, OLD.org_id);
  
  -- Build event name and data based on operation
  IF TG_OP = 'INSERT' THEN
    operation_name := TG_TABLE_NAME || '_created';
    trigger_data_json := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    operation_name := TG_TABLE_NAME || '_updated';
    trigger_data_json := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    operation_name := TG_TABLE_NAME || '_deleted';
    trigger_data_json := to_jsonb(OLD);
  END IF;
  
  -- Call edge function
  PERFORM net.http_post(
    url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/outbound-webhook-handler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'orgId', target_org_id,
      'triggerEvent', operation_name,
      'triggerData', trigger_data_json,
      'tableName', TG_TABLE_NAME,
      'operation', TG_OP
    )
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: trigger_retry_failed_whatsapp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_retry_failed_whatsapp() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/retry-failed-whatsapp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;


--
-- Name: trigger_stage_change_automation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_stage_change_automation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  auth_header TEXT;
BEGIN
  -- Only trigger if pipeline_stage_id actually changed
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    -- Safely get authorization header, default to empty if not available
    BEGIN
      auth_header := COALESCE(
        current_setting('request.headers', true)::json->>'authorization',
        ''
      );
    EXCEPTION WHEN OTHERS THEN
      auth_header := '';
    END;
    
    PERFORM net.http_post(
      url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/automation-trigger-handler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', CASE WHEN auth_header != '' THEN 'Bearer ' || auth_header ELSE '' END
      ),
      body := jsonb_build_object(
        'orgId', NEW.org_id,
        'triggerType', 'stage_change',
        'contactId', NEW.id,
        'triggerData', jsonb_build_object(
          'from_stage_id', OLD.pipeline_stage_id,
          'to_stage_id', NEW.pipeline_stage_id
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_tag_assigned_automation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_tag_assigned_automation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/automation-trigger-handler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'orgId', NEW.org_id,
      'triggerType', 'tag_assigned',
      'contactId', NEW.contact_id,
      'triggerData', jsonb_build_object(
        'tag_id', NEW.tag_id,
        'assigned_by', NEW.assigned_by
      )
    )
  );
  RETURN NEW;
END;
$$;


--
-- Name: update_chat_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_chat_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_conversation_last_message_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_conversation_last_message_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE chat_conversations
  SET last_message_at = NEW.created_at, updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_lead_score(uuid, uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_lead_score(_contact_id uuid, _org_id uuid, _score_delta integer, _reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  old_score INTEGER;
  new_score INTEGER;
  old_category TEXT;
  new_category TEXT;
BEGIN
  -- Get current score
  SELECT score, score_category INTO old_score, old_category
  FROM contact_lead_scores
  WHERE contact_id = _contact_id;

  IF NOT FOUND THEN
    old_score := 0;
    old_category := 'cold';
  END IF;

  -- Calculate new score
  new_score := old_score + _score_delta;
  new_score := GREATEST(0, LEAST(100, new_score)); -- Clamp between 0-100

  -- Determine category
  new_category := CASE
    WHEN new_score >= 70 THEN 'hot'
    WHEN new_score >= 40 THEN 'warm'
    ELSE 'cold'
  END;

  -- Upsert score
  INSERT INTO contact_lead_scores (
    org_id, contact_id, score, score_category, last_calculated,
    score_breakdown
  )
  VALUES (
    _org_id, _contact_id, new_score, new_category, NOW(),
    jsonb_build_object(_reason, _score_delta)
  )
  ON CONFLICT (contact_id)
  DO UPDATE SET
    score = new_score,
    score_category = new_category,
    last_calculated = NOW(),
    score_breakdown = contact_lead_scores.score_breakdown || jsonb_build_object(_reason, _score_delta);

  -- Trigger automation if score changed significantly or category changed
  IF old_category IS DISTINCT FROM new_category OR ABS(old_score - new_score) >= 10 THEN
    PERFORM net.http_post(
      url := 'https://knuewnenaswscgaldjej.supabase.co/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'orgId', _org_id,
        'triggerType', 'lead_score_change',
        'contactId', _contact_id,
        'triggerData', jsonb_build_object(
          'old_score', old_score,
          'new_score', new_score,
          'old_category', old_category,
          'new_category', new_category,
          'reason', _reason
        )
      )
    );
  END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION update_updated_at_column(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_updated_at_column() IS 'Trigger function to auto-update updated_at timestamps - SECURITY DEFINER with locked search_path';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    user_id uuid,
    contact_id uuid,
    email text NOT NULL,
    name text NOT NULL,
    response_status text DEFAULT 'pending'::text,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT activity_participants_response_status_check CHECK ((response_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'maybe'::text])))
);


--
-- Name: agent_call_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_call_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid,
    exotel_call_sid text,
    status text DEFAULT 'initiating'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone
);


--
-- Name: api_key_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_key_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    api_key_id uuid NOT NULL,
    org_id uuid NOT NULL,
    endpoint text NOT NULL,
    method text NOT NULL,
    status_code integer NOT NULL,
    response_time_ms integer,
    ip_address inet,
    user_agent text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    key_name text NOT NULL,
    api_key text NOT NULL,
    key_prefix text NOT NULL,
    permissions jsonb DEFAULT '{"endpoints": []}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: approval_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    approval_type_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    threshold_amount numeric(12,2),
    required_roles text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: approval_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automation_ab_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_ab_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    test_name text NOT NULL,
    variants jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    winner_variant text,
    start_date timestamp with time zone DEFAULT now() NOT NULL,
    end_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automation_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    execution_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by uuid,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    rejection_reason text,
    approval_notes text,
    expires_at timestamp with time zone
);


--
-- Name: automation_performance_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_performance_daily (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    rule_id uuid,
    report_date date NOT NULL,
    total_triggered integer DEFAULT 0,
    total_sent integer DEFAULT 0,
    total_failed integer DEFAULT 0,
    total_opened integer DEFAULT 0,
    total_clicked integer DEFAULT 0,
    total_converted integer DEFAULT 0,
    unique_opens integer DEFAULT 0,
    unique_clicks integer DEFAULT 0,
    avg_time_to_open_minutes numeric(10,2),
    avg_time_to_click_minutes numeric(10,2),
    avg_time_to_convert_minutes numeric(10,2),
    total_conversion_value numeric(12,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    blog_url text NOT NULL,
    blog_title text NOT NULL,
    blog_excerpt text,
    publish_date date NOT NULL,
    social_posted boolean DEFAULT false NOT NULL,
    email_campaign_sent boolean DEFAULT false NOT NULL,
    twitter_url text,
    linkedin_url text,
    facebook_url text,
    campaign_id uuid,
    email_recipients_count integer,
    posted_timestamp timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    featured_image_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['posted'::text, 'failed'::text, 'pending'::text, 'partial'::text, 'skipped'::text])))
);


--
-- Name: TABLE blog_posts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.blog_posts IS 'Tracks blog posts distributed across social media and email campaigns';


--
-- Name: bulk_import_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_import_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    table_name text NOT NULL,
    file_name text NOT NULL,
    status public.import_status DEFAULT 'pending'::public.import_status,
    total_records integer NOT NULL,
    processed_records integer DEFAULT 0,
    successful_records integer DEFAULT 0,
    failed_records integer DEFAULT 0,
    current_batch integer DEFAULT 0,
    total_batches integer NOT NULL,
    error_log jsonb DEFAULT '[]'::jsonb,
    can_revert boolean DEFAULT true,
    reverted_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bulk_import_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_import_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_id uuid NOT NULL,
    record_id uuid NOT NULL,
    table_name text NOT NULL,
    row_number integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: calendar_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    shared_with_id uuid NOT NULL,
    permission text DEFAULT 'view'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT calendar_shares_permission_check CHECK ((permission = ANY (ARRAY['view'::text, 'edit'::text])))
);


--
-- Name: call_dispositions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_dispositions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: call_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid,
    agent_id uuid,
    exotel_call_sid text NOT NULL,
    exotel_conversation_uuid text,
    call_type text NOT NULL,
    from_number text NOT NULL,
    to_number text NOT NULL,
    direction text NOT NULL,
    status text NOT NULL,
    call_duration integer,
    ring_duration integer,
    conversation_duration integer,
    started_at timestamp with time zone,
    answered_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    recording_url text,
    recording_duration integer,
    disposition_id uuid,
    sub_disposition_id uuid,
    exotel_raw_data jsonb,
    notes text,
    activity_id uuid,
    CONSTRAINT call_logs_call_type_check CHECK ((call_type = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: call_sub_dispositions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_sub_dispositions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    disposition_id uuid NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: campaign_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    campaign_type text NOT NULL,
    date date NOT NULL,
    spend numeric DEFAULT 0,
    conversions integer DEFAULT 0,
    revenue numeric DEFAULT 0,
    cpa numeric DEFAULT 0,
    roas numeric DEFAULT 0,
    click_count integer DEFAULT 0,
    open_count integer DEFAULT 0,
    bounce_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT campaign_analytics_campaign_type_check CHECK ((campaign_type = ANY (ARRAY['email'::text, 'whatsapp'::text])))
);


--
-- Name: campaign_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    campaign_id uuid,
    priority text NOT NULL,
    insight_type text NOT NULL,
    title text NOT NULL,
    description text,
    impact text,
    supporting_data jsonb DEFAULT '{}'::jsonb,
    analysis text,
    suggested_action text,
    status text DEFAULT 'active'::text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT campaign_insights_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT campaign_insights_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ignored'::text, 'applied'::text, 'dismissed'::text])))
);


--
-- Name: carry_forward_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carry_forward_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    captured_at timestamp with time zone DEFAULT now(),
    reference_year integer DEFAULT 2026 NOT NULL,
    qualified_contact_ids uuid[] DEFAULT '{}'::uuid[],
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    conversation_type text DEFAULT 'direct'::text NOT NULL,
    name text,
    created_by uuid,
    last_message_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_conversations_conversation_type_check CHECK ((conversation_type = ANY (ARRAY['direct'::text, 'group'::text])))
);


--
-- Name: chat_message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_message_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text,
    message_type text DEFAULT 'text'::text NOT NULL,
    task_id uuid,
    file_url text,
    file_name text,
    file_size integer,
    is_edited boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'file'::text, 'task_share'::text])))
);


--
-- Name: chat_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_admin boolean DEFAULT false,
    last_read_at timestamp with time zone DEFAULT now(),
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_alternate_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_alternate_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    designation text,
    email text,
    phone text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: client_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    org_id uuid NOT NULL,
    document_name text NOT NULL,
    document_type text DEFAULT 'other'::text NOT NULL,
    file_url text,
    external_link text,
    description text,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_id uuid,
    external_entity_id uuid,
    CONSTRAINT client_documents_entity_check CHECK (((client_id IS NOT NULL) OR (contact_id IS NOT NULL) OR (external_entity_id IS NOT NULL)))
);


--
-- Name: client_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    org_id uuid NOT NULL,
    invoice_number text NOT NULL,
    invoice_date date NOT NULL,
    due_date date,
    amount numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    file_url text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tax_amount numeric DEFAULT 0,
    document_type text DEFAULT 'invoice'::text,
    converted_from_quotation_id uuid,
    contact_id uuid,
    external_entity_id uuid,
    payment_received_date date,
    gst_rate numeric DEFAULT 0,
    tds_amount numeric DEFAULT 0,
    net_received_amount numeric DEFAULT 0,
    actual_payment_received numeric,
    CONSTRAINT client_invoices_document_type_check CHECK ((document_type = ANY (ARRAY['quotation'::text, 'invoice'::text]))),
    CONSTRAINT client_invoices_entity_check CHECK (((client_id IS NOT NULL) OR (contact_id IS NOT NULL) OR (external_entity_id IS NOT NULL)))
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    converted_at timestamp with time zone DEFAULT now() NOT NULL,
    converted_by uuid,
    first_name text NOT NULL,
    last_name text,
    email text,
    phone text,
    company text,
    job_title text,
    address text,
    city text,
    state text,
    country text,
    postal_code text,
    notes text,
    last_discussion text,
    last_discussion_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text,
    status_updated_at timestamp with time zone,
    CONSTRAINT clients_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'churned'::text])))
);


--
-- Name: communication_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    template_id text NOT NULL,
    template_name text NOT NULL,
    template_type text NOT NULL,
    category text,
    language text,
    content text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'approved'::text,
    last_synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    submission_status text DEFAULT 'synced'::text,
    rejection_reason text,
    header_type text,
    header_content text,
    footer_text text,
    buttons jsonb DEFAULT '[]'::jsonb,
    sample_values jsonb DEFAULT '{}'::jsonb,
    submitted_at timestamp with time zone,
    approved_at timestamp with time zone,
    CONSTRAINT communication_templates_header_type_check CHECK ((header_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'document'::text]))),
    CONSTRAINT communication_templates_submission_status_check CHECK ((submission_status = ANY (ARRAY['draft'::text, 'pending_submission'::text, 'synced'::text, 'rejected'::text]))),
    CONSTRAINT communication_templates_template_type_check CHECK ((template_type = ANY (ARRAY['whatsapp'::text, 'email'::text, 'sms'::text])))
);


--
-- Name: connector_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connector_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_id uuid,
    org_id uuid NOT NULL,
    request_id text NOT NULL,
    status text NOT NULL,
    http_status_code integer NOT NULL,
    request_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    response_payload jsonb DEFAULT '{}'::jsonb,
    contact_id uuid,
    error_message text,
    ip_address inet,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT connector_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'duplicate'::text, 'error'::text])))
);


--
-- Name: contact_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid,
    activity_type text NOT NULL,
    subject text,
    description text,
    call_disposition_id uuid,
    call_sub_disposition_id uuid,
    call_duration integer,
    scheduled_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    check_in_latitude numeric(10,8),
    check_in_longitude numeric(11,8),
    check_out_latitude numeric(10,8),
    check_out_longitude numeric(11,8),
    location_accuracy numeric(6,2),
    duration_minutes integer,
    meeting_link text,
    meeting_platform text DEFAULT 'google_meet'::text,
    reminder_sent boolean DEFAULT false,
    meeting_duration_minutes integer,
    google_calendar_event_id text,
    next_action_date timestamp with time zone,
    next_action_notes text,
    morning_reminder_sent boolean DEFAULT false,
    pre_action_reminder_sent boolean DEFAULT false,
    recurring_pattern_id uuid,
    priority text DEFAULT 'normal'::text,
    CONSTRAINT contact_activities_priority_check CHECK ((priority = ANY (ARRAY['urgent'::text, 'important'::text, 'normal'::text])))
);


--
-- Name: TABLE contact_activities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contact_activities IS 'Contains sales activity data - restricted to organization members only';


--
-- Name: COLUMN contact_activities.duration_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contact_activities.duration_minutes IS 'Duration of visit in minutes (check-out time - check-in time)';


--
-- Name: contact_custom_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_custom_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    custom_field_id uuid NOT NULL,
    field_value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    org_id uuid NOT NULL,
    email text NOT NULL,
    email_type text DEFAULT 'work'::text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE contact_emails; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contact_emails IS 'Contains customer contact data - restricted to organization members only';


--
-- Name: contact_enrichment_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_enrichment_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    enrichment_source text DEFAULT 'apollo'::text NOT NULL,
    enriched_data jsonb,
    fields_enriched text[],
    credits_used integer DEFAULT 0,
    success boolean NOT NULL,
    error_message text,
    enriched_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: contact_enrichment_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_enrichment_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    contacts_processed integer DEFAULT 0,
    contacts_enriched integer DEFAULT 0,
    contacts_failed integer DEFAULT 0,
    credits_used integer DEFAULT 0,
    status text DEFAULT 'running'::text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_lead_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_lead_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    score_category text,
    last_calculated timestamp with time zone DEFAULT now() NOT NULL,
    score_breakdown jsonb DEFAULT '{}'::jsonb
);


--
-- Name: contact_phones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_phones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    org_id uuid NOT NULL,
    phone text NOT NULL,
    phone_type text DEFAULT 'mobile'::text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE contact_phones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contact_phones IS 'Contains customer contact data - restricted to organization members only';


--
-- Name: contact_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_tag_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid
);


--
-- Name: contact_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#3b82f6'::text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text,
    email text,
    phone text,
    company text,
    job_title text,
    status text DEFAULT 'new'::text,
    source text,
    pipeline_stage_id uuid,
    assigned_to uuid,
    assigned_team_id uuid,
    address text,
    city text,
    state text,
    country text,
    postal_code text,
    website text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    linkedin_url text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    last_verified_location_at timestamp with time zone,
    referred_by text,
    twitter_url text,
    github_url text,
    facebook_url text,
    photo_url text,
    headline text,
    seniority text,
    departments text[],
    person_locations jsonb,
    employment_history jsonb,
    education jsonb,
    phone_numbers jsonb,
    organization_name text,
    organization_founded_year integer,
    organization_industry text,
    organization_keywords text[],
    last_enriched_at timestamp with time zone,
    enrichment_status text,
    apollo_person_id text,
    industry_type text,
    nature_of_business text
);


--
-- Name: COLUMN contacts.linkedin_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.linkedin_url IS 'LinkedIn profile URL from Apollo';


--
-- Name: COLUMN contacts.last_verified_location_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.last_verified_location_at IS 'Timestamp of last field visit check-out (latest GPS verification)';


--
-- Name: COLUMN contacts.enrichment_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.enrichment_status IS 'Status: pending, enriched, failed, partial, or NULL if never enriched';


--
-- Name: pipeline_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    stage_order integer NOT NULL,
    probability integer DEFAULT 0,
    color text DEFAULT '#01B8AA'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pipeline_stages_probability_check CHECK (((probability >= 0) AND (probability <= 100)))
);


--
-- Name: contacts_with_stages; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.contacts_with_stages AS
 SELECT c.id,
    c.org_id,
    c.first_name,
    c.last_name,
    c.email,
    c.phone,
    c.company,
    c.job_title,
    c.status,
    c.pipeline_stage_id,
    ps.name AS stage_name,
    ps.stage_order,
    c.created_at,
    c.updated_at,
    c.assigned_to
   FROM (public.contacts c
     LEFT JOIN public.pipeline_stages ps ON ((c.pipeline_stage_id = ps.id)))
  WITH NO DATA;


--
-- Name: custom_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    field_name text NOT NULL,
    field_label text NOT NULL,
    field_type text NOT NULL,
    field_options jsonb,
    is_required boolean DEFAULT false,
    is_active boolean DEFAULT true,
    field_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    applies_to_table text NOT NULL,
    CONSTRAINT check_applies_to_table CHECK ((applies_to_table = ANY (ARRAY['contacts'::text, 'redefine_data_repository'::text, 'inventory_items'::text, 'all'::text])))
);


--
-- Name: TABLE custom_fields; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.custom_fields IS 'Contains business process configuration - restricted to organization members only';


--
-- Name: designation_feature_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designation_feature_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    designation_id uuid NOT NULL,
    org_id uuid NOT NULL,
    feature_key text NOT NULL,
    can_view boolean DEFAULT true,
    can_create boolean DEFAULT false,
    can_edit boolean DEFAULT false,
    can_delete boolean DEFAULT false,
    custom_permissions jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: designations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    role public.app_role NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_automation_cooldowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_automation_cooldowns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    last_sent_at timestamp with time zone NOT NULL,
    send_count integer DEFAULT 1
);


--
-- Name: email_automation_daily_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_automation_daily_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    send_date date DEFAULT CURRENT_DATE NOT NULL,
    email_count integer DEFAULT 1 NOT NULL,
    last_sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_automation_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_automation_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    trigger_type text NOT NULL,
    trigger_data jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    scheduled_for timestamp with time zone,
    sent_at timestamp with time zone,
    error_message text,
    email_template_id uuid,
    email_subject text,
    email_conversation_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ab_test_id uuid,
    ab_variant_name text,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 3,
    next_retry_at timestamp with time zone,
    converted_at timestamp with time zone,
    conversion_value numeric(10,2),
    conversion_type text,
    CONSTRAINT email_automation_executions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: email_automation_rule_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_automation_rule_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_id uuid NOT NULL,
    depends_on_rule_id uuid NOT NULL,
    dependency_type text NOT NULL,
    delay_minutes integer DEFAULT 0,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_automation_rule_dependencies_check CHECK ((rule_id <> depends_on_rule_id))
);


--
-- Name: email_automation_rule_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_automation_rule_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    icon text,
    trigger_type text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    conditions jsonb DEFAULT '[]'::jsonb,
    condition_logic text DEFAULT 'AND'::text,
    send_delay_minutes integer DEFAULT 0,
    cooldown_period_days integer DEFAULT 3,
    priority integer DEFAULT 50,
    is_popular boolean DEFAULT false,
    use_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_automation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_automation_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    trigger_type text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    condition_logic text DEFAULT 'AND'::text,
    conditions jsonb DEFAULT '[]'::jsonb,
    email_template_id uuid,
    send_delay_minutes integer DEFAULT 0,
    max_sends_per_contact integer,
    cooldown_period_days integer DEFAULT 3,
    priority integer DEFAULT 50,
    total_triggered integer DEFAULT 0,
    total_sent integer DEFAULT 0,
    total_failed integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    send_at_specific_time time without time zone,
    send_on_business_days_only boolean DEFAULT false,
    enforce_business_hours boolean DEFAULT false NOT NULL,
    ab_test_enabled boolean DEFAULT false NOT NULL,
    requires_approval boolean DEFAULT false,
    approval_timeout_hours integer DEFAULT 24,
    CONSTRAINT email_automation_rules_condition_logic_check CHECK ((condition_logic = ANY (ARRAY['AND'::text, 'OR'::text]))),
    CONSTRAINT email_automation_rules_cooldown_period_days_check CHECK (((cooldown_period_days IS NULL) OR (cooldown_period_days > 0))),
    CONSTRAINT email_automation_rules_max_sends_per_contact_check CHECK (((max_sends_per_contact IS NULL) OR (max_sends_per_contact > 0))),
    CONSTRAINT email_automation_rules_priority_check CHECK (((priority >= 0) AND (priority <= 100))),
    CONSTRAINT email_automation_rules_send_delay_minutes_check CHECK ((send_delay_minutes >= 0)),
    CONSTRAINT email_automation_rules_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['stage_change'::text, 'disposition_set'::text, 'activity_logged'::text, 'field_updated'::text, 'inactivity'::text, 'time_based'::text, 'assignment_changed'::text])))
);


--
-- Name: email_bulk_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_bulk_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    template_id uuid,
    subject text NOT NULL,
    html_content text NOT NULL,
    total_recipients integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    pending_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variable_mappings jsonb DEFAULT '{}'::jsonb,
    body_content text,
    buttons jsonb DEFAULT '[]'::jsonb,
    attachments jsonb DEFAULT '[]'::jsonb
);


--
-- Name: COLUMN email_bulk_campaigns.variable_mappings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_bulk_campaigns.variable_mappings IS 'Maps template variables to data sources (CRM field, CSV column, or static value)';


--
-- Name: COLUMN email_bulk_campaigns.body_content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_bulk_campaigns.body_content IS 'Main email body content with variables';


--
-- Name: COLUMN email_bulk_campaigns.buttons; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_bulk_campaigns.buttons IS 'Array of CTA button objects';


--
-- Name: COLUMN email_bulk_campaigns.attachments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_bulk_campaigns.attachments IS 'Array of image/video attachment objects';


--
-- Name: email_campaign_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaign_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    contact_id uuid,
    email text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_data jsonb DEFAULT '{}'::jsonb,
    tracking_pixel_id text,
    delivered_at timestamp with time zone,
    bounced_at timestamp with time zone,
    bounce_reason text,
    opened_at timestamp with time zone,
    open_count integer DEFAULT 0,
    first_clicked_at timestamp with time zone,
    click_count integer DEFAULT 0,
    complained_at timestamp with time zone,
    button_clicks jsonb DEFAULT '[]'::jsonb,
    resend_email_id text
);


--
-- Name: COLUMN email_campaign_recipients.custom_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_campaign_recipients.custom_data IS 'Stores row-specific data from CSV upload for this recipient';


--
-- Name: COLUMN email_campaign_recipients.tracking_pixel_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_campaign_recipients.tracking_pixel_id IS 'Unique ID for tracking email opens and clicks';


--
-- Name: COLUMN email_campaign_recipients.delivered_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_campaign_recipients.delivered_at IS 'Timestamp when email was successfully delivered';


--
-- Name: COLUMN email_campaign_recipients.bounced_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_campaign_recipients.bounced_at IS 'Timestamp when email bounced';


--
-- Name: COLUMN email_campaign_recipients.opened_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_campaign_recipients.opened_at IS 'Timestamp of first email open';


--
-- Name: COLUMN email_campaign_recipients.first_clicked_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_campaign_recipients.first_clicked_at IS 'Timestamp of first click in email';


--
-- Name: COLUMN email_campaign_recipients.complained_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_campaign_recipients.complained_at IS 'Timestamp when recipient marked as spam';


--
-- Name: COLUMN email_campaign_recipients.button_clicks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_campaign_recipients.button_clicks IS 'Array of button click events with timestamps';


--
-- Name: COLUMN email_campaign_recipients.resend_email_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_campaign_recipients.resend_email_id IS 'Resend email ID for webhook event matching';


--
-- Name: email_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid,
    conversation_id uuid NOT NULL,
    thread_id text,
    direction text NOT NULL,
    from_email text NOT NULL,
    from_name text,
    to_email text NOT NULL,
    cc_emails text[],
    bcc_emails text[],
    subject text NOT NULL,
    email_content text NOT NULL,
    html_content text,
    has_attachments boolean DEFAULT false,
    attachments jsonb,
    status text DEFAULT 'pending'::text,
    is_read boolean DEFAULT false,
    replied_to_message_id uuid,
    provider_message_id text,
    sent_by uuid,
    sent_at timestamp with time zone DEFAULT now(),
    received_at timestamp with time zone,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reply_to_email text,
    scheduled_at timestamp with time zone,
    opened_at timestamp with time zone,
    first_clicked_at timestamp with time zone,
    open_count integer DEFAULT 0 NOT NULL,
    click_count integer DEFAULT 0 NOT NULL,
    tracking_pixel_id text,
    unsubscribe_token text,
    button_clicks jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT email_conversations_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: COLUMN email_conversations.button_clicks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_conversations.button_clicks IS 'Array of button click events: [{"button_id": "btn-1", "button_text": "Get Started", "clicked_at": "2025-01-15T10:30:00Z"}]';


--
-- Name: email_engagement_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_engagement_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid,
    hour_of_day integer NOT NULL,
    day_of_week integer NOT NULL,
    open_count integer DEFAULT 0,
    click_count integer DEFAULT 0,
    engagement_score numeric(5,2) DEFAULT 0,
    last_updated timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_engagement_patterns_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
    CONSTRAINT email_engagement_patterns_hour_of_day_check CHECK (((hour_of_day >= 0) AND (hour_of_day <= 23)))
);


--
-- Name: email_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    sending_domain text NOT NULL,
    resend_domain_id text,
    verification_status text DEFAULT 'pending'::text NOT NULL,
    dns_records jsonb DEFAULT '{}'::jsonb,
    verified_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    inbound_route_id text,
    inbound_routing_enabled boolean DEFAULT false,
    inbound_webhook_url text,
    CONSTRAINT email_settings_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text])))
);


--
-- Name: email_suppression_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_suppression_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    email text NOT NULL,
    reason text NOT NULL,
    suppressed_at timestamp with time zone DEFAULT now() NOT NULL,
    suppressed_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    design_json jsonb DEFAULT '{}'::jsonb,
    html_content text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    body_content text,
    buttons jsonb DEFAULT '[]'::jsonb,
    attachments jsonb DEFAULT '[]'::jsonb
);


--
-- Name: COLUMN email_templates.design_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_templates.design_json IS 'Deprecated - kept for backward compatibility with Unlayer templates';


--
-- Name: COLUMN email_templates.body_content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_templates.body_content IS 'Main email body content with variables';


--
-- Name: COLUMN email_templates.buttons; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_templates.buttons IS 'Array of CTA button objects';


--
-- Name: COLUMN email_templates.attachments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_templates.attachments IS 'Array of image/video attachment objects';


--
-- Name: email_unsubscribes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_unsubscribes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    email text NOT NULL,
    contact_id uuid,
    unsubscribed_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    unsubscribe_token text NOT NULL,
    user_agent text,
    ip_address inet
);


--
-- Name: error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid,
    error_type text NOT NULL,
    error_message text NOT NULL,
    error_details jsonb,
    page_url text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exotel_exophones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exotel_exophones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    phone_number text NOT NULL,
    friendly_name text,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exotel_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exotel_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    api_key text NOT NULL,
    api_token text NOT NULL,
    account_sid text NOT NULL,
    subdomain text DEFAULT 'api.exotel.com'::text NOT NULL,
    caller_id text NOT NULL,
    call_recording_enabled boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    whatsapp_enabled boolean DEFAULT false,
    whatsapp_source_number text,
    waba_id text,
    sms_enabled boolean DEFAULT false,
    sms_sender_id text
);


--
-- Name: COLUMN exotel_settings.whatsapp_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exotel_settings.whatsapp_enabled IS 'Enable WhatsApp messaging via Exotel';


--
-- Name: COLUMN exotel_settings.whatsapp_source_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exotel_settings.whatsapp_source_number IS 'WhatsApp Business number for sending messages';


--
-- Name: COLUMN exotel_settings.waba_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exotel_settings.waba_id IS 'WhatsApp Business Account ID for template sync';


--
-- Name: external_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text DEFAULT 'prospect'::text NOT NULL,
    name text NOT NULL,
    company text,
    email text,
    phone text,
    address text,
    city text,
    state text,
    country text,
    postal_code text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT external_entities_entity_type_check CHECK ((entity_type = ANY (ARRAY['prospect'::text, 'vendor'::text, 'partner'::text, 'past_client'::text, 'other'::text])))
);


--
-- Name: feature_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feature_key text NOT NULL,
    feature_name text NOT NULL,
    feature_description text,
    category text NOT NULL,
    is_premium boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: form_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_id uuid NOT NULL,
    custom_field_id uuid NOT NULL,
    field_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    connector_type text DEFAULT 'manual'::text,
    webhook_token text,
    webhook_config jsonb DEFAULT '{}'::jsonb,
    rate_limit_per_minute integer DEFAULT 60,
    CONSTRAINT forms_connector_type_check CHECK ((connector_type = ANY (ARRAY['manual'::text, 'public_form'::text, 'webhook'::text])))
);


--
-- Name: google_oauth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_oauth_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    refresh_token text NOT NULL,
    access_token text,
    token_expires_at timestamp with time zone,
    calendar_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_email text
);


--
-- Name: gst_payment_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gst_payment_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    gst_collected numeric(15,2) DEFAULT 0 NOT NULL,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    amount_paid numeric(15,2) DEFAULT 0,
    payment_date date,
    payment_reference text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT gst_payment_tracking_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT gst_payment_tracking_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'partial'::text]))),
    CONSTRAINT gst_payment_tracking_year_check CHECK (((year >= 2020) AND (year <= 2100)))
);


--
-- Name: import_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    file_name text NOT NULL,
    file_path text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    current_stage text DEFAULT 'pending'::text,
    total_rows integer DEFAULT 0,
    processed_rows integer DEFAULT 0,
    success_count integer DEFAULT 0,
    error_count integer DEFAULT 0,
    error_details jsonb DEFAULT '[]'::jsonb,
    stage_details jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    file_cleaned_up boolean DEFAULT false,
    file_cleanup_at timestamp with time zone,
    import_type text NOT NULL,
    target_id uuid
);


--
-- Name: import_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_staging (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_id uuid NOT NULL,
    row_number integer NOT NULL,
    raw_data jsonb NOT NULL,
    processed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    item_id_sku text NOT NULL,
    item_name text,
    available_qty numeric DEFAULT 0 NOT NULL,
    uom text,
    selling_price numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    import_job_id uuid,
    pending_po integer DEFAULT 0,
    pending_so integer DEFAULT 0,
    amount numeric(10,2) DEFAULT 0
);


--
-- Name: TABLE inventory_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inventory_items IS 'Inventory items table - only item_id_sku, org_id, and available_qty are required fields';


--
-- Name: invoice_import_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_import_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_id uuid NOT NULL,
    org_id uuid NOT NULL,
    file_name text NOT NULL,
    file_url text,
    extracted_data jsonb,
    client_name text,
    client_email text,
    client_phone text,
    client_company text,
    client_address text,
    invoice_number text,
    invoice_date date,
    due_date date,
    amount numeric(12,2),
    tax_amount numeric(12,2),
    currency text DEFAULT 'INR'::text,
    duplicate_status text DEFAULT 'none'::text NOT NULL,
    matched_client_id uuid,
    matched_contact_id uuid,
    potential_matches jsonb,
    action text DEFAULT 'pending'::text,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    created_client_id uuid,
    created_contact_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_import_items_action_check CHECK ((action = ANY (ARRAY['pending'::text, 'create_client'::text, 'create_lead'::text, 'link_existing'::text, 'skip'::text]))),
    CONSTRAINT invoice_import_items_duplicate_status_check CHECK ((duplicate_status = ANY (ARRAY['none'::text, 'exact_match'::text, 'potential_match'::text]))),
    CONSTRAINT invoice_import_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'extracting'::text, 'extracted'::text, 'reviewed'::text, 'processed'::text, 'failed'::text])))
);


--
-- Name: invoice_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    created_by uuid,
    total_files integer DEFAULT 0 NOT NULL,
    processed_files integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT invoice_imports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'review'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: monthly_actuals_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monthly_actuals_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    qualified_opps integer DEFAULT 0,
    proposals integer DEFAULT 0,
    deals_closed integer DEFAULT 0,
    revenue_invoiced numeric(15,2) DEFAULT 0,
    revenue_received numeric(15,2) DEFAULT 0,
    frozen_at timestamp with time zone DEFAULT now(),
    carry_forward_applied boolean DEFAULT false,
    qualified_contact_ids uuid[] DEFAULT '{}'::uuid[],
    proposal_contact_ids uuid[] DEFAULT '{}'::uuid[],
    deal_contact_ids uuid[] DEFAULT '{}'::uuid[],
    invoiced_invoice_ids uuid[] DEFAULT '{}'::uuid[],
    received_invoice_ids uuid[] DEFAULT '{}'::uuid[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT monthly_actuals_snapshot_month_check CHECK (((month >= 1) AND (month <= 12)))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    entity_type text,
    entity_id uuid,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    action_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone
);


--
-- Name: operation_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operation_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    operation_type text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    priority integer DEFAULT 50 NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb,
    error_message text,
    scheduled_at timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT operation_queue_operation_type_check CHECK ((operation_type = ANY (ARRAY['bulk_whatsapp'::text, 'template_sync'::text, 'contact_import'::text, 'webhook_lead'::text, 'bulk_email'::text]))),
    CONSTRAINT operation_queue_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: org_business_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_business_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_business_hours_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: org_feature_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_feature_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    feature_key text NOT NULL,
    is_enabled boolean DEFAULT true,
    enabled_at timestamp with time zone,
    disabled_at timestamp with time zone,
    notes text,
    modified_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: org_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    invited_by uuid NOT NULL,
    invite_code text NOT NULL,
    email text,
    role public.app_role DEFAULT 'sales_agent'::public.app_role NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    used_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organization_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    subscription_status text DEFAULT 'active'::text NOT NULL,
    billing_cycle_start date NOT NULL,
    next_billing_date date NOT NULL,
    last_payment_date date,
    user_count integer DEFAULT 0 NOT NULL,
    monthly_subscription_amount numeric DEFAULT 0 NOT NULL,
    wallet_balance numeric DEFAULT 0 NOT NULL,
    wallet_minimum_balance numeric DEFAULT 0 NOT NULL,
    wallet_last_topup_date timestamp with time zone,
    wallet_auto_topup_enabled boolean DEFAULT true,
    suspension_date timestamp with time zone,
    suspension_reason text,
    grace_period_end date,
    readonly_period_end date,
    lockout_date date,
    suspension_override_until date,
    override_reason text,
    override_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    one_time_setup_fee numeric DEFAULT 0,
    CONSTRAINT organization_subscriptions_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['active'::text, 'suspended_grace'::text, 'suspended_readonly'::text, 'suspended_locked'::text, 'cancelled'::text])))
);


--
-- Name: COLUMN organization_subscriptions.one_time_setup_fee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_subscriptions.one_time_setup_fee IS 'One-time setup fee charged when subscription is created';


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo_url text,
    primary_color text DEFAULT '#01B8AA'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    settings jsonb DEFAULT '{}'::jsonb,
    usage_limits jsonb DEFAULT '{"users": 50, "storage_gb": 10}'::jsonb,
    subscription_active boolean DEFAULT true,
    services_enabled boolean DEFAULT true,
    max_automation_emails_per_day integer DEFAULT 3,
    apollo_config jsonb DEFAULT '{"enrich_on_create": false, "auto_enrich_enabled": false, "enrich_on_email_change": false, "reveal_email_by_default": false, "reveal_phone_by_default": false}'::jsonb
);


--
-- Name: TABLE organizations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organizations IS 'Contains company configuration - restricted to organization members only';


--
-- Name: COLUMN organizations.apollo_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.apollo_config IS 'Configuration for Apollo.io data enrichment settings';


--
-- Name: outbound_webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbound_webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    org_id uuid NOT NULL,
    trigger_event text NOT NULL,
    trigger_data jsonb NOT NULL,
    payload_sent jsonb NOT NULL,
    response_status integer,
    response_body text,
    error_message text,
    retry_count integer DEFAULT 0,
    sent_at timestamp with time zone DEFAULT now(),
    succeeded boolean DEFAULT false,
    execution_time_ms integer
);


--
-- Name: outbound_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbound_webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    webhook_url text NOT NULL,
    trigger_event text NOT NULL,
    is_active boolean DEFAULT true,
    http_method text DEFAULT 'POST'::text,
    headers jsonb DEFAULT '{}'::jsonb,
    payload_template jsonb DEFAULT '{}'::jsonb,
    filter_conditions jsonb DEFAULT '{}'::jsonb,
    retry_config jsonb DEFAULT '{"max_retries": 3, "retry_delay_seconds": 2}'::jsonb,
    authentication_type text DEFAULT 'none'::text,
    authentication_config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    target_table text DEFAULT 'contacts'::text NOT NULL,
    target_operation text DEFAULT 'INSERT'::text NOT NULL,
    total_executions integer DEFAULT 0,
    total_failures integer DEFAULT 0,
    last_executed_at timestamp with time zone,
    CONSTRAINT outbound_webhooks_authentication_type_check CHECK ((authentication_type = ANY (ARRAY['none'::text, 'bearer'::text, 'api_key'::text, 'basic'::text]))),
    CONSTRAINT outbound_webhooks_http_method_check CHECK ((http_method = ANY (ARRAY['POST'::text, 'PUT'::text, 'PATCH'::text])))
);


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    invoice_id uuid,
    transaction_type text NOT NULL,
    amount numeric NOT NULL,
    razorpay_order_id text,
    razorpay_payment_id text,
    razorpay_signature text,
    payment_status text DEFAULT 'initiated'::text NOT NULL,
    payment_method text,
    initiated_by uuid,
    initiated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    failure_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payment_transactions_payment_status_check CHECK ((payment_status = ANY (ARRAY['initiated'::text, 'processing'::text, 'success'::text, 'failed'::text, 'refunded'::text]))),
    CONSTRAINT payment_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['subscription_payment'::text, 'wallet_topup'::text, 'wallet_auto_topup'::text, 'refund'::text])))
);


--
-- Name: pipeline_benchmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_benchmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    avg_days_in_stage numeric,
    conversion_rate numeric,
    total_contacts_processed integer DEFAULT 0,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pipeline_movement_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_movement_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    from_stage_id uuid,
    to_stage_id uuid,
    days_in_previous_stage integer,
    moved_at timestamp with time zone DEFAULT now() NOT NULL,
    moved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    action text NOT NULL,
    target_org_id uuid,
    target_user_id uuid,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_email_sending_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_email_sending_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    source_type text NOT NULL,
    is_unsubscribed boolean DEFAULT false NOT NULL,
    bounce_count integer DEFAULT 0 NOT NULL,
    last_bounce_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    org_id uuid,
    first_name text,
    last_name text,
    avatar_url text,
    phone text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    calling_enabled boolean DEFAULT false,
    whatsapp_enabled boolean DEFAULT false,
    email_enabled boolean DEFAULT false,
    sms_enabled boolean DEFAULT false,
    designation_id uuid,
    is_platform_admin boolean DEFAULT false,
    is_active boolean DEFAULT true NOT NULL,
    onboarding_completed boolean DEFAULT false,
    email text
);


--
-- Name: TABLE profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profiles IS 'Contains employee personal information - restricted to organization members only';


--
-- Name: rate_limit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid,
    operation text NOT NULL,
    ip_address inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recurring_activity_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_activity_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    created_by uuid,
    activity_type text NOT NULL,
    subject text,
    description text,
    scheduled_time time without time zone NOT NULL,
    duration_minutes integer DEFAULT 30,
    days_of_week integer[] NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    contact_id uuid,
    meeting_link text,
    is_task boolean DEFAULT false,
    assigned_to uuid,
    priority text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: redefine_data_repository; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redefine_data_repository (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    designation text,
    department text,
    job_level text,
    linkedin_url text,
    mobile_number text,
    mobile_2 text,
    official_email text,
    personal_email text,
    generic_email text,
    industry_type text,
    sub_industry text,
    company_name text,
    address text,
    location text,
    city text,
    state text,
    zone text,
    tier text,
    pincode text,
    website text,
    turnover text,
    employee_size text,
    erp_name text,
    erp_vendor text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: redefine_repository_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redefine_repository_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    repository_record_id uuid,
    action text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now(),
    old_values jsonb,
    new_values jsonb
);


--
-- Name: reporting_hierarchy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reporting_hierarchy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    designation_id uuid NOT NULL,
    reports_to_designation_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: revenue_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revenue_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    period_type text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    goal_amount numeric DEFAULT 0 NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT revenue_goals_period_type_check CHECK ((period_type = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text])))
);


--
-- Name: saved_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    data_source text NOT NULL,
    configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    service_type text NOT NULL,
    reference_id uuid NOT NULL,
    user_id uuid,
    quantity numeric NOT NULL,
    cost numeric NOT NULL,
    wallet_deducted boolean DEFAULT false,
    wallet_transaction_id uuid,
    deduction_error text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT service_usage_logs_service_type_check CHECK ((service_type = ANY (ARRAY['email'::text, 'whatsapp'::text, 'call'::text])))
);


--
-- Name: sms_bulk_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_bulk_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    campaign_name text NOT NULL,
    message_content text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    total_recipients integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    pending_count integer DEFAULT 0,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sms_bulk_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'processing'::text, 'completed'::text, 'paused'::text, 'cancelled'::text])))
);


--
-- Name: sms_campaign_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_campaign_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid,
    phone_number text NOT NULL,
    contact_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sms_campaign_recipients_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: sms_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid,
    sent_by uuid,
    phone_number text NOT NULL,
    message_content text NOT NULL,
    direction text DEFAULT 'outbound'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    exotel_sms_id text,
    exotel_status_code text,
    error_message text,
    sent_at timestamp with time zone DEFAULT now(),
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sms_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT sms_messages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'received'::text])))
);


--
-- Name: subscription_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    action text NOT NULL,
    performed_by uuid NOT NULL,
    target_record_id uuid,
    target_record_type text,
    old_values jsonb,
    new_values jsonb,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subscription_audit_log_action_check CHECK ((action = ANY (ARRAY['pricing_updated'::text, 'suspension_overridden'::text, 'grace_period_extended'::text, 'payment_waived'::text, 'wallet_adjusted'::text, 'invoice_generated_manually'::text, 'subscription_created_manually'::text])))
);


--
-- Name: subscription_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    invoice_number text NOT NULL,
    invoice_date date NOT NULL,
    due_date date NOT NULL,
    billing_period_start date NOT NULL,
    billing_period_end date NOT NULL,
    setup_fee numeric DEFAULT 0,
    base_subscription_amount numeric NOT NULL,
    user_count integer NOT NULL,
    prorated_amount numeric DEFAULT 0,
    subtotal numeric NOT NULL,
    gst_amount numeric NOT NULL,
    total_amount numeric NOT NULL,
    paid_amount numeric DEFAULT 0,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    waived_by uuid,
    waive_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subscription_invoices_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'partially_paid'::text, 'overdue'::text, 'waived'::text, 'cancelled'::text])))
);


--
-- Name: subscription_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    notification_type text NOT NULL,
    sent_at timestamp with time zone DEFAULT now(),
    recipient_emails text[] NOT NULL,
    email_subject text NOT NULL,
    invoice_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subscription_notifications_notification_type_check CHECK ((notification_type = ANY (ARRAY['invoice_generated'::text, 'payment_due_reminder'::text, 'payment_overdue'::text, 'grace_period_warning'::text, 'readonly_warning'::text, 'lockout_warning'::text, 'account_locked'::text, 'wallet_low_balance'::text, 'wallet_critical_balance'::text, 'service_suspended_wallet'::text, 'payment_successful'::text, 'services_restored'::text, 'auto_topup_required'::text])))
);


--
-- Name: subscription_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    one_time_setup_cost numeric DEFAULT 2000 NOT NULL,
    per_user_monthly_cost numeric DEFAULT 500 NOT NULL,
    min_wallet_balance numeric DEFAULT 5000 NOT NULL,
    email_cost_per_unit numeric DEFAULT 1 NOT NULL,
    whatsapp_cost_per_unit numeric DEFAULT 0.50 NOT NULL,
    call_cost_per_minute numeric DEFAULT 2 NOT NULL,
    call_cost_per_call numeric,
    auto_topup_amount numeric DEFAULT 5000 NOT NULL,
    auto_topup_enabled boolean DEFAULT true,
    gst_percentage numeric DEFAULT 18 NOT NULL,
    is_active boolean DEFAULT false,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: support_ticket_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    comment text NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_ticket_escalations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_escalations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    org_id uuid NOT NULL,
    escalated_by uuid NOT NULL,
    escalated_to uuid NOT NULL,
    remarks text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_ticket_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid,
    action text NOT NULL,
    old_value text,
    new_value text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: support_ticket_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    org_id uuid NOT NULL,
    channel text NOT NULL,
    recipient text NOT NULL,
    subject text,
    message_preview text,
    status text DEFAULT 'sent'::text NOT NULL,
    error_message text,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    created_by uuid NOT NULL,
    assigned_to uuid,
    ticket_number text NOT NULL,
    subject text NOT NULL,
    description text,
    category text DEFAULT 'general'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    resolution_notes text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_name text,
    contact_phone text,
    contact_email text,
    company_name text,
    due_at timestamp with time zone,
    client_notified boolean DEFAULT false NOT NULL,
    client_notified_at timestamp with time zone,
    attachments jsonb,
    source text DEFAULT 'crm'::text NOT NULL
);


--
-- Name: COLUMN support_tickets.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.support_tickets.source IS 'Source platform: crm, paisaa_saarthi, redefine, smb_connect, website, etc.';


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    assigned_to uuid NOT NULL,
    assigned_by uuid NOT NULL,
    due_date timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    priority text DEFAULT 'medium'::text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    remarks text,
    recurring_pattern_id uuid,
    reminder_sent boolean DEFAULT false,
    morning_reminder_sent boolean DEFAULT false,
    pre_action_reminder_sent boolean DEFAULT false,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text])))
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    manager_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_module_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_module_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    module_key text NOT NULL,
    module_name text NOT NULL,
    module_path text NOT NULL,
    module_icon text NOT NULL,
    visit_count integer DEFAULT 1 NOT NULL,
    last_visited_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    transaction_type text NOT NULL,
    amount numeric NOT NULL,
    balance_before numeric NOT NULL,
    balance_after numeric NOT NULL,
    reference_id uuid,
    reference_type text,
    quantity integer,
    unit_cost numeric,
    payment_transaction_id uuid,
    description text,
    created_by uuid,
    admin_reason text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT wallet_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['topup'::text, 'auto_topup'::text, 'deduction_email'::text, 'deduction_whatsapp'::text, 'deduction_call'::text, 'refund'::text, 'admin_adjustment'::text])))
);


--
-- Name: whatsapp_bulk_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_bulk_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    template_id uuid,
    message_content text NOT NULL,
    created_by uuid,
    total_recipients integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    pending_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variable_mappings jsonb DEFAULT '{}'::jsonb,
    exotel_settings_id uuid,
    CONSTRAINT whatsapp_bulk_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: COLUMN whatsapp_bulk_campaigns.variable_mappings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_bulk_campaigns.variable_mappings IS 'Maps template variables to data sources (CRM field, CSV column, or static value)';


--
-- Name: whatsapp_campaign_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_campaign_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    contact_id uuid,
    phone_number text NOT NULL,
    message_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    max_retries integer DEFAULT 3 NOT NULL,
    last_retry_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_data jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT whatsapp_campaign_recipients_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'retrying'::text, 'cancelled'::text, 'permanently_failed'::text])))
);


--
-- Name: COLUMN whatsapp_campaign_recipients.custom_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_campaign_recipients.custom_data IS 'Stores row-specific data from CSV upload for this recipient';


--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    template_id uuid,
    sent_by uuid,
    phone_number text NOT NULL,
    message_content text NOT NULL,
    template_variables jsonb,
    gupshup_message_id text,
    status text DEFAULT 'pending'::text,
    error_message text,
    sent_at timestamp with time zone DEFAULT now(),
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    direction text DEFAULT 'outbound'::text NOT NULL,
    conversation_id text,
    replied_to_message_id uuid,
    sender_name text,
    media_url text,
    media_type text,
    scheduled_at timestamp with time zone,
    exotel_message_id text,
    exotel_status_code text,
    CONSTRAINT whatsapp_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: whatsapp_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    gupshup_api_key text NOT NULL,
    whatsapp_source_number text NOT NULL,
    app_name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    webhook_secret text
);


--
-- Name: activity_participants activity_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_participants
    ADD CONSTRAINT activity_participants_pkey PRIMARY KEY (id);


--
-- Name: agent_call_sessions agent_call_sessions_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_call_sessions
    ADD CONSTRAINT agent_call_sessions_agent_id_key UNIQUE (agent_id);


--
-- Name: agent_call_sessions agent_call_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_call_sessions
    ADD CONSTRAINT agent_call_sessions_pkey PRIMARY KEY (id);


--
-- Name: api_key_usage_logs api_key_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key_usage_logs
    ADD CONSTRAINT api_key_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_api_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_api_key_key UNIQUE (api_key);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: approval_rules approval_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_pkey PRIMARY KEY (id);


--
-- Name: approval_types approval_types_org_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_types
    ADD CONSTRAINT approval_types_org_id_name_key UNIQUE (org_id, name);


--
-- Name: approval_types approval_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_types
    ADD CONSTRAINT approval_types_pkey PRIMARY KEY (id);


--
-- Name: automation_ab_tests automation_ab_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_ab_tests
    ADD CONSTRAINT automation_ab_tests_pkey PRIMARY KEY (id);


--
-- Name: automation_approvals automation_approvals_execution_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_approvals
    ADD CONSTRAINT automation_approvals_execution_id_key UNIQUE (execution_id);


--
-- Name: automation_approvals automation_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_approvals
    ADD CONSTRAINT automation_approvals_pkey PRIMARY KEY (id);


--
-- Name: automation_performance_daily automation_performance_daily_org_id_rule_id_report_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_performance_daily
    ADD CONSTRAINT automation_performance_daily_org_id_rule_id_report_date_key UNIQUE (org_id, rule_id, report_date);


--
-- Name: automation_performance_daily automation_performance_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_performance_daily
    ADD CONSTRAINT automation_performance_daily_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);


--
-- Name: bulk_import_history bulk_import_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_import_history
    ADD CONSTRAINT bulk_import_history_pkey PRIMARY KEY (id);


--
-- Name: bulk_import_records bulk_import_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_import_records
    ADD CONSTRAINT bulk_import_records_pkey PRIMARY KEY (id);


--
-- Name: calendar_shares calendar_shares_owner_id_shared_with_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_shares
    ADD CONSTRAINT calendar_shares_owner_id_shared_with_id_key UNIQUE (owner_id, shared_with_id);


--
-- Name: calendar_shares calendar_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_shares
    ADD CONSTRAINT calendar_shares_pkey PRIMARY KEY (id);


--
-- Name: call_dispositions call_dispositions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_dispositions
    ADD CONSTRAINT call_dispositions_pkey PRIMARY KEY (id);


--
-- Name: call_logs call_logs_exotel_call_sid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_exotel_call_sid_key UNIQUE (exotel_call_sid);


--
-- Name: call_logs call_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_pkey PRIMARY KEY (id);


--
-- Name: call_sub_dispositions call_sub_dispositions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sub_dispositions
    ADD CONSTRAINT call_sub_dispositions_pkey PRIMARY KEY (id);


--
-- Name: campaign_analytics campaign_analytics_campaign_id_campaign_type_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_analytics
    ADD CONSTRAINT campaign_analytics_campaign_id_campaign_type_date_key UNIQUE (campaign_id, campaign_type, date);


--
-- Name: campaign_analytics campaign_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_analytics
    ADD CONSTRAINT campaign_analytics_pkey PRIMARY KEY (id);


--
-- Name: campaign_insights campaign_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_insights
    ADD CONSTRAINT campaign_insights_pkey PRIMARY KEY (id);


--
-- Name: carry_forward_snapshot carry_forward_snapshot_org_id_reference_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carry_forward_snapshot
    ADD CONSTRAINT carry_forward_snapshot_org_id_reference_year_key UNIQUE (org_id, reference_year);


--
-- Name: carry_forward_snapshot carry_forward_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carry_forward_snapshot
    ADD CONSTRAINT carry_forward_snapshot_pkey PRIMARY KEY (id);


--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: chat_message_reactions chat_message_reactions_message_id_user_id_emoji_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_reactions
    ADD CONSTRAINT chat_message_reactions_message_id_user_id_emoji_key UNIQUE (message_id, user_id, emoji);


--
-- Name: chat_message_reactions chat_message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_reactions
    ADD CONSTRAINT chat_message_reactions_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_participants chat_participants_conversation_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id);


--
-- Name: chat_participants chat_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_pkey PRIMARY KEY (id);


--
-- Name: client_alternate_contacts client_alternate_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_alternate_contacts
    ADD CONSTRAINT client_alternate_contacts_pkey PRIMARY KEY (id);


--
-- Name: client_documents client_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_pkey PRIMARY KEY (id);


--
-- Name: client_invoices client_invoices_org_invoice_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_invoices
    ADD CONSTRAINT client_invoices_org_invoice_unique UNIQUE (org_id, invoice_number);


--
-- Name: client_invoices client_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_invoices
    ADD CONSTRAINT client_invoices_pkey PRIMARY KEY (id);


--
-- Name: clients clients_org_id_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_org_id_contact_id_key UNIQUE (org_id, contact_id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: communication_templates communication_templates_org_id_template_id_template_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_templates
    ADD CONSTRAINT communication_templates_org_id_template_id_template_type_key UNIQUE (org_id, template_id, template_type);


--
-- Name: communication_templates communication_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_templates
    ADD CONSTRAINT communication_templates_pkey PRIMARY KEY (id);


--
-- Name: connector_logs connector_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_logs
    ADD CONSTRAINT connector_logs_pkey PRIMARY KEY (id);


--
-- Name: connector_logs connector_logs_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_logs
    ADD CONSTRAINT connector_logs_request_id_key UNIQUE (request_id);


--
-- Name: contact_activities contact_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_pkey PRIMARY KEY (id);


--
-- Name: contact_custom_fields contact_custom_fields_contact_id_custom_field_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_fields
    ADD CONSTRAINT contact_custom_fields_contact_id_custom_field_id_key UNIQUE (contact_id, custom_field_id);


--
-- Name: contact_custom_fields contact_custom_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_fields
    ADD CONSTRAINT contact_custom_fields_pkey PRIMARY KEY (id);


--
-- Name: contact_emails contact_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_emails
    ADD CONSTRAINT contact_emails_pkey PRIMARY KEY (id);


--
-- Name: contact_enrichment_logs contact_enrichment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_enrichment_logs
    ADD CONSTRAINT contact_enrichment_logs_pkey PRIMARY KEY (id);


--
-- Name: contact_enrichment_runs contact_enrichment_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_enrichment_runs
    ADD CONSTRAINT contact_enrichment_runs_pkey PRIMARY KEY (id);


--
-- Name: contact_lead_scores contact_lead_scores_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_lead_scores
    ADD CONSTRAINT contact_lead_scores_contact_id_key UNIQUE (contact_id);


--
-- Name: contact_lead_scores contact_lead_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_lead_scores
    ADD CONSTRAINT contact_lead_scores_pkey PRIMARY KEY (id);


--
-- Name: contact_phones contact_phones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_phones
    ADD CONSTRAINT contact_phones_pkey PRIMARY KEY (id);


--
-- Name: contact_tag_assignments contact_tag_assignments_contact_id_tag_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tag_assignments
    ADD CONSTRAINT contact_tag_assignments_contact_id_tag_id_key UNIQUE (contact_id, tag_id);


--
-- Name: contact_tag_assignments contact_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tag_assignments
    ADD CONSTRAINT contact_tag_assignments_pkey PRIMARY KEY (id);


--
-- Name: contact_tags contact_tags_org_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_org_id_name_key UNIQUE (org_id, name);


--
-- Name: contact_tags contact_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: custom_fields custom_fields_org_id_field_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_org_id_field_name_key UNIQUE (org_id, field_name);


--
-- Name: custom_fields custom_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_pkey PRIMARY KEY (id);


--
-- Name: designation_feature_access designation_feature_access_designation_id_feature_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designation_feature_access
    ADD CONSTRAINT designation_feature_access_designation_id_feature_key_key UNIQUE (designation_id, feature_key);


--
-- Name: designation_feature_access designation_feature_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designation_feature_access
    ADD CONSTRAINT designation_feature_access_pkey PRIMARY KEY (id);


--
-- Name: designations designations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designations
    ADD CONSTRAINT designations_pkey PRIMARY KEY (id);


--
-- Name: email_automation_cooldowns email_automation_cooldowns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_cooldowns
    ADD CONSTRAINT email_automation_cooldowns_pkey PRIMARY KEY (id);


--
-- Name: email_automation_cooldowns email_automation_cooldowns_rule_id_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_cooldowns
    ADD CONSTRAINT email_automation_cooldowns_rule_id_contact_id_key UNIQUE (rule_id, contact_id);


--
-- Name: email_automation_daily_limits email_automation_daily_limits_org_id_contact_id_send_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_daily_limits
    ADD CONSTRAINT email_automation_daily_limits_org_id_contact_id_send_date_key UNIQUE (org_id, contact_id, send_date);


--
-- Name: email_automation_daily_limits email_automation_daily_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_daily_limits
    ADD CONSTRAINT email_automation_daily_limits_pkey PRIMARY KEY (id);


--
-- Name: email_automation_executions email_automation_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_executions
    ADD CONSTRAINT email_automation_executions_pkey PRIMARY KEY (id);


--
-- Name: email_automation_rule_dependencies email_automation_rule_dependenci_rule_id_depends_on_rule_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_rule_dependencies
    ADD CONSTRAINT email_automation_rule_dependenci_rule_id_depends_on_rule_id_key UNIQUE (rule_id, depends_on_rule_id);


--
-- Name: email_automation_rule_dependencies email_automation_rule_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_rule_dependencies
    ADD CONSTRAINT email_automation_rule_dependencies_pkey PRIMARY KEY (id);


--
-- Name: email_automation_rule_templates email_automation_rule_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_rule_templates
    ADD CONSTRAINT email_automation_rule_templates_pkey PRIMARY KEY (id);


--
-- Name: email_automation_rules email_automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_rules
    ADD CONSTRAINT email_automation_rules_pkey PRIMARY KEY (id);


--
-- Name: email_bulk_campaigns email_bulk_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_bulk_campaigns
    ADD CONSTRAINT email_bulk_campaigns_pkey PRIMARY KEY (id);


--
-- Name: email_campaign_recipients email_campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: email_conversations email_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_pkey PRIMARY KEY (id);


--
-- Name: email_conversations email_conversations_tracking_pixel_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_tracking_pixel_id_key UNIQUE (tracking_pixel_id);


--
-- Name: email_conversations email_conversations_unsubscribe_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_unsubscribe_token_key UNIQUE (unsubscribe_token);


--
-- Name: email_engagement_patterns email_engagement_patterns_org_id_contact_id_hour_of_day_day_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_engagement_patterns
    ADD CONSTRAINT email_engagement_patterns_org_id_contact_id_hour_of_day_day_key UNIQUE (org_id, contact_id, hour_of_day, day_of_week);


--
-- Name: email_engagement_patterns email_engagement_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_engagement_patterns
    ADD CONSTRAINT email_engagement_patterns_pkey PRIMARY KEY (id);


--
-- Name: email_settings email_settings_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_settings
    ADD CONSTRAINT email_settings_org_id_key UNIQUE (org_id);


--
-- Name: email_settings email_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_settings
    ADD CONSTRAINT email_settings_pkey PRIMARY KEY (id);


--
-- Name: email_suppression_list email_suppression_list_org_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppression_list
    ADD CONSTRAINT email_suppression_list_org_id_email_key UNIQUE (org_id, email);


--
-- Name: email_suppression_list email_suppression_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppression_list
    ADD CONSTRAINT email_suppression_list_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_unsubscribes email_unsubscribes_org_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribes
    ADD CONSTRAINT email_unsubscribes_org_id_email_key UNIQUE (org_id, email);


--
-- Name: email_unsubscribes email_unsubscribes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribes
    ADD CONSTRAINT email_unsubscribes_pkey PRIMARY KEY (id);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);


--
-- Name: exotel_exophones exotel_exophones_org_id_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exotel_exophones
    ADD CONSTRAINT exotel_exophones_org_id_phone_number_key UNIQUE (org_id, phone_number);


--
-- Name: exotel_exophones exotel_exophones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exotel_exophones
    ADD CONSTRAINT exotel_exophones_pkey PRIMARY KEY (id);


--
-- Name: exotel_settings exotel_settings_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exotel_settings
    ADD CONSTRAINT exotel_settings_org_id_key UNIQUE (org_id);


--
-- Name: exotel_settings exotel_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exotel_settings
    ADD CONSTRAINT exotel_settings_pkey PRIMARY KEY (id);


--
-- Name: external_entities external_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_entities
    ADD CONSTRAINT external_entities_pkey PRIMARY KEY (id);


--
-- Name: feature_permissions feature_permissions_feature_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_permissions
    ADD CONSTRAINT feature_permissions_feature_key_key UNIQUE (feature_key);


--
-- Name: feature_permissions feature_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_permissions
    ADD CONSTRAINT feature_permissions_pkey PRIMARY KEY (id);


--
-- Name: form_fields form_fields_form_id_custom_field_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_fields
    ADD CONSTRAINT form_fields_form_id_custom_field_id_key UNIQUE (form_id, custom_field_id);


--
-- Name: form_fields form_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_fields
    ADD CONSTRAINT form_fields_pkey PRIMARY KEY (id);


--
-- Name: forms forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_pkey PRIMARY KEY (id);


--
-- Name: forms forms_webhook_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_webhook_token_key UNIQUE (webhook_token);


--
-- Name: google_oauth_tokens google_oauth_tokens_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_oauth_tokens
    ADD CONSTRAINT google_oauth_tokens_org_id_key UNIQUE (org_id);


--
-- Name: google_oauth_tokens google_oauth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_oauth_tokens
    ADD CONSTRAINT google_oauth_tokens_pkey PRIMARY KEY (id);


--
-- Name: gst_payment_tracking gst_payment_tracking_org_id_month_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gst_payment_tracking
    ADD CONSTRAINT gst_payment_tracking_org_id_month_year_key UNIQUE (org_id, month, year);


--
-- Name: gst_payment_tracking gst_payment_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gst_payment_tracking
    ADD CONSTRAINT gst_payment_tracking_pkey PRIMARY KEY (id);


--
-- Name: import_jobs import_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_pkey PRIMARY KEY (id);


--
-- Name: import_staging import_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_staging
    ADD CONSTRAINT import_staging_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_org_id_item_id_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_org_id_item_id_sku_key UNIQUE (org_id, item_id_sku);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_import_items invoice_import_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_import_items
    ADD CONSTRAINT invoice_import_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_imports invoice_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_imports
    ADD CONSTRAINT invoice_imports_pkey PRIMARY KEY (id);


--
-- Name: monthly_actuals_snapshot monthly_actuals_snapshot_org_id_year_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_actuals_snapshot
    ADD CONSTRAINT monthly_actuals_snapshot_org_id_year_month_key UNIQUE (org_id, year, month);


--
-- Name: monthly_actuals_snapshot monthly_actuals_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_actuals_snapshot
    ADD CONSTRAINT monthly_actuals_snapshot_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: operation_queue operation_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operation_queue
    ADD CONSTRAINT operation_queue_pkey PRIMARY KEY (id);


--
-- Name: org_business_hours org_business_hours_org_id_day_of_week_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_business_hours
    ADD CONSTRAINT org_business_hours_org_id_day_of_week_key UNIQUE (org_id, day_of_week);


--
-- Name: org_business_hours org_business_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_business_hours
    ADD CONSTRAINT org_business_hours_pkey PRIMARY KEY (id);


--
-- Name: org_feature_access org_feature_access_org_id_feature_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_feature_access
    ADD CONSTRAINT org_feature_access_org_id_feature_key_key UNIQUE (org_id, feature_key);


--
-- Name: org_feature_access org_feature_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_feature_access
    ADD CONSTRAINT org_feature_access_pkey PRIMARY KEY (id);


--
-- Name: org_invites org_invites_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_invite_code_key UNIQUE (invite_code);


--
-- Name: org_invites org_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_pkey PRIMARY KEY (id);


--
-- Name: organization_subscriptions organization_subscriptions_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscriptions
    ADD CONSTRAINT organization_subscriptions_org_id_key UNIQUE (org_id);


--
-- Name: organization_subscriptions organization_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscriptions
    ADD CONSTRAINT organization_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: outbound_webhook_logs outbound_webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_webhook_logs
    ADD CONSTRAINT outbound_webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: outbound_webhooks outbound_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_webhooks
    ADD CONSTRAINT outbound_webhooks_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: pipeline_benchmarks pipeline_benchmarks_org_id_stage_id_period_start_period_end_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_benchmarks
    ADD CONSTRAINT pipeline_benchmarks_org_id_stage_id_period_start_period_end_key UNIQUE (org_id, stage_id, period_start, period_end);


--
-- Name: pipeline_benchmarks pipeline_benchmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_benchmarks
    ADD CONSTRAINT pipeline_benchmarks_pkey PRIMARY KEY (id);


--
-- Name: pipeline_movement_history pipeline_movement_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_movement_history
    ADD CONSTRAINT pipeline_movement_history_pkey PRIMARY KEY (id);


--
-- Name: pipeline_stages pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: platform_admin_audit_log platform_admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_audit_log
    ADD CONSTRAINT platform_admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: platform_email_sending_list platform_email_sending_list_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_email_sending_list
    ADD CONSTRAINT platform_email_sending_list_email_key UNIQUE (email);


--
-- Name: platform_email_sending_list platform_email_sending_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_email_sending_list
    ADD CONSTRAINT platform_email_sending_list_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_log rate_limit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_log
    ADD CONSTRAINT rate_limit_log_pkey PRIMARY KEY (id);


--
-- Name: recurring_activity_patterns recurring_activity_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_activity_patterns
    ADD CONSTRAINT recurring_activity_patterns_pkey PRIMARY KEY (id);


--
-- Name: redefine_data_repository redefine_data_repository_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redefine_data_repository
    ADD CONSTRAINT redefine_data_repository_pkey PRIMARY KEY (id);


--
-- Name: redefine_repository_audit redefine_repository_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redefine_repository_audit
    ADD CONSTRAINT redefine_repository_audit_pkey PRIMARY KEY (id);


--
-- Name: reporting_hierarchy reporting_hierarchy_designation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporting_hierarchy
    ADD CONSTRAINT reporting_hierarchy_designation_id_key UNIQUE (designation_id);


--
-- Name: reporting_hierarchy reporting_hierarchy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporting_hierarchy
    ADD CONSTRAINT reporting_hierarchy_pkey PRIMARY KEY (id);


--
-- Name: revenue_goals revenue_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_goals
    ADD CONSTRAINT revenue_goals_pkey PRIMARY KEY (id);


--
-- Name: saved_reports saved_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reports
    ADD CONSTRAINT saved_reports_pkey PRIMARY KEY (id);


--
-- Name: service_usage_logs service_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_usage_logs
    ADD CONSTRAINT service_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: sms_bulk_campaigns sms_bulk_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_bulk_campaigns
    ADD CONSTRAINT sms_bulk_campaigns_pkey PRIMARY KEY (id);


--
-- Name: sms_campaign_recipients sms_campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_campaign_recipients
    ADD CONSTRAINT sms_campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: sms_messages sms_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_pkey PRIMARY KEY (id);


--
-- Name: subscription_audit_log subscription_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_audit_log
    ADD CONSTRAINT subscription_audit_log_pkey PRIMARY KEY (id);


--
-- Name: subscription_invoices subscription_invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: subscription_invoices subscription_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_pkey PRIMARY KEY (id);


--
-- Name: subscription_notifications subscription_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_notifications
    ADD CONSTRAINT subscription_notifications_pkey PRIMARY KEY (id);


--
-- Name: subscription_pricing subscription_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_pricing
    ADD CONSTRAINT subscription_pricing_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_comments support_ticket_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_comments
    ADD CONSTRAINT support_ticket_comments_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_escalations support_ticket_escalations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_escalations
    ADD CONSTRAINT support_ticket_escalations_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_history support_ticket_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_history
    ADD CONSTRAINT support_ticket_history_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_notifications support_ticket_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_notifications
    ADD CONSTRAINT support_ticket_notifications_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_team_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: redefine_data_repository unique_email_per_org; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redefine_data_repository
    ADD CONSTRAINT unique_email_per_org UNIQUE (org_id, official_email);


--
-- Name: blog_posts unique_org_blog; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT unique_org_blog UNIQUE (org_id, blog_url);


--
-- Name: user_module_usage user_module_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_usage
    ADD CONSTRAINT user_module_usage_pkey PRIMARY KEY (id);


--
-- Name: user_module_usage user_module_usage_user_id_module_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_usage
    ADD CONSTRAINT user_module_usage_user_id_module_key_key UNIQUE (user_id, module_key);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_org_id_key UNIQUE (user_id, org_id);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_bulk_campaigns whatsapp_bulk_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_bulk_campaigns
    ADD CONSTRAINT whatsapp_bulk_campaigns_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_campaign_recipients whatsapp_campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_campaign_recipients
    ADD CONSTRAINT whatsapp_campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_settings whatsapp_settings_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_settings
    ADD CONSTRAINT whatsapp_settings_org_id_key UNIQUE (org_id);


--
-- Name: whatsapp_settings whatsapp_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_settings
    ADD CONSTRAINT whatsapp_settings_pkey PRIMARY KEY (id);


--
-- Name: idx_activities_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_contact_id ON public.contact_activities USING btree (contact_id);


--
-- Name: idx_activities_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_created_by ON public.contact_activities USING btree (created_by);


--
-- Name: idx_activities_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_org_id ON public.contact_activities USING btree (org_id);


--
-- Name: idx_activities_scheduled_reminders; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_scheduled_reminders ON public.contact_activities USING btree (scheduled_at, reminder_sent, activity_type) WHERE ((scheduled_at IS NOT NULL) AND (reminder_sent = false));


--
-- Name: idx_activity_participants_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_participants_activity ON public.activity_participants USING btree (activity_id);


--
-- Name: idx_activity_participants_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_participants_contact ON public.activity_participants USING btree (contact_id);


--
-- Name: idx_activity_participants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_participants_user ON public.activity_participants USING btree (user_id);


--
-- Name: idx_agent_call_sessions_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_call_sessions_org_id ON public.agent_call_sessions USING btree (org_id);


--
-- Name: idx_api_key_usage_logs_api_key_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_key_usage_logs_api_key_id ON public.api_key_usage_logs USING btree (api_key_id);


--
-- Name: idx_api_key_usage_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_key_usage_logs_created_at ON public.api_key_usage_logs USING btree (created_at DESC);


--
-- Name: idx_api_key_usage_logs_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_key_usage_logs_org_id ON public.api_key_usage_logs USING btree (org_id);


--
-- Name: idx_api_keys_api_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_api_key ON public.api_keys USING btree (api_key) WHERE (is_active = true);


--
-- Name: idx_api_keys_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_org_id ON public.api_keys USING btree (org_id);


--
-- Name: idx_approval_rules_approval_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_rules_approval_type_id ON public.approval_rules USING btree (approval_type_id);


--
-- Name: idx_approval_rules_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_rules_is_active ON public.approval_rules USING btree (is_active);


--
-- Name: idx_approval_rules_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_rules_org_id ON public.approval_rules USING btree (org_id);


--
-- Name: idx_approval_types_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_types_is_active ON public.approval_types USING btree (is_active);


--
-- Name: idx_approval_types_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_types_org_id ON public.approval_types USING btree (org_id);


--
-- Name: idx_approvals_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approvals_expires ON public.automation_approvals USING btree (expires_at) WHERE (status = 'pending'::text);


--
-- Name: idx_approvals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approvals_status ON public.automation_approvals USING btree (org_id, status);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.subscription_audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_org ON public.subscription_audit_log USING btree (org_id);


--
-- Name: idx_audit_performed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_performed_by ON public.subscription_audit_log USING btree (performed_by);


--
-- Name: idx_automation_ab_tests_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_ab_tests_rule ON public.automation_ab_tests USING btree (rule_id, status);


--
-- Name: idx_blog_posts_email_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_email_sent ON public.blog_posts USING btree (email_campaign_sent);


--
-- Name: idx_blog_posts_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_org_id ON public.blog_posts USING btree (org_id);


--
-- Name: idx_blog_posts_posted_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_posted_timestamp ON public.blog_posts USING btree (posted_timestamp DESC);


--
-- Name: idx_blog_posts_social_posted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_social_posted ON public.blog_posts USING btree (social_posted);


--
-- Name: idx_blog_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_status ON public.blog_posts USING btree (status);


--
-- Name: idx_bulk_import_history_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_import_history_org ON public.bulk_import_history USING btree (org_id);


--
-- Name: idx_bulk_import_history_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_import_history_status ON public.bulk_import_history USING btree (status);


--
-- Name: idx_bulk_import_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_import_history_user ON public.bulk_import_history USING btree (user_id);


--
-- Name: idx_bulk_import_records_import; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_import_records_import ON public.bulk_import_records USING btree (import_id);


--
-- Name: idx_call_logs_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_logs_agent_id ON public.call_logs USING btree (agent_id);


--
-- Name: idx_call_logs_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_logs_contact_id ON public.call_logs USING btree (contact_id);


--
-- Name: idx_call_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_logs_created_at ON public.call_logs USING btree (created_at DESC);


--
-- Name: idx_call_logs_exotel_sid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_logs_exotel_sid ON public.call_logs USING btree (exotel_call_sid);


--
-- Name: idx_call_logs_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_logs_org_id ON public.call_logs USING btree (org_id);


--
-- Name: idx_campaign_analytics_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_analytics_campaign ON public.campaign_analytics USING btree (campaign_id, campaign_type);


--
-- Name: idx_campaign_analytics_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_analytics_org_date ON public.campaign_analytics USING btree (org_id, date DESC);


--
-- Name: idx_campaign_insights_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_insights_expires ON public.campaign_insights USING btree (expires_at) WHERE (status = 'active'::text);


--
-- Name: idx_campaign_insights_org_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_insights_org_priority ON public.campaign_insights USING btree (org_id, priority, status);


--
-- Name: idx_campaign_recipients_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_recipients_campaign_id ON public.whatsapp_campaign_recipients USING btree (campaign_id);


--
-- Name: idx_campaign_recipients_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_recipients_retry ON public.whatsapp_campaign_recipients USING btree (status, next_retry_at) WHERE (status = ANY (ARRAY['failed'::text, 'retrying'::text]));


--
-- Name: idx_campaign_recipients_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_recipients_status ON public.whatsapp_campaign_recipients USING btree (status);


--
-- Name: idx_campaigns_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_org_id ON public.whatsapp_bulk_campaigns USING btree (org_id);


--
-- Name: idx_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_status ON public.whatsapp_bulk_campaigns USING btree (status);


--
-- Name: idx_carry_forward_org_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_carry_forward_org_year ON public.carry_forward_snapshot USING btree (org_id, reference_year);


--
-- Name: idx_chat_conversations_last_message_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_last_message_at ON public.chat_conversations USING btree (last_message_at DESC);


--
-- Name: idx_chat_conversations_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_org_id ON public.chat_conversations USING btree (org_id);


--
-- Name: idx_chat_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_conversation_id ON public.chat_messages USING btree (conversation_id);


--
-- Name: idx_chat_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_created_at ON public.chat_messages USING btree (created_at DESC);


--
-- Name: idx_chat_participants_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_participants_conversation_id ON public.chat_participants USING btree (conversation_id);


--
-- Name: idx_chat_participants_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_participants_user_id ON public.chat_participants USING btree (user_id);


--
-- Name: idx_client_alternate_contacts_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_alternate_contacts_client_id ON public.client_alternate_contacts USING btree (client_id);


--
-- Name: idx_client_alternate_contacts_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_alternate_contacts_org_id ON public.client_alternate_contacts USING btree (org_id);


--
-- Name: idx_client_documents_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_documents_client_id ON public.client_documents USING btree (client_id);


--
-- Name: idx_client_documents_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_documents_contact_id ON public.client_documents USING btree (contact_id);


--
-- Name: idx_client_documents_external_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_documents_external_entity_id ON public.client_documents USING btree (external_entity_id);


--
-- Name: idx_client_invoices_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_invoices_client_id ON public.client_invoices USING btree (client_id);


--
-- Name: idx_client_invoices_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_invoices_contact_id ON public.client_invoices USING btree (contact_id);


--
-- Name: idx_client_invoices_document_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_invoices_document_type ON public.client_invoices USING btree (document_type);


--
-- Name: idx_client_invoices_external_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_invoices_external_entity_id ON public.client_invoices USING btree (external_entity_id);


--
-- Name: idx_client_invoices_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_invoices_org_date ON public.client_invoices USING btree (org_id, invoice_date, status);


--
-- Name: idx_clients_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_contact_id ON public.clients USING btree (contact_id);


--
-- Name: idx_clients_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_org_id ON public.clients USING btree (org_id);


--
-- Name: idx_clients_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_org_status ON public.clients USING btree (org_id, status);


--
-- Name: idx_clients_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_status ON public.clients USING btree (status);


--
-- Name: idx_connector_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connector_logs_created ON public.connector_logs USING btree (created_at DESC);


--
-- Name: idx_connector_logs_form; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connector_logs_form ON public.connector_logs USING btree (form_id);


--
-- Name: idx_connector_logs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connector_logs_org ON public.connector_logs USING btree (org_id);


--
-- Name: idx_connector_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connector_logs_status ON public.connector_logs USING btree (status);


--
-- Name: idx_contact_activities_checkin_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_activities_checkin_location ON public.contact_activities USING btree (check_in_latitude, check_in_longitude) WHERE (check_in_latitude IS NOT NULL);


--
-- Name: idx_contact_activities_checkout_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_activities_checkout_location ON public.contact_activities USING btree (check_out_latitude, check_out_longitude) WHERE (check_out_latitude IS NOT NULL);


--
-- Name: idx_contact_activities_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_activities_created_at ON public.contact_activities USING btree (created_at DESC);


--
-- Name: idx_contact_activities_next_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_activities_next_action ON public.contact_activities USING btree (next_action_date, morning_reminder_sent, pre_action_reminder_sent) WHERE (next_action_date IS NOT NULL);


--
-- Name: idx_contact_activities_org_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_activities_org_contact ON public.contact_activities USING btree (org_id, contact_id, created_at DESC);


--
-- Name: idx_contact_activities_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_activities_org_id ON public.contact_activities USING btree (org_id);


--
-- Name: idx_contact_activities_recurring; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_activities_recurring ON public.contact_activities USING btree (recurring_pattern_id);


--
-- Name: idx_contact_emails_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_emails_contact_id ON public.contact_emails USING btree (contact_id);


--
-- Name: idx_contact_emails_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_emails_org_id ON public.contact_emails USING btree (org_id);


--
-- Name: idx_contact_enrichment_logs_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_enrichment_logs_contact_id ON public.contact_enrichment_logs USING btree (contact_id);


--
-- Name: idx_contact_enrichment_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_enrichment_logs_created_at ON public.contact_enrichment_logs USING btree (created_at DESC);


--
-- Name: idx_contact_enrichment_logs_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_enrichment_logs_org_id ON public.contact_enrichment_logs USING btree (org_id);


--
-- Name: idx_contact_phones_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_phones_contact_id ON public.contact_phones USING btree (contact_id);


--
-- Name: idx_contact_phones_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_phones_org_id ON public.contact_phones USING btree (org_id);


--
-- Name: idx_contacts_assigned_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_assigned_team ON public.contacts USING btree (assigned_team_id);


--
-- Name: idx_contacts_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_assigned_to ON public.contacts USING btree (assigned_to);


--
-- Name: idx_contacts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_created_at ON public.contacts USING btree (created_at DESC);


--
-- Name: idx_contacts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_email ON public.contacts USING btree (email);


--
-- Name: idx_contacts_enrichment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_enrichment_status ON public.contacts USING btree (enrichment_status);


--
-- Name: idx_contacts_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_location ON public.contacts USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));


--
-- Name: idx_contacts_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_org_created ON public.contacts USING btree (org_id, created_at DESC);


--
-- Name: idx_contacts_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_org_id ON public.contacts USING btree (org_id);


--
-- Name: idx_contacts_org_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_org_stage ON public.contacts USING btree (org_id, pipeline_stage_id, created_at DESC);


--
-- Name: idx_contacts_pipeline_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_pipeline_stage ON public.contacts USING btree (pipeline_stage_id);


--
-- Name: idx_contacts_pipeline_stage_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_pipeline_stage_id ON public.contacts USING btree (pipeline_stage_id);


--
-- Name: idx_contacts_with_stages_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_contacts_with_stages_id ON public.contacts_with_stages USING btree (id);


--
-- Name: idx_contacts_with_stages_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_with_stages_org ON public.contacts_with_stages USING btree (org_id);


--
-- Name: idx_cooldowns_rule_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cooldowns_rule_contact ON public.email_automation_cooldowns USING btree (rule_id, contact_id);


--
-- Name: idx_custom_fields_org_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_fields_org_table ON public.custom_fields USING btree (org_id, applies_to_table, is_active);


--
-- Name: idx_daily_limits_org_contact_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_limits_org_contact_date ON public.email_automation_daily_limits USING btree (org_id, contact_id, send_date);


--
-- Name: idx_email_bulk_campaigns_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_bulk_campaigns_org_id ON public.email_bulk_campaigns USING btree (org_id);


--
-- Name: idx_email_campaign_recipients_resend_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_recipients_resend_email ON public.email_campaign_recipients USING btree (resend_email_id) WHERE (resend_email_id IS NOT NULL);


--
-- Name: idx_email_campaign_recipients_tracking_pixel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_recipients_tracking_pixel ON public.email_campaign_recipients USING btree (tracking_pixel_id) WHERE (tracking_pixel_id IS NOT NULL);


--
-- Name: idx_email_campaigns_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_scheduled ON public.email_bulk_campaigns USING btree (scheduled_at) WHERE (status = 'scheduled'::text);


--
-- Name: idx_email_conversations_button_clicks; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_button_clicks ON public.email_conversations USING gin (button_clicks);


--
-- Name: idx_email_conversations_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_contact ON public.email_conversations USING btree (contact_id, sent_at DESC);


--
-- Name: idx_email_conversations_org_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_org_direction ON public.email_conversations USING btree (org_id, direction, sent_at DESC);


--
-- Name: idx_email_conversations_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_scheduled ON public.email_conversations USING btree (scheduled_at) WHERE (status = 'scheduled'::text);


--
-- Name: idx_email_conversations_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_thread ON public.email_conversations USING btree (conversation_id, sent_at);


--
-- Name: idx_email_conversations_tracking_pixel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_tracking_pixel ON public.email_conversations USING btree (tracking_pixel_id) WHERE (tracking_pixel_id IS NOT NULL);


--
-- Name: idx_email_conversations_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_unread ON public.email_conversations USING btree (org_id, is_read, sent_at DESC) WHERE ((is_read = false) AND (direction = 'inbound'::text));


--
-- Name: idx_email_executions_ab_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_executions_ab_test ON public.email_automation_executions USING btree (ab_test_id, ab_variant_name) WHERE (ab_test_id IS NOT NULL);


--
-- Name: idx_email_suppression_org_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_suppression_org_email ON public.email_suppression_list USING btree (org_id, lower(email));


--
-- Name: idx_engagement_patterns_org_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagement_patterns_org_contact ON public.email_engagement_patterns USING btree (org_id, contact_id);


--
-- Name: idx_engagement_patterns_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagement_patterns_score ON public.email_engagement_patterns USING btree (org_id, contact_id, engagement_score DESC);


--
-- Name: idx_enrichment_runs_org_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_runs_org_started ON public.contact_enrichment_runs USING btree (org_id, started_at DESC);


--
-- Name: idx_error_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_created_at ON public.error_logs USING btree (created_at DESC);


--
-- Name: idx_error_logs_error_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_error_type ON public.error_logs USING btree (error_type);


--
-- Name: idx_error_logs_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_org_id ON public.error_logs USING btree (org_id);


--
-- Name: idx_escalations_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escalations_ticket_id ON public.support_ticket_escalations USING btree (ticket_id);


--
-- Name: idx_executions_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_executions_contact ON public.email_automation_executions USING btree (contact_id);


--
-- Name: idx_executions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_executions_org ON public.email_automation_executions USING btree (org_id);


--
-- Name: idx_executions_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_executions_rule ON public.email_automation_executions USING btree (rule_id);


--
-- Name: idx_executions_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_executions_scheduled ON public.email_automation_executions USING btree (scheduled_for) WHERE (status = 'scheduled'::text);


--
-- Name: idx_executions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_executions_status ON public.email_automation_executions USING btree (status);


--
-- Name: idx_external_entities_entity_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_external_entities_entity_type ON public.external_entities USING btree (entity_type);


--
-- Name: idx_external_entities_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_external_entities_org_id ON public.external_entities USING btree (org_id);


--
-- Name: idx_forms_webhook_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forms_webhook_token ON public.forms USING btree (webhook_token) WHERE (webhook_token IS NOT NULL);


--
-- Name: idx_import_jobs_org_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_jobs_org_user ON public.import_jobs USING btree (org_id, user_id, created_at DESC);


--
-- Name: idx_import_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_jobs_status ON public.import_jobs USING btree (status, current_stage);


--
-- Name: idx_import_staging_import; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_staging_import ON public.import_staging USING btree (import_id);


--
-- Name: idx_import_staging_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_staging_processed ON public.import_staging USING btree (import_id, processed);


--
-- Name: idx_inventory_items_available_qty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_available_qty ON public.inventory_items USING btree (available_qty);


--
-- Name: idx_inventory_items_import_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_import_job ON public.inventory_items USING btree (import_job_id) WHERE (import_job_id IS NOT NULL);


--
-- Name: idx_inventory_items_item_id_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_item_id_sku ON public.inventory_items USING btree (item_id_sku);


--
-- Name: idx_inventory_items_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_org_id ON public.inventory_items USING btree (org_id);


--
-- Name: idx_invoice_import_items_duplicate_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_import_items_duplicate_status ON public.invoice_import_items USING btree (duplicate_status);


--
-- Name: idx_invoice_import_items_import_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_import_items_import_id ON public.invoice_import_items USING btree (import_id);


--
-- Name: idx_invoice_import_items_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_import_items_org_id ON public.invoice_import_items USING btree (org_id);


--
-- Name: idx_invoice_import_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_import_items_status ON public.invoice_import_items USING btree (status);


--
-- Name: idx_invoice_imports_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_imports_org_id ON public.invoice_imports USING btree (org_id);


--
-- Name: idx_invoice_imports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_imports_status ON public.invoice_imports USING btree (status);


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_due_date ON public.subscription_invoices USING btree (due_date);


--
-- Name: idx_invoices_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_number ON public.subscription_invoices USING btree (invoice_number);


--
-- Name: idx_invoices_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_org ON public.subscription_invoices USING btree (org_id);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.subscription_invoices USING btree (payment_status);


--
-- Name: idx_lead_scores_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_scores_category ON public.contact_lead_scores USING btree (org_id, score_category);


--
-- Name: idx_lead_scores_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_scores_contact ON public.contact_lead_scores USING btree (contact_id);


--
-- Name: idx_lead_scores_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_scores_score ON public.contact_lead_scores USING btree (org_id, score DESC);


--
-- Name: idx_monthly_actuals_org_year_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monthly_actuals_org_year_month ON public.monthly_actuals_snapshot USING btree (org_id, year, month);


--
-- Name: idx_notifications_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_expires_at ON public.notifications USING btree (expires_at);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_org ON public.subscription_notifications USING btree (org_id);


--
-- Name: idx_notifications_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_org_id ON public.notifications USING btree (org_id);


--
-- Name: idx_notifications_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_sent ON public.subscription_notifications USING btree (sent_at DESC);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.subscription_notifications USING btree (notification_type);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_operation_queue_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operation_queue_org ON public.operation_queue USING btree (org_id);


--
-- Name: idx_operation_queue_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operation_queue_scheduled ON public.operation_queue USING btree (scheduled_at) WHERE (status = 'queued'::text);


--
-- Name: idx_operation_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operation_queue_status ON public.operation_queue USING btree (status);


--
-- Name: idx_operation_queue_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operation_queue_type_status ON public.operation_queue USING btree (operation_type, status);


--
-- Name: idx_operation_queue_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operation_queue_user ON public.operation_queue USING btree (user_id);


--
-- Name: idx_org_invites_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_invites_code ON public.org_invites USING btree (invite_code);


--
-- Name: idx_org_invites_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_invites_org_id ON public.org_invites USING btree (org_id);


--
-- Name: idx_org_subs_billing_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_subs_billing_date ON public.organization_subscriptions USING btree (next_billing_date);


--
-- Name: idx_org_subs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_subs_org ON public.organization_subscriptions USING btree (org_id);


--
-- Name: idx_org_subs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_subs_status ON public.organization_subscriptions USING btree (subscription_status);


--
-- Name: idx_outbound_webhook_logs_org_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_webhook_logs_org_sent ON public.outbound_webhook_logs USING btree (org_id, sent_at DESC);


--
-- Name: idx_outbound_webhook_logs_succeeded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_webhook_logs_succeeded ON public.outbound_webhook_logs USING btree (webhook_id, succeeded);


--
-- Name: idx_outbound_webhook_logs_webhook; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_webhook_logs_webhook ON public.outbound_webhook_logs USING btree (webhook_id);


--
-- Name: idx_outbound_webhooks_org_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_webhooks_org_active ON public.outbound_webhooks USING btree (org_id, is_active);


--
-- Name: idx_outbound_webhooks_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_webhooks_org_id ON public.outbound_webhooks USING btree (org_id);


--
-- Name: idx_outbound_webhooks_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_webhooks_trigger ON public.outbound_webhooks USING btree (trigger_event, is_active);


--
-- Name: idx_payments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_invoice ON public.payment_transactions USING btree (invoice_id);


--
-- Name: idx_payments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_org ON public.payment_transactions USING btree (org_id);


--
-- Name: idx_payments_razorpay_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_razorpay_order ON public.payment_transactions USING btree (razorpay_order_id);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payment_transactions USING btree (payment_status);


--
-- Name: idx_performance_daily_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_performance_daily_org_date ON public.automation_performance_daily USING btree (org_id, report_date DESC);


--
-- Name: idx_performance_daily_rule_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_performance_daily_rule_date ON public.automation_performance_daily USING btree (rule_id, report_date DESC);


--
-- Name: idx_pipeline_benchmarks_org_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_benchmarks_org_stage ON public.pipeline_benchmarks USING btree (org_id, stage_id);


--
-- Name: idx_pipeline_benchmarks_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_benchmarks_period ON public.pipeline_benchmarks USING btree (period_start, period_end);


--
-- Name: idx_pipeline_movement_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_movement_contact ON public.pipeline_movement_history USING btree (contact_id);


--
-- Name: idx_pipeline_movement_moved_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_movement_moved_at ON public.pipeline_movement_history USING btree (moved_at DESC);


--
-- Name: idx_pipeline_movement_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_movement_org ON public.pipeline_movement_history USING btree (org_id);


--
-- Name: idx_pipeline_movement_org_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_movement_org_stage ON public.pipeline_movement_history USING btree (org_id, to_stage_id, moved_at);


--
-- Name: idx_pipeline_movement_stages; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_movement_stages ON public.pipeline_movement_history USING btree (from_stage_id, to_stage_id);


--
-- Name: idx_pipeline_stages_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_stages_org_id ON public.pipeline_stages USING btree (org_id);


--
-- Name: idx_platform_admin_audit_log_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_admin_audit_log_admin_id ON public.platform_admin_audit_log USING btree (admin_id);


--
-- Name: idx_platform_admin_audit_log_target_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_admin_audit_log_target_org_id ON public.platform_admin_audit_log USING btree (target_org_id);


--
-- Name: idx_platform_email_sending_list_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_email_sending_list_email ON public.platform_email_sending_list USING btree (email);


--
-- Name: idx_platform_email_sending_list_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_email_sending_list_status ON public.platform_email_sending_list USING btree (is_unsubscribed, bounce_count);


--
-- Name: idx_pricing_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_active ON public.subscription_pricing USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_profiles_email ON public.profiles USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_profiles_id_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_id_org ON public.profiles USING btree (id, org_id);


--
-- Name: idx_profiles_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_is_active ON public.profiles USING btree (is_active);


--
-- Name: idx_profiles_is_platform_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_is_platform_admin ON public.profiles USING btree (is_platform_admin) WHERE (is_platform_admin = true);


--
-- Name: idx_profiles_onboarding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_onboarding ON public.profiles USING btree (onboarding_completed) WHERE (onboarding_completed = false);


--
-- Name: idx_profiles_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_org_id ON public.profiles USING btree (org_id);


--
-- Name: idx_rate_limit_log_org_operation_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limit_log_org_operation_time ON public.rate_limit_log USING btree (org_id, operation, created_at);


--
-- Name: idx_recurring_patterns_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_patterns_org_id ON public.recurring_activity_patterns USING btree (org_id);


--
-- Name: idx_redefine_repo_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redefine_repo_company ON public.redefine_data_repository USING btree (company_name);


--
-- Name: idx_redefine_repo_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redefine_repo_created_at ON public.redefine_data_repository USING btree (created_at DESC);


--
-- Name: idx_redefine_repo_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redefine_repo_email ON public.redefine_data_repository USING btree (official_email);


--
-- Name: idx_redefine_repo_mobile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redefine_repo_mobile ON public.redefine_data_repository USING btree (mobile_number);


--
-- Name: idx_redefine_repo_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redefine_repo_org_id ON public.redefine_data_repository USING btree (org_id);


--
-- Name: idx_redefine_repo_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redefine_repo_search ON public.redefine_data_repository USING gin (to_tsvector('english'::regconfig, ((((((((COALESCE(name, ''::text) || ' '::text) || COALESCE(company_name, ''::text)) || ' '::text) || COALESCE(designation, ''::text)) || ' '::text) || COALESCE(city, ''::text)) || ' '::text) || COALESCE(industry_type, ''::text))));


--
-- Name: idx_revenue_goals_org_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revenue_goals_org_period ON public.revenue_goals USING btree (org_id, period_start, period_end);


--
-- Name: idx_rule_dependencies_depends_on; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_dependencies_depends_on ON public.email_automation_rule_dependencies USING btree (depends_on_rule_id);


--
-- Name: idx_rule_dependencies_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_dependencies_rule ON public.email_automation_rule_dependencies USING btree (rule_id);


--
-- Name: idx_rule_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_templates_category ON public.email_automation_rule_templates USING btree (category);


--
-- Name: idx_rule_templates_popular; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_templates_popular ON public.email_automation_rule_templates USING btree (is_popular) WHERE (is_popular = true);


--
-- Name: idx_rules_org_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rules_org_active ON public.email_automation_rules USING btree (org_id, is_active);


--
-- Name: idx_rules_trigger_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rules_trigger_type ON public.email_automation_rules USING btree (trigger_type);


--
-- Name: idx_sms_campaign_recipients_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_campaign_recipients_campaign_id ON public.sms_campaign_recipients USING btree (campaign_id);


--
-- Name: idx_sms_campaign_recipients_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_campaign_recipients_status ON public.sms_campaign_recipients USING btree (status);


--
-- Name: idx_sms_messages_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_messages_contact_id ON public.sms_messages USING btree (contact_id);


--
-- Name: idx_sms_messages_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_messages_org_id ON public.sms_messages USING btree (org_id);


--
-- Name: idx_sms_messages_phone_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_messages_phone_number ON public.sms_messages USING btree (phone_number);


--
-- Name: idx_sms_messages_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_messages_sent_at ON public.sms_messages USING btree (sent_at DESC);


--
-- Name: idx_support_tickets_number_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_tickets_number_org ON public.support_tickets USING btree (org_id, ticket_number);


--
-- Name: idx_tag_assignments_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tag_assignments_contact ON public.contact_tag_assignments USING btree (contact_id);


--
-- Name: idx_tag_assignments_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tag_assignments_tag ON public.contact_tag_assignments USING btree (tag_id);


--
-- Name: idx_tasks_assigned_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_assigned_by ON public.tasks USING btree (assigned_by);


--
-- Name: idx_tasks_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_assigned_to ON public.tasks USING btree (assigned_to);


--
-- Name: idx_tasks_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_due_date ON public.tasks USING btree (due_date);


--
-- Name: idx_tasks_org_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_org_assigned ON public.tasks USING btree (org_id, assigned_to, status, due_date);


--
-- Name: idx_tasks_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_org_id ON public.tasks USING btree (org_id);


--
-- Name: idx_tasks_recurring; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_recurring ON public.tasks USING btree (recurring_pattern_id);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_ticket_notifications_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_notifications_ticket_id ON public.support_ticket_notifications USING btree (ticket_id);


--
-- Name: idx_unsubscribes_org_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unsubscribes_org_email ON public.email_unsubscribes USING btree (org_id, lower(email));


--
-- Name: idx_usage_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_created ON public.service_usage_logs USING btree (created_at DESC);


--
-- Name: idx_usage_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_org ON public.service_usage_logs USING btree (org_id);


--
-- Name: idx_usage_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_reference ON public.service_usage_logs USING btree (reference_id);


--
-- Name: idx_usage_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_service ON public.service_usage_logs USING btree (service_type);


--
-- Name: idx_user_module_usage_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_module_usage_user_id ON public.user_module_usage USING btree (user_id);


--
-- Name: idx_user_module_usage_visit_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_module_usage_visit_count ON public.user_module_usage USING btree (user_id, visit_count DESC);


--
-- Name: idx_user_roles_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_is_active ON public.user_roles USING btree (is_active);


--
-- Name: idx_user_roles_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_org_id ON public.user_roles USING btree (org_id);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: idx_user_roles_user_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_org ON public.user_roles USING btree (user_id, org_id);


--
-- Name: idx_wallet_txn_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_txn_created ON public.wallet_transactions USING btree (created_at DESC);


--
-- Name: idx_wallet_txn_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_txn_org ON public.wallet_transactions USING btree (org_id);


--
-- Name: idx_wallet_txn_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_txn_reference ON public.wallet_transactions USING btree (reference_id, reference_type);


--
-- Name: idx_wallet_txn_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_txn_type ON public.wallet_transactions USING btree (transaction_type);


--
-- Name: idx_whatsapp_campaigns_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_campaigns_scheduled ON public.whatsapp_bulk_campaigns USING btree (scheduled_at) WHERE (status = 'scheduled'::text);


--
-- Name: idx_whatsapp_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages USING btree (conversation_id, sent_at DESC);


--
-- Name: idx_whatsapp_messages_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_direction ON public.whatsapp_messages USING btree (org_id, direction, sent_at DESC);


--
-- Name: idx_whatsapp_messages_exotel_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_exotel_message_id ON public.whatsapp_messages USING btree (exotel_message_id);


--
-- Name: idx_whatsapp_messages_gupshup_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_gupshup_id ON public.whatsapp_messages USING btree (gupshup_message_id) WHERE (gupshup_message_id IS NOT NULL);


--
-- Name: idx_whatsapp_messages_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_scheduled ON public.whatsapp_messages USING btree (scheduled_at) WHERE (status = 'scheduled'::text);


--
-- Name: idx_whatsapp_messages_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_unread ON public.whatsapp_messages USING btree (org_id, read_at, sent_at DESC) WHERE ((read_at IS NULL) AND (direction = 'inbound'::text));


--
-- Name: forms auto_generate_webhook_token_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_generate_webhook_token_trigger BEFORE INSERT ON public.forms FOR EACH ROW EXECUTE FUNCTION public.auto_generate_webhook_token();


--
-- Name: contacts auto_populate_contact_comms_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_populate_contact_comms_trigger AFTER INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.auto_populate_contact_communications();


--
-- Name: contact_activities automation_activity_logged; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER automation_activity_logged AFTER INSERT ON public.contact_activities FOR EACH ROW EXECUTE FUNCTION public.trigger_activity_logged_automation();


--
-- Name: contacts automation_assignment_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER automation_assignment_changed AFTER UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.trigger_assignment_changed_automation();


--
-- Name: contact_activities automation_disposition_set; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER automation_disposition_set AFTER INSERT OR UPDATE ON public.contact_activities FOR EACH ROW EXECUTE FUNCTION public.trigger_disposition_set_automation();


--
-- Name: contact_custom_fields automation_field_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER automation_field_updated AFTER UPDATE ON public.contact_custom_fields FOR EACH ROW EXECUTE FUNCTION public.trigger_field_updated_automation();


--
-- Name: contacts automation_stage_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER automation_stage_change AFTER UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.trigger_stage_change_automation();


--
-- Name: email_conversations email_engagement_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_engagement_trigger AFTER UPDATE ON public.email_conversations FOR EACH ROW WHEN ((((old.opened_at IS NULL) AND (new.opened_at IS NOT NULL)) OR ((old.first_clicked_at IS NULL) AND (new.first_clicked_at IS NOT NULL)))) EXECUTE FUNCTION public.trigger_email_engagement_automation();


--
-- Name: user_roles enforce_admin_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_admin_limit BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.check_admin_limit();


--
-- Name: exotel_exophones ensure_single_default_exophone_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ensure_single_default_exophone_trigger BEFORE INSERT OR UPDATE ON public.exotel_exophones FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_exophone();


--
-- Name: contacts mark_conversions_on_deal_won; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mark_conversions_on_deal_won AFTER UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.auto_mark_automation_conversions();


--
-- Name: blog_posts on_blog_post_inserted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_blog_post_inserted AFTER INSERT ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.trigger_blog_post_email_campaign();


--
-- Name: contact_activities outbound_webhook_activity_logged; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outbound_webhook_activity_logged AFTER INSERT ON public.contact_activities FOR EACH ROW EXECUTE FUNCTION public.trigger_outbound_webhook('activity_logged');


--
-- Name: contacts outbound_webhook_assignment_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outbound_webhook_assignment_changed AFTER UPDATE OF assigned_to ON public.contacts FOR EACH ROW WHEN ((old.assigned_to IS DISTINCT FROM new.assigned_to)) EXECUTE FUNCTION public.trigger_outbound_webhook('assignment_changed');


--
-- Name: contacts outbound_webhook_contact_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outbound_webhook_contact_updated AFTER UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.trigger_outbound_webhook('contact_updated');


--
-- Name: contact_activities outbound_webhook_disposition_set; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outbound_webhook_disposition_set AFTER UPDATE OF call_disposition_id ON public.contact_activities FOR EACH ROW WHEN ((old.call_disposition_id IS DISTINCT FROM new.call_disposition_id)) EXECUTE FUNCTION public.trigger_outbound_webhook('disposition_set');


--
-- Name: contacts outbound_webhook_stage_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outbound_webhook_stage_changed AFTER UPDATE OF pipeline_stage_id ON public.contacts FOR EACH ROW WHEN ((old.pipeline_stage_id IS DISTINCT FROM new.pipeline_stage_id)) EXECUTE FUNCTION public.trigger_outbound_webhook('stage_changed');


--
-- Name: redefine_data_repository redefine_repository_audit_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER redefine_repository_audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.redefine_data_repository FOR EACH ROW EXECUTE FUNCTION public.log_redefine_repository_changes();


--
-- Name: support_tickets set_ticket_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ticket_number BEFORE INSERT ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.generate_ticket_number();


--
-- Name: profiles sync_email_on_profile_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_email_on_profile_insert AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_user_email();


--
-- Name: email_conversations sync_inbound_email_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_inbound_email_trigger AFTER INSERT ON public.email_conversations FOR EACH ROW WHEN (((new.direction = 'inbound'::text) AND (new.contact_id IS NOT NULL))) EXECUTE FUNCTION public.sync_inbound_email_to_activity();


--
-- Name: email_conversations sync_outbound_email_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_outbound_email_trigger AFTER INSERT ON public.email_conversations FOR EACH ROW WHEN (((new.direction = 'outbound'::text) AND (new.contact_id IS NOT NULL))) EXECUTE FUNCTION public.sync_outbound_email_to_activity();


--
-- Name: contact_tag_assignments tag_assignment_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tag_assignment_trigger AFTER INSERT ON public.contact_tag_assignments FOR EACH ROW EXECUTE FUNCTION public.trigger_tag_assigned_automation();


--
-- Name: tasks task_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER task_status_change BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_task_completed_at();


--
-- Name: contacts track_pipeline_movement_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER track_pipeline_movement_trigger AFTER UPDATE OF pipeline_stage_id ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.track_pipeline_movement();


--
-- Name: support_tickets trg_set_ticket_deadline; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_ticket_deadline BEFORE INSERT ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.set_ticket_deadline();


--
-- Name: chat_conversations trigger_chat_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION public.update_chat_updated_at();


--
-- Name: chat_messages trigger_chat_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_chat_messages_updated_at BEFORE UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.update_chat_updated_at();


--
-- Name: contacts trigger_contact_auto_enrich_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_contact_auto_enrich_insert AFTER INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.trigger_auto_enrichment();


--
-- Name: contacts trigger_contact_auto_enrich_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_contact_auto_enrich_update AFTER UPDATE ON public.contacts FOR EACH ROW WHEN ((old.email IS DISTINCT FROM new.email)) EXECUTE FUNCTION public.trigger_auto_enrichment();


--
-- Name: contacts trigger_contact_created_webhook; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_contact_created_webhook AFTER INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.trigger_outbound_webhook('contact_created');


--
-- Name: contacts trigger_log_contact_creation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_log_contact_creation AFTER INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.log_contact_creation_activity();


--
-- Name: contact_emails trigger_sync_primary_email; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_sync_primary_email AFTER INSERT OR DELETE OR UPDATE ON public.contact_emails FOR EACH ROW EXECUTE FUNCTION public.sync_primary_email_to_contact();


--
-- Name: chat_messages trigger_update_conversation_last_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_conversation_last_message AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message_at();


--
-- Name: contact_activities update_activities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_activities_updated_at BEFORE UPDATE ON public.contact_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: api_keys update_api_keys_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: approval_rules update_approval_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_approval_rules_updated_at BEFORE UPDATE ON public.approval_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: approval_types update_approval_types_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_approval_types_updated_at BEFORE UPDATE ON public.approval_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: blog_posts update_blog_posts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: calendar_shares update_calendar_shares_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_calendar_shares_updated_at BEFORE UPDATE ON public.calendar_shares FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: call_dispositions update_call_dispositions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_call_dispositions_updated_at BEFORE UPDATE ON public.call_dispositions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: call_sub_dispositions update_call_sub_dispositions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_call_sub_dispositions_updated_at BEFORE UPDATE ON public.call_sub_dispositions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_campaign_recipients update_campaign_recipients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_campaign_recipients_updated_at BEFORE UPDATE ON public.whatsapp_campaign_recipients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_bulk_campaigns update_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.whatsapp_bulk_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: client_documents update_client_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_client_documents_updated_at BEFORE UPDATE ON public.client_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: client_invoices update_client_invoices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_client_invoices_updated_at BEFORE UPDATE ON public.client_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: communication_templates update_communication_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_communication_templates_updated_at BEFORE UPDATE ON public.communication_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contact_custom_fields update_contact_custom_fields_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contact_custom_fields_updated_at BEFORE UPDATE ON public.contact_custom_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contact_emails update_contact_emails_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contact_emails_updated_at BEFORE UPDATE ON public.contact_emails FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contact_phones update_contact_phones_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contact_phones_updated_at BEFORE UPDATE ON public.contact_phones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contacts update_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: custom_fields update_custom_fields_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_custom_fields_updated_at BEFORE UPDATE ON public.custom_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: designation_feature_access update_designation_feature_access_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_designation_feature_access_updated_at BEFORE UPDATE ON public.designation_feature_access FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: designations update_designations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_designations_updated_at BEFORE UPDATE ON public.designations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_automation_executions update_email_automation_executions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_automation_executions_updated_at BEFORE UPDATE ON public.email_automation_executions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_automation_rules update_email_automation_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_automation_rules_updated_at BEFORE UPDATE ON public.email_automation_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_bulk_campaigns update_email_bulk_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_bulk_campaigns_updated_at BEFORE UPDATE ON public.email_bulk_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_campaign_recipients update_email_campaign_recipients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_campaign_recipients_updated_at BEFORE UPDATE ON public.email_campaign_recipients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_conversations update_email_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_conversations_updated_at BEFORE UPDATE ON public.email_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_settings update_email_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_settings_updated_at BEFORE UPDATE ON public.email_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_templates update_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: exotel_exophones update_exotel_exophones_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_exotel_exophones_updated_at BEFORE UPDATE ON public.exotel_exophones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: exotel_settings update_exotel_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_exotel_settings_updated_at BEFORE UPDATE ON public.exotel_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: external_entities update_external_entities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_external_entities_updated_at BEFORE UPDATE ON public.external_entities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: forms update_forms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON public.forms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: gst_payment_tracking update_gst_payment_tracking_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_gst_payment_tracking_updated_at BEFORE UPDATE ON public.gst_payment_tracking FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: inventory_items update_inventory_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: invoice_import_items update_invoice_import_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_invoice_import_items_updated_at BEFORE UPDATE ON public.invoice_import_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: monthly_actuals_snapshot update_monthly_actuals_snapshot_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_monthly_actuals_snapshot_updated_at BEFORE UPDATE ON public.monthly_actuals_snapshot FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: operation_queue update_operation_queue_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_operation_queue_updated_at BEFORE UPDATE ON public.operation_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: org_feature_access update_org_feature_access_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_org_feature_access_updated_at BEFORE UPDATE ON public.org_feature_access FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: org_invites update_org_invites_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_org_invites_updated_at BEFORE UPDATE ON public.org_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: organizations update_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pipeline_stages update_pipeline_stages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pipeline_stages_updated_at BEFORE UPDATE ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: recurring_activity_patterns update_recurring_patterns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_recurring_patterns_updated_at BEFORE UPDATE ON public.recurring_activity_patterns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: redefine_data_repository update_redefine_repository_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_redefine_repository_updated_at BEFORE UPDATE ON public.redefine_data_repository FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: reporting_hierarchy update_reporting_hierarchy_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_reporting_hierarchy_updated_at BEFORE UPDATE ON public.reporting_hierarchy FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: revenue_goals update_revenue_goals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_revenue_goals_updated_at BEFORE UPDATE ON public.revenue_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: saved_reports update_saved_reports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_saved_reports_updated_at BEFORE UPDATE ON public.saved_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: support_tickets update_support_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tasks update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: teams update_teams_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_settings update_whatsapp_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_settings_updated_at BEFORE UPDATE ON public.whatsapp_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: support_ticket_comments webhook_support_ticket_comments_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER webhook_support_ticket_comments_insert AFTER INSERT ON public.support_ticket_comments FOR EACH ROW EXECUTE FUNCTION public.trigger_outbound_webhook_generic();


--
-- Name: support_ticket_escalations webhook_support_ticket_escalations_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER webhook_support_ticket_escalations_insert AFTER INSERT ON public.support_ticket_escalations FOR EACH ROW EXECUTE FUNCTION public.trigger_outbound_webhook_generic();


--
-- Name: support_ticket_history webhook_support_ticket_history_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER webhook_support_ticket_history_insert AFTER INSERT ON public.support_ticket_history FOR EACH ROW EXECUTE FUNCTION public.trigger_outbound_webhook_generic();


--
-- Name: support_tickets webhook_support_tickets_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER webhook_support_tickets_delete AFTER DELETE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.trigger_outbound_webhook_generic();


--
-- Name: support_tickets webhook_support_tickets_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER webhook_support_tickets_insert AFTER INSERT ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.trigger_outbound_webhook_generic();


--
-- Name: support_tickets webhook_support_tickets_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER webhook_support_tickets_update AFTER UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.trigger_outbound_webhook_generic();


--
-- Name: activity_participants activity_participants_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_participants
    ADD CONSTRAINT activity_participants_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.contact_activities(id) ON DELETE CASCADE;


--
-- Name: activity_participants activity_participants_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_participants
    ADD CONSTRAINT activity_participants_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: activity_participants activity_participants_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_participants
    ADD CONSTRAINT activity_participants_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: activity_participants activity_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_participants
    ADD CONSTRAINT activity_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_call_sessions agent_call_sessions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_call_sessions
    ADD CONSTRAINT agent_call_sessions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_call_sessions agent_call_sessions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_call_sessions
    ADD CONSTRAINT agent_call_sessions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: agent_call_sessions agent_call_sessions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_call_sessions
    ADD CONSTRAINT agent_call_sessions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: api_key_usage_logs api_key_usage_logs_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key_usage_logs
    ADD CONSTRAINT api_key_usage_logs_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE CASCADE;


--
-- Name: api_key_usage_logs api_key_usage_logs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key_usage_logs
    ADD CONSTRAINT api_key_usage_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: approval_rules approval_rules_approval_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_approval_type_id_fkey FOREIGN KEY (approval_type_id) REFERENCES public.approval_types(id) ON DELETE CASCADE;


--
-- Name: approval_rules approval_rules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: approval_types approval_types_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_types
    ADD CONSTRAINT approval_types_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: automation_ab_tests automation_ab_tests_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_ab_tests
    ADD CONSTRAINT automation_ab_tests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: automation_ab_tests automation_ab_tests_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_ab_tests
    ADD CONSTRAINT automation_ab_tests_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.email_automation_rules(id) ON DELETE CASCADE;


--
-- Name: automation_approvals automation_approvals_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_approvals
    ADD CONSTRAINT automation_approvals_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.email_automation_executions(id) ON DELETE CASCADE;


--
-- Name: automation_approvals automation_approvals_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_approvals
    ADD CONSTRAINT automation_approvals_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: automation_approvals automation_approvals_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_approvals
    ADD CONSTRAINT automation_approvals_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);


--
-- Name: automation_approvals automation_approvals_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_approvals
    ADD CONSTRAINT automation_approvals_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: automation_approvals automation_approvals_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_approvals
    ADD CONSTRAINT automation_approvals_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.email_automation_rules(id) ON DELETE CASCADE;


--
-- Name: automation_performance_daily automation_performance_daily_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_performance_daily
    ADD CONSTRAINT automation_performance_daily_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: automation_performance_daily automation_performance_daily_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_performance_daily
    ADD CONSTRAINT automation_performance_daily_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.email_automation_rules(id) ON DELETE CASCADE;


--
-- Name: blog_posts blog_posts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: bulk_import_history bulk_import_history_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_import_history
    ADD CONSTRAINT bulk_import_history_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: bulk_import_history bulk_import_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_import_history
    ADD CONSTRAINT bulk_import_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: bulk_import_records bulk_import_records_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_import_records
    ADD CONSTRAINT bulk_import_records_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.bulk_import_history(id) ON DELETE CASCADE;


--
-- Name: calendar_shares calendar_shares_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_shares
    ADD CONSTRAINT calendar_shares_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: call_dispositions call_dispositions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_dispositions
    ADD CONSTRAINT call_dispositions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: call_logs call_logs_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.contact_activities(id);


--
-- Name: call_logs call_logs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: call_logs call_logs_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: call_logs call_logs_disposition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_disposition_id_fkey FOREIGN KEY (disposition_id) REFERENCES public.call_dispositions(id);


--
-- Name: call_logs call_logs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: call_logs call_logs_sub_disposition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_sub_disposition_id_fkey FOREIGN KEY (sub_disposition_id) REFERENCES public.call_sub_dispositions(id);


--
-- Name: call_sub_dispositions call_sub_dispositions_disposition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sub_dispositions
    ADD CONSTRAINT call_sub_dispositions_disposition_id_fkey FOREIGN KEY (disposition_id) REFERENCES public.call_dispositions(id) ON DELETE CASCADE;


--
-- Name: call_sub_dispositions call_sub_dispositions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sub_dispositions
    ADD CONSTRAINT call_sub_dispositions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: campaign_analytics campaign_analytics_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_analytics
    ADD CONSTRAINT campaign_analytics_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: campaign_insights campaign_insights_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_insights
    ADD CONSTRAINT campaign_insights_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: carry_forward_snapshot carry_forward_snapshot_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carry_forward_snapshot
    ADD CONSTRAINT carry_forward_snapshot_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: chat_conversations chat_conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: chat_conversations chat_conversations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: chat_message_reactions chat_message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_reactions
    ADD CONSTRAINT chat_message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_message_reactions chat_message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_reactions
    ADD CONSTRAINT chat_message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


--
-- Name: chat_messages chat_messages_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: chat_participants chat_participants_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_participants chat_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: client_alternate_contacts client_alternate_contacts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_alternate_contacts
    ADD CONSTRAINT client_alternate_contacts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_alternate_contacts client_alternate_contacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_alternate_contacts
    ADD CONSTRAINT client_alternate_contacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: client_alternate_contacts client_alternate_contacts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_alternate_contacts
    ADD CONSTRAINT client_alternate_contacts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: client_documents client_documents_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_documents client_documents_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: client_documents client_documents_external_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_external_entity_id_fkey FOREIGN KEY (external_entity_id) REFERENCES public.external_entities(id) ON DELETE SET NULL;


--
-- Name: client_documents client_documents_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: client_documents client_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);


--
-- Name: client_invoices client_invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_invoices
    ADD CONSTRAINT client_invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_invoices client_invoices_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_invoices
    ADD CONSTRAINT client_invoices_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: client_invoices client_invoices_converted_from_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_invoices
    ADD CONSTRAINT client_invoices_converted_from_quotation_id_fkey FOREIGN KEY (converted_from_quotation_id) REFERENCES public.client_invoices(id);


--
-- Name: client_invoices client_invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_invoices
    ADD CONSTRAINT client_invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: client_invoices client_invoices_external_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_invoices
    ADD CONSTRAINT client_invoices_external_entity_id_fkey FOREIGN KEY (external_entity_id) REFERENCES public.external_entities(id) ON DELETE SET NULL;


--
-- Name: client_invoices client_invoices_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_invoices
    ADD CONSTRAINT client_invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: clients clients_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: clients clients_converted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_converted_by_fkey FOREIGN KEY (converted_by) REFERENCES public.profiles(id);


--
-- Name: clients clients_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: communication_templates communication_templates_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_templates
    ADD CONSTRAINT communication_templates_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: connector_logs connector_logs_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_logs
    ADD CONSTRAINT connector_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: connector_logs connector_logs_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_logs
    ADD CONSTRAINT connector_logs_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;


--
-- Name: connector_logs connector_logs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_logs
    ADD CONSTRAINT connector_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contact_activities contact_activities_call_disposition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_call_disposition_id_fkey FOREIGN KEY (call_disposition_id) REFERENCES public.call_dispositions(id) ON DELETE SET NULL;


--
-- Name: contact_activities contact_activities_call_sub_disposition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_call_sub_disposition_id_fkey FOREIGN KEY (call_sub_disposition_id) REFERENCES public.call_sub_dispositions(id) ON DELETE SET NULL;


--
-- Name: contact_activities contact_activities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_activities contact_activities_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contact_activities contact_activities_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contact_activities contact_activities_recurring_pattern_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_recurring_pattern_id_fkey FOREIGN KEY (recurring_pattern_id) REFERENCES public.recurring_activity_patterns(id) ON DELETE SET NULL;


--
-- Name: contact_custom_fields contact_custom_fields_custom_field_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_fields
    ADD CONSTRAINT contact_custom_fields_custom_field_id_fkey FOREIGN KEY (custom_field_id) REFERENCES public.custom_fields(id) ON DELETE CASCADE;


--
-- Name: contact_emails contact_emails_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_emails
    ADD CONSTRAINT contact_emails_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_enrichment_logs contact_enrichment_logs_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_enrichment_logs
    ADD CONSTRAINT contact_enrichment_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_enrichment_logs contact_enrichment_logs_enriched_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_enrichment_logs
    ADD CONSTRAINT contact_enrichment_logs_enriched_by_fkey FOREIGN KEY (enriched_by) REFERENCES public.profiles(id);


--
-- Name: contact_enrichment_logs contact_enrichment_logs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_enrichment_logs
    ADD CONSTRAINT contact_enrichment_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contact_enrichment_runs contact_enrichment_runs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_enrichment_runs
    ADD CONSTRAINT contact_enrichment_runs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contact_lead_scores contact_lead_scores_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_lead_scores
    ADD CONSTRAINT contact_lead_scores_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_lead_scores contact_lead_scores_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_lead_scores
    ADD CONSTRAINT contact_lead_scores_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contact_phones contact_phones_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_phones
    ADD CONSTRAINT contact_phones_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_tag_assignments contact_tag_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tag_assignments
    ADD CONSTRAINT contact_tag_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id);


--
-- Name: contact_tag_assignments contact_tag_assignments_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tag_assignments
    ADD CONSTRAINT contact_tag_assignments_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_tag_assignments contact_tag_assignments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tag_assignments
    ADD CONSTRAINT contact_tag_assignments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contact_tag_assignments contact_tag_assignments_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tag_assignments
    ADD CONSTRAINT contact_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.contact_tags(id) ON DELETE CASCADE;


--
-- Name: contact_tags contact_tags_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_assigned_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_assigned_team_id_fkey FOREIGN KEY (assigned_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_pipeline_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pipeline_stage_id_fkey FOREIGN KEY (pipeline_stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;


--
-- Name: designation_feature_access designation_feature_access_designation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designation_feature_access
    ADD CONSTRAINT designation_feature_access_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES public.designations(id) ON DELETE CASCADE;


--
-- Name: designation_feature_access designation_feature_access_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designation_feature_access
    ADD CONSTRAINT designation_feature_access_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_automation_cooldowns email_automation_cooldowns_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_cooldowns
    ADD CONSTRAINT email_automation_cooldowns_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: email_automation_cooldowns email_automation_cooldowns_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_cooldowns
    ADD CONSTRAINT email_automation_cooldowns_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_automation_cooldowns email_automation_cooldowns_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_cooldowns
    ADD CONSTRAINT email_automation_cooldowns_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.email_automation_rules(id) ON DELETE CASCADE;


--
-- Name: email_automation_daily_limits email_automation_daily_limits_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_daily_limits
    ADD CONSTRAINT email_automation_daily_limits_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: email_automation_daily_limits email_automation_daily_limits_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_daily_limits
    ADD CONSTRAINT email_automation_daily_limits_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_automation_executions email_automation_executions_ab_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_executions
    ADD CONSTRAINT email_automation_executions_ab_test_id_fkey FOREIGN KEY (ab_test_id) REFERENCES public.automation_ab_tests(id) ON DELETE SET NULL;


--
-- Name: email_automation_executions email_automation_executions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_executions
    ADD CONSTRAINT email_automation_executions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: email_automation_executions email_automation_executions_email_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_executions
    ADD CONSTRAINT email_automation_executions_email_conversation_id_fkey FOREIGN KEY (email_conversation_id) REFERENCES public.email_conversations(id) ON DELETE SET NULL;


--
-- Name: email_automation_executions email_automation_executions_email_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_executions
    ADD CONSTRAINT email_automation_executions_email_template_id_fkey FOREIGN KEY (email_template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: email_automation_executions email_automation_executions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_executions
    ADD CONSTRAINT email_automation_executions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_automation_executions email_automation_executions_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_executions
    ADD CONSTRAINT email_automation_executions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.email_automation_rules(id) ON DELETE CASCADE;


--
-- Name: email_automation_rule_dependencies email_automation_rule_dependencies_depends_on_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_rule_dependencies
    ADD CONSTRAINT email_automation_rule_dependencies_depends_on_rule_id_fkey FOREIGN KEY (depends_on_rule_id) REFERENCES public.email_automation_rules(id) ON DELETE CASCADE;


--
-- Name: email_automation_rule_dependencies email_automation_rule_dependencies_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_rule_dependencies
    ADD CONSTRAINT email_automation_rule_dependencies_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_automation_rule_dependencies email_automation_rule_dependencies_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_rule_dependencies
    ADD CONSTRAINT email_automation_rule_dependencies_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.email_automation_rules(id) ON DELETE CASCADE;


--
-- Name: email_automation_rules email_automation_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_rules
    ADD CONSTRAINT email_automation_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: email_automation_rules email_automation_rules_email_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_rules
    ADD CONSTRAINT email_automation_rules_email_template_id_fkey FOREIGN KEY (email_template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: email_automation_rules email_automation_rules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_rules
    ADD CONSTRAINT email_automation_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_bulk_campaigns email_bulk_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_bulk_campaigns
    ADD CONSTRAINT email_bulk_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: email_bulk_campaigns email_bulk_campaigns_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_bulk_campaigns
    ADD CONSTRAINT email_bulk_campaigns_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_bulk_campaigns email_bulk_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_bulk_campaigns
    ADD CONSTRAINT email_bulk_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: email_campaign_recipients email_campaign_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_bulk_campaigns(id) ON DELETE CASCADE;


--
-- Name: email_campaign_recipients email_campaign_recipients_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: email_conversations email_conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: email_conversations email_conversations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: email_conversations email_conversations_replied_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_replied_to_message_id_fkey FOREIGN KEY (replied_to_message_id) REFERENCES public.email_conversations(id);


--
-- Name: email_conversations email_conversations_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id);


--
-- Name: email_engagement_patterns email_engagement_patterns_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_engagement_patterns
    ADD CONSTRAINT email_engagement_patterns_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: email_engagement_patterns email_engagement_patterns_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_engagement_patterns
    ADD CONSTRAINT email_engagement_patterns_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_settings email_settings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_settings
    ADD CONSTRAINT email_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_suppression_list email_suppression_list_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppression_list
    ADD CONSTRAINT email_suppression_list_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_suppression_list email_suppression_list_suppressed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppression_list
    ADD CONSTRAINT email_suppression_list_suppressed_by_fkey FOREIGN KEY (suppressed_by) REFERENCES auth.users(id);


--
-- Name: email_templates email_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: email_templates email_templates_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_unsubscribes email_unsubscribes_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribes
    ADD CONSTRAINT email_unsubscribes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: email_unsubscribes email_unsubscribes_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribes
    ADD CONSTRAINT email_unsubscribes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: error_logs error_logs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: error_logs error_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: exotel_exophones exotel_exophones_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exotel_exophones
    ADD CONSTRAINT exotel_exophones_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: exotel_settings exotel_settings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exotel_settings
    ADD CONSTRAINT exotel_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: external_entities external_entities_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_entities
    ADD CONSTRAINT external_entities_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: external_entities external_entities_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_entities
    ADD CONSTRAINT external_entities_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: form_fields form_fields_custom_field_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_fields
    ADD CONSTRAINT form_fields_custom_field_id_fkey FOREIGN KEY (custom_field_id) REFERENCES public.custom_fields(id) ON DELETE CASCADE;


--
-- Name: form_fields form_fields_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_fields
    ADD CONSTRAINT form_fields_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;


--
-- Name: google_oauth_tokens google_oauth_tokens_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_oauth_tokens
    ADD CONSTRAINT google_oauth_tokens_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: gst_payment_tracking gst_payment_tracking_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gst_payment_tracking
    ADD CONSTRAINT gst_payment_tracking_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: gst_payment_tracking gst_payment_tracking_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gst_payment_tracking
    ADD CONSTRAINT gst_payment_tracking_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: import_jobs import_jobs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: inventory_items inventory_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: inventory_items inventory_items_import_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_import_job_id_fkey FOREIGN KEY (import_job_id) REFERENCES public.import_jobs(id);


--
-- Name: invoice_import_items invoice_import_items_created_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_import_items
    ADD CONSTRAINT invoice_import_items_created_client_id_fkey FOREIGN KEY (created_client_id) REFERENCES public.clients(id);


--
-- Name: invoice_import_items invoice_import_items_created_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_import_items
    ADD CONSTRAINT invoice_import_items_created_contact_id_fkey FOREIGN KEY (created_contact_id) REFERENCES public.contacts(id);


--
-- Name: invoice_import_items invoice_import_items_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_import_items
    ADD CONSTRAINT invoice_import_items_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.invoice_imports(id) ON DELETE CASCADE;


--
-- Name: invoice_import_items invoice_import_items_matched_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_import_items
    ADD CONSTRAINT invoice_import_items_matched_client_id_fkey FOREIGN KEY (matched_client_id) REFERENCES public.clients(id);


--
-- Name: invoice_import_items invoice_import_items_matched_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_import_items
    ADD CONSTRAINT invoice_import_items_matched_contact_id_fkey FOREIGN KEY (matched_contact_id) REFERENCES public.contacts(id);


--
-- Name: invoice_import_items invoice_import_items_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_import_items
    ADD CONSTRAINT invoice_import_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: invoice_imports invoice_imports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_imports
    ADD CONSTRAINT invoice_imports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: invoice_imports invoice_imports_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_imports
    ADD CONSTRAINT invoice_imports_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: monthly_actuals_snapshot monthly_actuals_snapshot_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_actuals_snapshot
    ADD CONSTRAINT monthly_actuals_snapshot_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: operation_queue operation_queue_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operation_queue
    ADD CONSTRAINT operation_queue_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: operation_queue operation_queue_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operation_queue
    ADD CONSTRAINT operation_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: org_business_hours org_business_hours_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_business_hours
    ADD CONSTRAINT org_business_hours_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_feature_access org_feature_access_modified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_feature_access
    ADD CONSTRAINT org_feature_access_modified_by_fkey FOREIGN KEY (modified_by) REFERENCES auth.users(id);


--
-- Name: org_feature_access org_feature_access_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_feature_access
    ADD CONSTRAINT org_feature_access_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_invites org_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: org_invites org_invites_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_invites org_invites_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id);


--
-- Name: organization_subscriptions organization_subscriptions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscriptions
    ADD CONSTRAINT organization_subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_subscriptions organization_subscriptions_override_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscriptions
    ADD CONSTRAINT organization_subscriptions_override_by_fkey FOREIGN KEY (override_by) REFERENCES auth.users(id);


--
-- Name: outbound_webhook_logs outbound_webhook_logs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_webhook_logs
    ADD CONSTRAINT outbound_webhook_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: outbound_webhook_logs outbound_webhook_logs_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_webhook_logs
    ADD CONSTRAINT outbound_webhook_logs_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.outbound_webhooks(id) ON DELETE CASCADE;


--
-- Name: outbound_webhooks outbound_webhooks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_webhooks
    ADD CONSTRAINT outbound_webhooks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: outbound_webhooks outbound_webhooks_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_webhooks
    ADD CONSTRAINT outbound_webhooks_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: payment_transactions payment_transactions_initiated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES auth.users(id);


--
-- Name: payment_transactions payment_transactions_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.subscription_invoices(id);


--
-- Name: payment_transactions payment_transactions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: pipeline_benchmarks pipeline_benchmarks_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_benchmarks
    ADD CONSTRAINT pipeline_benchmarks_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: pipeline_benchmarks pipeline_benchmarks_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_benchmarks
    ADD CONSTRAINT pipeline_benchmarks_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE CASCADE;


--
-- Name: pipeline_movement_history pipeline_movement_history_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_movement_history
    ADD CONSTRAINT pipeline_movement_history_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: pipeline_movement_history pipeline_movement_history_from_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_movement_history
    ADD CONSTRAINT pipeline_movement_history_from_stage_id_fkey FOREIGN KEY (from_stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;


--
-- Name: pipeline_movement_history pipeline_movement_history_moved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_movement_history
    ADD CONSTRAINT pipeline_movement_history_moved_by_fkey FOREIGN KEY (moved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pipeline_movement_history pipeline_movement_history_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_movement_history
    ADD CONSTRAINT pipeline_movement_history_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: pipeline_movement_history pipeline_movement_history_to_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_movement_history
    ADD CONSTRAINT pipeline_movement_history_to_stage_id_fkey FOREIGN KEY (to_stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;


--
-- Name: pipeline_stages pipeline_stages_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: platform_admin_audit_log platform_admin_audit_log_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_audit_log
    ADD CONSTRAINT platform_admin_audit_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: platform_admin_audit_log platform_admin_audit_log_target_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_audit_log
    ADD CONSTRAINT platform_admin_audit_log_target_org_id_fkey FOREIGN KEY (target_org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: platform_admin_audit_log platform_admin_audit_log_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_audit_log
    ADD CONSTRAINT platform_admin_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_designation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES public.designations(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: recurring_activity_patterns recurring_activity_patterns_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_activity_patterns
    ADD CONSTRAINT recurring_activity_patterns_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id);


--
-- Name: recurring_activity_patterns recurring_activity_patterns_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_activity_patterns
    ADD CONSTRAINT recurring_activity_patterns_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: recurring_activity_patterns recurring_activity_patterns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_activity_patterns
    ADD CONSTRAINT recurring_activity_patterns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: recurring_activity_patterns recurring_activity_patterns_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_activity_patterns
    ADD CONSTRAINT recurring_activity_patterns_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: redefine_data_repository redefine_data_repository_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redefine_data_repository
    ADD CONSTRAINT redefine_data_repository_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: redefine_data_repository redefine_data_repository_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redefine_data_repository
    ADD CONSTRAINT redefine_data_repository_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: redefine_repository_audit redefine_repository_audit_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redefine_repository_audit
    ADD CONSTRAINT redefine_repository_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);


--
-- Name: redefine_repository_audit redefine_repository_audit_repository_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redefine_repository_audit
    ADD CONSTRAINT redefine_repository_audit_repository_record_id_fkey FOREIGN KEY (repository_record_id) REFERENCES public.redefine_data_repository(id) ON DELETE CASCADE;


--
-- Name: reporting_hierarchy reporting_hierarchy_designation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporting_hierarchy
    ADD CONSTRAINT reporting_hierarchy_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES public.designations(id) ON DELETE CASCADE;


--
-- Name: reporting_hierarchy reporting_hierarchy_reports_to_designation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporting_hierarchy
    ADD CONSTRAINT reporting_hierarchy_reports_to_designation_id_fkey FOREIGN KEY (reports_to_designation_id) REFERENCES public.designations(id) ON DELETE CASCADE;


--
-- Name: revenue_goals revenue_goals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_goals
    ADD CONSTRAINT revenue_goals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: revenue_goals revenue_goals_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_goals
    ADD CONSTRAINT revenue_goals_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: saved_reports saved_reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reports
    ADD CONSTRAINT saved_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: saved_reports saved_reports_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reports
    ADD CONSTRAINT saved_reports_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: service_usage_logs service_usage_logs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_usage_logs
    ADD CONSTRAINT service_usage_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: service_usage_logs service_usage_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_usage_logs
    ADD CONSTRAINT service_usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: service_usage_logs service_usage_logs_wallet_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_usage_logs
    ADD CONSTRAINT service_usage_logs_wallet_transaction_id_fkey FOREIGN KEY (wallet_transaction_id) REFERENCES public.wallet_transactions(id);


--
-- Name: sms_bulk_campaigns sms_bulk_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_bulk_campaigns
    ADD CONSTRAINT sms_bulk_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: sms_bulk_campaigns sms_bulk_campaigns_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_bulk_campaigns
    ADD CONSTRAINT sms_bulk_campaigns_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sms_campaign_recipients sms_campaign_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_campaign_recipients
    ADD CONSTRAINT sms_campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.sms_bulk_campaigns(id) ON DELETE CASCADE;


--
-- Name: sms_campaign_recipients sms_campaign_recipients_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_campaign_recipients
    ADD CONSTRAINT sms_campaign_recipients_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: sms_campaign_recipients sms_campaign_recipients_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_campaign_recipients
    ADD CONSTRAINT sms_campaign_recipients_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sms_messages sms_messages_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: sms_messages sms_messages_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sms_messages sms_messages_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: subscription_audit_log subscription_audit_log_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_audit_log
    ADD CONSTRAINT subscription_audit_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: subscription_audit_log subscription_audit_log_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_audit_log
    ADD CONSTRAINT subscription_audit_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id);


--
-- Name: subscription_invoices subscription_invoices_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: subscription_invoices subscription_invoices_waived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_waived_by_fkey FOREIGN KEY (waived_by) REFERENCES auth.users(id);


--
-- Name: subscription_notifications subscription_notifications_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_notifications
    ADD CONSTRAINT subscription_notifications_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.subscription_invoices(id);


--
-- Name: subscription_notifications subscription_notifications_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_notifications
    ADD CONSTRAINT subscription_notifications_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: subscription_pricing subscription_pricing_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_pricing
    ADD CONSTRAINT subscription_pricing_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: support_ticket_comments support_ticket_comments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_comments
    ADD CONSTRAINT support_ticket_comments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: support_ticket_comments support_ticket_comments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_comments
    ADD CONSTRAINT support_ticket_comments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_ticket_comments support_ticket_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_comments
    ADD CONSTRAINT support_ticket_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: support_ticket_escalations support_ticket_escalations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_escalations
    ADD CONSTRAINT support_ticket_escalations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: support_ticket_escalations support_ticket_escalations_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_escalations
    ADD CONSTRAINT support_ticket_escalations_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_ticket_history support_ticket_history_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_history
    ADD CONSTRAINT support_ticket_history_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_ticket_history support_ticket_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_history
    ADD CONSTRAINT support_ticket_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: support_ticket_notifications support_ticket_notifications_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_notifications
    ADD CONSTRAINT support_ticket_notifications_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: support_ticket_notifications support_ticket_notifications_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_notifications
    ADD CONSTRAINT support_ticket_notifications_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);


--
-- Name: support_tickets support_tickets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: support_tickets support_tickets_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: tasks tasks_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_recurring_pattern_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_recurring_pattern_id_fkey FOREIGN KEY (recurring_pattern_id) REFERENCES public.recurring_activity_patterns(id) ON DELETE SET NULL;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: teams teams_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: teams teams_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: wallet_transactions wallet_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: wallet_transactions wallet_transactions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: wallet_transactions wallet_transactions_payment_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_payment_transaction_id_fkey FOREIGN KEY (payment_transaction_id) REFERENCES public.payment_transactions(id);


--
-- Name: whatsapp_bulk_campaigns whatsapp_bulk_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_bulk_campaigns
    ADD CONSTRAINT whatsapp_bulk_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: whatsapp_bulk_campaigns whatsapp_bulk_campaigns_exotel_settings_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_bulk_campaigns
    ADD CONSTRAINT whatsapp_bulk_campaigns_exotel_settings_id_fkey FOREIGN KEY (exotel_settings_id) REFERENCES public.exotel_settings(id);


--
-- Name: whatsapp_bulk_campaigns whatsapp_bulk_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_bulk_campaigns
    ADD CONSTRAINT whatsapp_bulk_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.communication_templates(id);


--
-- Name: whatsapp_campaign_recipients whatsapp_campaign_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_campaign_recipients
    ADD CONSTRAINT whatsapp_campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.whatsapp_bulk_campaigns(id) ON DELETE CASCADE;


--
-- Name: whatsapp_campaign_recipients whatsapp_campaign_recipients_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_campaign_recipients
    ADD CONSTRAINT whatsapp_campaign_recipients_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: whatsapp_campaign_recipients whatsapp_campaign_recipients_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_campaign_recipients
    ADD CONSTRAINT whatsapp_campaign_recipients_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.whatsapp_messages(id);


--
-- Name: whatsapp_messages whatsapp_messages_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_replied_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_replied_to_message_id_fkey FOREIGN KEY (replied_to_message_id) REFERENCES public.whatsapp_messages(id);


--
-- Name: whatsapp_messages whatsapp_messages_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id);


--
-- Name: whatsapp_messages whatsapp_messages_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.communication_templates(id);


--
-- Name: whatsapp_settings whatsapp_settings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_settings
    ADD CONSTRAINT whatsapp_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: blog_posts Admins can create blog posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create blog posts" ON public.blog_posts FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: client_alternate_contacts Admins can delete alternate contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete alternate contacts" ON public.client_alternate_contacts FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: blog_posts Admins can delete blog posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete blog posts" ON public.blog_posts FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: whatsapp_bulk_campaigns Admins can delete campaigns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete campaigns in their org" ON public.whatsapp_bulk_campaigns FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: clients Admins can delete clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete clients" ON public.clients FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: email_bulk_campaigns Admins can delete email campaigns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete email campaigns in their org" ON public.email_bulk_campaigns FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: inventory_items Admins can delete inventory in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete inventory in their org" ON public.inventory_items FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: saved_reports Admins can delete reports in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete reports in their org" ON public.saved_reports FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: support_tickets Admins can delete support tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete support tickets" ON public.support_tickets FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: support_ticket_comments Admins can delete ticket comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete ticket comments" ON public.support_ticket_comments FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: support_ticket_escalations Admins can delete ticket escalations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete ticket escalations" ON public.support_ticket_escalations FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: support_ticket_history Admins can delete ticket history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete ticket history" ON public.support_ticket_history FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: support_ticket_notifications Admins can delete ticket notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete ticket notifications" ON public.support_ticket_notifications FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: automation_ab_tests Admins can manage AB tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage AB tests" ON public.automation_ab_tests USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: api_keys Admins can manage API keys in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage API keys in their org" ON public.api_keys USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: exotel_exophones Admins can manage ExoPhones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage ExoPhones" ON public.exotel_exophones USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: google_oauth_tokens Admins can manage Google tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage Google tokens" ON public.google_oauth_tokens TO authenticated USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: whatsapp_settings Admins can manage WhatsApp settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage WhatsApp settings" ON public.whatsapp_settings USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: approval_rules Admins can manage approval rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage approval rules" ON public.approval_rules USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: approval_types Admins can manage approval types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage approval types" ON public.approval_types USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: org_business_hours Admins can manage business hours; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage business hours" ON public.org_business_hours USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: custom_fields Admins can manage custom fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage custom fields" ON public.custom_fields USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: email_automation_rule_dependencies Admins can manage dependencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage dependencies" ON public.email_automation_rule_dependencies TO authenticated USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))) WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: designations Admins can manage designations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage designations" ON public.designations USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: call_dispositions Admins can manage dispositions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage dispositions" ON public.call_dispositions USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: email_settings Admins can manage email settings in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage email settings in their org" ON public.email_settings USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: email_templates Admins can manage email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage email templates" ON public.email_templates USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: exotel_settings Admins can manage exotel settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage exotel settings" ON public.exotel_settings USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: form_fields Admins can manage form fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage form fields" ON public.form_fields USING ((EXISTS ( SELECT 1
   FROM public.forms
  WHERE ((forms.id = form_fields.form_id) AND (forms.org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))))));


--
-- Name: forms Admins can manage forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage forms" ON public.forms USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: reporting_hierarchy Admins can manage hierarchy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage hierarchy" ON public.reporting_hierarchy USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: org_invites Admins can manage invites in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage invites in their org" ON public.org_invites USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: pipeline_stages Admins can manage pipeline stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage pipeline stages" ON public.pipeline_stages USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: user_roles Admins can manage roles in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage roles in their org" ON public.user_roles USING ((public.is_platform_admin(auth.uid()) OR ((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)))));


--
-- Name: email_automation_rules Admins can manage rules in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage rules in their org" ON public.email_automation_rules TO authenticated USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: call_sub_dispositions Admins can manage sub-dispositions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage sub-dispositions" ON public.call_sub_dispositions USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: email_suppression_list Admins can manage suppression list; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage suppression list" ON public.email_suppression_list USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: contact_tags Admins can manage tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage tags" ON public.contact_tags TO authenticated USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))) WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: communication_templates Admins can manage templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage templates" ON public.communication_templates USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: outbound_webhooks Admins can manage webhooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage webhooks" ON public.outbound_webhooks USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: automation_approvals Admins can review approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can review approvals" ON public.automation_approvals FOR UPDATE TO authenticated USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))) WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: blog_posts Admins can update blog posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update blog posts" ON public.blog_posts FOR UPDATE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: organizations Admins can update organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update organization" ON public.organizations FOR UPDATE TO authenticated USING (((id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role]))))))) WITH CHECK ((id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: chat_conversations Admins can update their group conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update their group conversations" ON public.chat_conversations FOR UPDATE USING (public.is_admin_of_conversation(id, auth.uid()));


--
-- Name: error_logs Admins can view error logs in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view error logs in their org" ON public.error_logs FOR SELECT USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: service_usage_logs Admins can view org usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view org usage" ON public.service_usage_logs FOR SELECT USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: api_key_usage_logs Admins can view usage logs in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view usage logs in their org" ON public.api_key_usage_logs FOR SELECT USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: email_automation_rule_templates Anyone can view rule templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view rule templates" ON public.email_automation_rule_templates FOR SELECT TO authenticated USING (true);


--
-- Name: org_invites Anyone can view valid unused invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view valid unused invites" ON public.org_invites FOR SELECT USING (((expires_at > now()) AND (used_at IS NULL)));


--
-- Name: chat_conversations Authenticated users can create conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create conversations" ON public.chat_conversations FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (created_by = auth.uid())));


--
-- Name: contacts Authorized users can delete contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized users can delete contacts" ON public.contacts FOR DELETE TO authenticated USING (((org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role, 'sales_manager'::public.app_role, 'support_manager'::public.app_role, 'sales_agent'::public.app_role])))))));


--
-- Name: call_logs Calling-enabled users can create call logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Calling-enabled users can create call logs" ON public.call_logs FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.calling_enabled = true))))));


--
-- Name: agent_call_sessions Calling-enabled users can create call sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Calling-enabled users can create call sessions" ON public.agent_call_sessions FOR INSERT WITH CHECK (((agent_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.calling_enabled = true))))));


--
-- Name: chat_participants Conversation creator can add initial participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Conversation creator can add initial participants" ON public.chat_participants FOR INSERT WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.chat_conversations
  WHERE ((chat_conversations.id = chat_participants.conversation_id) AND (chat_conversations.created_by = auth.uid())))) OR public.is_admin_of_conversation(conversation_id, auth.uid())));


--
-- Name: subscription_pricing Everyone can view active pricing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can view active pricing" ON public.subscription_pricing FOR SELECT USING (true);


--
-- Name: feature_permissions Everyone can view feature permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can view feature permissions" ON public.feature_permissions FOR SELECT USING (true);


--
-- Name: team_members Managers can manage team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can manage team members" ON public.team_members USING (((team_id IN ( SELECT teams.id
   FROM public.teams
  WHERE (teams.org_id = public.get_user_org_id(auth.uid())))) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'sales_manager'::public.app_role) OR public.has_role(auth.uid(), 'support_manager'::public.app_role))));


--
-- Name: teams Managers can manage teams in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can manage teams in their org" ON public.teams USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'sales_manager'::public.app_role) OR public.has_role(auth.uid(), 'support_manager'::public.app_role))));


--
-- Name: redefine_data_repository Only Redefine org can access repository; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only Redefine org can access repository" ON public.redefine_data_repository TO authenticated USING (((org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.organizations
  WHERE ((organizations.id = redefine_data_repository.org_id) AND (organizations.slug = 'redefine-marcom-pvt-ltd'::text))))));


--
-- Name: redefine_repository_audit Only Redefine org can view audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only Redefine org can view audit logs" ON public.redefine_repository_audit FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.redefine_data_repository r
     JOIN public.profiles p ON ((p.id = auth.uid())))
  WHERE ((r.id = redefine_repository_audit.repository_record_id) AND (r.org_id = p.org_id) AND (EXISTS ( SELECT 1
           FROM public.organizations o
          WHERE ((o.id = p.org_id) AND (o.slug = 'redefine-marcom-pvt-ltd'::text))))))));


--
-- Name: contact_custom_fields Only authenticated users can create contact custom fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only authenticated users can create contact custom fields" ON public.contact_custom_fields FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.contacts
  WHERE ((contacts.id = contact_custom_fields.contact_id) AND (contacts.org_id = public.get_user_org_id(auth.uid()))))));


--
-- Name: contacts Only authenticated users can create contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only authenticated users can create contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (created_by = auth.uid())));


--
-- Name: platform_admin_audit_log Platform admins can insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can insert audit logs" ON public.platform_admin_audit_log FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_platform_admin = true)))) AND (admin_id = auth.uid())));


--
-- Name: subscription_invoices Platform admins can manage all invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can manage all invoices" ON public.subscription_invoices USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: organization_subscriptions Platform admins can manage all subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can manage all subscriptions" ON public.organization_subscriptions USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: subscription_audit_log Platform admins can manage audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can manage audit log" ON public.subscription_audit_log USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: designation_feature_access Platform admins can manage designation feature access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can manage designation feature access" ON public.designation_feature_access USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: feature_permissions Platform admins can manage feature permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can manage feature permissions" ON public.feature_permissions USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: org_feature_access Platform admins can manage org feature access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can manage org feature access" ON public.org_feature_access USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: subscription_pricing Platform admins can manage pricing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can manage pricing" ON public.subscription_pricing USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: wallet_transactions Platform admins can manage wallet transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can manage wallet transactions" ON public.wallet_transactions USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: organizations Platform admins can update all organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can update all organizations" ON public.organizations FOR UPDATE USING (public.is_platform_admin(auth.uid()));


--
-- Name: error_logs Platform admins can view all error logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can view all error logs" ON public.error_logs FOR SELECT USING (public.is_platform_admin(auth.uid()));


--
-- Name: subscription_notifications Platform admins can view all notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can view all notifications" ON public.subscription_notifications FOR SELECT USING (public.is_platform_admin(auth.uid()));


--
-- Name: organizations Platform admins can view all organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can view all organizations" ON public.organizations FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND public.is_platform_admin(auth.uid())));


--
-- Name: profiles Platform admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND public.is_platform_admin(auth.uid())));


--
-- Name: payment_transactions Platform admins can view all transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can view all transactions" ON public.payment_transactions FOR SELECT USING (public.is_platform_admin(auth.uid()));


--
-- Name: service_usage_logs Platform admins can view all usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can view all usage" ON public.service_usage_logs FOR SELECT USING (public.is_platform_admin(auth.uid()));


--
-- Name: user_roles Platform admins can view all user roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can view all user roles" ON public.user_roles FOR SELECT USING (public.is_platform_admin(auth.uid()));


--
-- Name: platform_admin_audit_log Platform admins can view audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can view audit logs" ON public.platform_admin_audit_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_platform_admin = true)))));


--
-- Name: wallet_transactions Service role can create wallet transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can create wallet transactions" ON public.wallet_transactions FOR INSERT WITH CHECK (true);


--
-- Name: subscription_audit_log Service role can insert audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert audit log" ON public.subscription_audit_log FOR INSERT WITH CHECK (true);


--
-- Name: service_usage_logs Service role can insert usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert usage" ON public.service_usage_logs FOR INSERT WITH CHECK (true);


--
-- Name: api_keys Service role can manage all API keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all API keys" ON public.api_keys USING (true) WITH CHECK (true);


--
-- Name: campaign_analytics Service role can manage all analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all analytics" ON public.campaign_analytics USING (true) WITH CHECK (true);


--
-- Name: call_logs Service role can manage all call logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all call logs" ON public.call_logs USING (true) WITH CHECK (true);


--
-- Name: agent_call_sessions Service role can manage all call sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all call sessions" ON public.agent_call_sessions USING (true) WITH CHECK (true);


--
-- Name: email_automation_cooldowns Service role can manage all cooldowns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all cooldowns" ON public.email_automation_cooldowns TO service_role USING (true) WITH CHECK (true);


--
-- Name: email_conversations Service role can manage all email conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all email conversations" ON public.email_conversations USING (true) WITH CHECK (true);


--
-- Name: email_campaign_recipients Service role can manage all email recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all email recipients" ON public.email_campaign_recipients USING (true) WITH CHECK (true);


--
-- Name: contact_enrichment_logs Service role can manage all enrichment logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all enrichment logs" ON public.contact_enrichment_logs USING (true) WITH CHECK (true);


--
-- Name: email_automation_executions Service role can manage all executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all executions" ON public.email_automation_executions TO service_role USING (true) WITH CHECK (true);


--
-- Name: import_jobs Service role can manage all import jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all import jobs" ON public.import_jobs TO service_role USING (true);


--
-- Name: campaign_insights Service role can manage all insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all insights" ON public.campaign_insights USING (true) WITH CHECK (true);


--
-- Name: notifications Service role can manage all notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all notifications" ON public.notifications USING (true) WITH CHECK (true);


--
-- Name: whatsapp_campaign_recipients Service role can manage all recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all recipients" ON public.whatsapp_campaign_recipients USING (true) WITH CHECK (true);


--
-- Name: redefine_data_repository Service role can manage all repository data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all repository data" ON public.redefine_data_repository TO service_role USING (true) WITH CHECK (true);


--
-- Name: organization_subscriptions Service role can manage all subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all subscriptions" ON public.organization_subscriptions USING (true) WITH CHECK (true);


--
-- Name: api_key_usage_logs Service role can manage all usage logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all usage logs" ON public.api_key_usage_logs USING (true) WITH CHECK (true);


--
-- Name: user_roles Service role can manage all user roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all user roles" ON public.user_roles TO service_role USING (true) WITH CHECK (true);


--
-- Name: email_automation_daily_limits Service role can manage daily limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage daily limits" ON public.email_automation_daily_limits TO service_role USING (true) WITH CHECK (true);


--
-- Name: subscription_invoices Service role can manage invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage invoices" ON public.subscription_invoices USING (true) WITH CHECK (true);


--
-- Name: contact_lead_scores Service role can manage lead scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage lead scores" ON public.contact_lead_scores TO service_role USING (true) WITH CHECK (true);


--
-- Name: email_engagement_patterns Service role can manage patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage patterns" ON public.email_engagement_patterns TO service_role USING (true) WITH CHECK (true);


--
-- Name: automation_performance_daily Service role can manage performance reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage performance reports" ON public.automation_performance_daily TO service_role USING (true) WITH CHECK (true);


--
-- Name: rate_limit_log Service role can manage rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage rate limits" ON public.rate_limit_log USING (true) WITH CHECK (true);


--
-- Name: email_suppression_list Service role can manage suppression list; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage suppression list" ON public.email_suppression_list USING (true) WITH CHECK (true);


--
-- Name: payment_transactions Service role can manage transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage transactions" ON public.payment_transactions USING (true) WITH CHECK (true);


--
-- Name: email_unsubscribes Service role can manage unsubscribes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage unsubscribes" ON public.email_unsubscribes TO service_role USING (true) WITH CHECK (true);


--
-- Name: outbound_webhook_logs Service role can manage webhook logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage webhook logs" ON public.outbound_webhook_logs USING (true) WITH CHECK (true);


--
-- Name: bulk_import_history Service role full access to bulk_import_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to bulk_import_history" ON public.bulk_import_history USING (true) WITH CHECK (true);


--
-- Name: bulk_import_records Service role full access to bulk_import_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to bulk_import_records" ON public.bulk_import_records USING (true) WITH CHECK (true);


--
-- Name: import_staging Service role full access to import_staging; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to import_staging" ON public.import_staging USING (true) WITH CHECK (true);


--
-- Name: activity_participants Service role has full access to activity_participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role has full access to activity_participants" ON public.activity_participants TO service_role USING (true) WITH CHECK (true);


--
-- Name: blog_posts Service role has full access to blog posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role has full access to blog posts" ON public.blog_posts USING (true) WITH CHECK (true);


--
-- Name: connector_logs Service role has full access to connector_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role has full access to connector_logs" ON public.connector_logs USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: email_settings Service role has full access to email_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role has full access to email_settings" ON public.email_settings USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: google_oauth_tokens Service role has full access to google_oauth_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role has full access to google_oauth_tokens" ON public.google_oauth_tokens TO service_role USING (true) WITH CHECK (true);


--
-- Name: operation_queue Service role has full access to operation_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role has full access to operation_queue" ON public.operation_queue TO service_role USING (true) WITH CHECK (true);


--
-- Name: platform_email_sending_list Service role has full access to platform email list; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role has full access to platform email list" ON public.platform_email_sending_list USING (true) WITH CHECK (true);


--
-- Name: subscription_notifications Service role manages notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages notifications" ON public.subscription_notifications USING (true) WITH CHECK (true);


--
-- Name: pipeline_benchmarks System can manage benchmarks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can manage benchmarks" ON public.pipeline_benchmarks USING (true) WITH CHECK (true);


--
-- Name: tasks Task creators and admins can delete tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Task creators and admins can delete tasks" ON public.tasks FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND ((assigned_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: chat_message_reactions Users can add reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add reactions" ON public.chat_message_reactions FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.chat_messages m
  WHERE ((m.id = chat_message_reactions.message_id) AND public.is_participant_in_conversation(m.conversation_id, auth.uid()))))));


--
-- Name: contact_activities Users can create activities in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create activities in their org" ON public.contact_activities FOR INSERT TO authenticated WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (created_by = auth.uid())));


--
-- Name: client_alternate_contacts Users can create alternate contacts in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create alternate contacts in their org" ON public.client_alternate_contacts FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: whatsapp_bulk_campaigns Users can create campaigns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create campaigns in their org" ON public.whatsapp_bulk_campaigns FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (created_by = auth.uid())));


--
-- Name: clients Users can create clients in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create clients in their org" ON public.clients FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: support_ticket_comments Users can create comments in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create comments in their org" ON public.support_ticket_comments FOR INSERT WITH CHECK (((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (user_id = auth.uid())));


--
-- Name: contacts Users can create contacts in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create contacts in their org" ON public.contacts FOR INSERT TO authenticated WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (created_by = auth.uid())));


--
-- Name: client_documents Users can create documents in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create documents in their org" ON public.client_documents FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_bulk_campaigns Users can create email campaigns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create email campaigns in their org" ON public.email_bulk_campaigns FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (created_by = auth.uid())));


--
-- Name: contact_enrichment_logs Users can create enrichment logs in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create enrichment logs in their org" ON public.contact_enrichment_logs FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (enriched_by = auth.uid())));


--
-- Name: support_ticket_escalations Users can create escalations in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create escalations in their org" ON public.support_ticket_escalations FOR INSERT WITH CHECK ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: external_entities Users can create external entities in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create external entities in their org" ON public.external_entities FOR INSERT WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: import_jobs Users can create import jobs for their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create import jobs for their org" ON public.import_jobs FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND public.can_create_import_job(auth.uid(), org_id)));


--
-- Name: bulk_import_history Users can create imports in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create imports in their org" ON public.bulk_import_history FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (user_id = auth.uid())));


--
-- Name: inventory_items Users can create inventory in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create inventory in their org" ON public.inventory_items FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (created_by = auth.uid())));


--
-- Name: invoice_import_items Users can create invoice import items for their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create invoice import items for their org" ON public.invoice_import_items FOR INSERT WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: invoice_imports Users can create invoice imports for their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create invoice imports for their org" ON public.invoice_imports FOR INSERT WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: client_invoices Users can create invoices in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create invoices in their org" ON public.client_invoices FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: organizations Users can create organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create organization" ON public.organizations FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: activity_participants Users can create participants for their activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create participants for their activities" ON public.activity_participants FOR INSERT TO authenticated WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.contact_activities
  WHERE ((contact_activities.id = activity_participants.activity_id) AND (contact_activities.created_by = auth.uid()))))));


--
-- Name: operation_queue Users can create queue items in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create queue items in their org" ON public.operation_queue FOR INSERT TO authenticated WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (user_id = auth.uid())));


--
-- Name: recurring_activity_patterns Users can create recurring patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create recurring patterns" ON public.recurring_activity_patterns FOR INSERT WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: saved_reports Users can create reports in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create reports in their org" ON public.saved_reports FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (created_by = auth.uid())));


--
-- Name: revenue_goals Users can create revenue goals in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create revenue goals in their org" ON public.revenue_goals FOR INSERT WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: tasks Users can create tasks in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create tasks in their org" ON public.tasks FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (assigned_by = auth.uid())));


--
-- Name: import_jobs Users can create their own import jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own import jobs" ON public.import_jobs FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (org_id = public.get_user_org_id(auth.uid()))));


--
-- Name: support_tickets Users can create tickets in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create tickets in their org" ON public.support_tickets FOR INSERT WITH CHECK (((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (created_by = auth.uid())));


--
-- Name: payment_transactions Users can create transactions for their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create transactions for their org" ON public.payment_transactions FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (initiated_by = auth.uid())));


--
-- Name: gst_payment_tracking Users can delete GST payments in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete GST payments in their org" ON public.gst_payment_tracking FOR DELETE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: client_documents Users can delete documents in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete documents in their org" ON public.client_documents FOR DELETE USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: contact_emails Users can delete emails in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete emails in their org" ON public.contact_emails FOR DELETE TO authenticated USING (((auth.uid() IS NOT NULL) AND (org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.org_id = contact_emails.org_id))))));


--
-- Name: external_entities Users can delete external entities in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete external entities in their org" ON public.external_entities FOR DELETE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: client_invoices Users can delete invoices in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete invoices in their org" ON public.client_invoices FOR DELETE USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: recurring_activity_patterns Users can delete own recurring patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own recurring patterns" ON public.recurring_activity_patterns FOR DELETE USING ((created_by = auth.uid()));


--
-- Name: contact_phones Users can delete phones in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete phones in their org" ON public.contact_phones FOR DELETE TO authenticated USING (((auth.uid() IS NOT NULL) AND (org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.org_id = contact_phones.org_id))))));


--
-- Name: revenue_goals Users can delete revenue goals in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete revenue goals in their org" ON public.revenue_goals FOR DELETE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: invoice_import_items Users can delete their org invoice import items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their org invoice import items" ON public.invoice_import_items FOR DELETE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: invoice_imports Users can delete their org invoice imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their org invoice imports" ON public.invoice_imports FOR DELETE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: contact_activities Users can delete their own activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own activities" ON public.contact_activities FOR DELETE TO authenticated USING (((org_id = public.get_user_org_id(auth.uid())) AND (created_by = auth.uid())));


--
-- Name: agent_call_sessions Users can delete their own call sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own call sessions" ON public.agent_call_sessions FOR DELETE USING ((agent_id = auth.uid()));


--
-- Name: chat_messages Users can delete their own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own messages" ON public.chat_messages FOR DELETE USING ((sender_id = auth.uid()));


--
-- Name: chat_messages Users can edit their own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can edit their own messages" ON public.chat_messages FOR UPDATE USING ((sender_id = auth.uid()));


--
-- Name: gst_payment_tracking Users can insert GST payments in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert GST payments in their org" ON public.gst_payment_tracking FOR INSERT WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: sms_messages Users can insert SMS messages in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert SMS messages in their org" ON public.sms_messages FOR INSERT WITH CHECK ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: contact_emails Users can insert emails in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert emails in their org" ON public.contact_emails FOR INSERT TO authenticated WITH CHECK (((auth.uid() IS NOT NULL) AND (org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.org_id = contact_emails.org_id))))));


--
-- Name: error_logs Users can insert error logs for their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert error logs for their org" ON public.error_logs FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: support_ticket_history Users can insert history in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert history in their org" ON public.support_ticket_history FOR INSERT WITH CHECK ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: pipeline_movement_history Users can insert movement history in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert movement history in their org" ON public.pipeline_movement_history FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: support_ticket_notifications Users can insert notifications for their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert notifications for their org" ON public.support_ticket_notifications FOR INSERT WITH CHECK ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: carry_forward_snapshot Users can insert own org carry forward; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own org carry forward" ON public.carry_forward_snapshot FOR INSERT WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: monthly_actuals_snapshot Users can insert own org snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own org snapshots" ON public.monthly_actuals_snapshot FOR INSERT WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: contact_phones Users can insert phones in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert phones in their org" ON public.contact_phones FOR INSERT TO authenticated WITH CHECK (((auth.uid() IS NOT NULL) AND (org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.org_id = contact_phones.org_id))))));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((id = auth.uid()));


--
-- Name: user_module_usage Users can insert their own usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own usage" ON public.user_module_usage FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (org_id = public.get_user_org_id(auth.uid()))));


--
-- Name: chat_participants Users can leave or admins can remove participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can leave or admins can remove participants" ON public.chat_participants FOR DELETE USING (((user_id = auth.uid()) OR public.is_admin_of_conversation(conversation_id, auth.uid())));


--
-- Name: sms_campaign_recipients Users can manage SMS campaign recipients in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage SMS campaign recipients in their org" ON public.sms_campaign_recipients USING ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: sms_bulk_campaigns Users can manage SMS campaigns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage SMS campaigns in their org" ON public.sms_bulk_campaigns USING ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: contact_custom_fields Users can manage contact custom fields in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage contact custom fields in their org" ON public.contact_custom_fields USING ((EXISTS ( SELECT 1
   FROM public.contacts
  WHERE ((contacts.id = contact_custom_fields.contact_id) AND (contacts.org_id = public.get_user_org_id(auth.uid()))))));


--
-- Name: contact_tag_assignments Users can manage tag assignments in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage tag assignments in their org" ON public.contact_tag_assignments TO authenticated USING ((org_id = public.get_user_org_id(auth.uid()))) WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: chat_message_reactions Users can remove their reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove their reactions" ON public.chat_message_reactions FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: calendar_shares Users can remove their shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove their shares" ON public.calendar_shares FOR DELETE USING ((auth.uid() = owner_id));


--
-- Name: automation_approvals Users can request approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can request approvals" ON public.automation_approvals FOR INSERT TO authenticated WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (requested_by = auth.uid())));


--
-- Name: email_conversations Users can send email conversations in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send email conversations in their org" ON public.email_conversations FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (sent_by = auth.uid())));


--
-- Name: whatsapp_messages Users can send messages in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send messages in their org" ON public.whatsapp_messages FOR INSERT WITH CHECK (((org_id = public.get_user_org_id(auth.uid())) AND (sent_by = auth.uid())));


--
-- Name: chat_messages Users can send messages to their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send messages to their conversations" ON public.chat_messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND public.is_participant_in_conversation(conversation_id, auth.uid())));


--
-- Name: calendar_shares Users can share their calendar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can share their calendar" ON public.calendar_shares FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: gst_payment_tracking Users can update GST payments in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update GST payments in their org" ON public.gst_payment_tracking FOR UPDATE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: sms_messages Users can update SMS messages in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update SMS messages in their org" ON public.sms_messages FOR UPDATE USING ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: client_alternate_contacts Users can update alternate contacts in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update alternate contacts in their org" ON public.client_alternate_contacts FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: whatsapp_bulk_campaigns Users can update campaigns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update campaigns in their org" ON public.whatsapp_bulk_campaigns FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: clients Users can update clients in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update clients in their org" ON public.clients FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: contacts Users can update contacts in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update contacts in their org" ON public.contacts FOR UPDATE TO authenticated USING (((auth.uid() IS NOT NULL) AND (org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.org_id = contacts.org_id))))));


--
-- Name: client_documents Users can update documents in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update documents in their org" ON public.client_documents FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_bulk_campaigns Users can update email campaigns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update email campaigns in their org" ON public.email_bulk_campaigns FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_conversations Users can update email conversations in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update email conversations in their org" ON public.email_conversations FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: contact_emails Users can update emails in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update emails in their org" ON public.contact_emails FOR UPDATE TO authenticated USING (((auth.uid() IS NOT NULL) AND (org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.org_id = contact_emails.org_id))))));


--
-- Name: external_entities Users can update external entities in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update external entities in their org" ON public.external_entities FOR UPDATE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: campaign_insights Users can update insights status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update insights status" ON public.campaign_insights FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid()))) WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: inventory_items Users can update inventory in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update inventory in their org" ON public.inventory_items FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: client_invoices Users can update invoices in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update invoices in their org" ON public.client_invoices FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: monthly_actuals_snapshot Users can update own org snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own org snapshots" ON public.monthly_actuals_snapshot FOR UPDATE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: recurring_activity_patterns Users can update own recurring patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own recurring patterns" ON public.recurring_activity_patterns FOR UPDATE USING ((created_by = auth.uid()));


--
-- Name: contact_phones Users can update phones in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update phones in their org" ON public.contact_phones FOR UPDATE TO authenticated USING (((auth.uid() IS NOT NULL) AND (org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.org_id = contact_phones.org_id))))));


--
-- Name: revenue_goals Users can update revenue goals in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update revenue goals in their org" ON public.revenue_goals FOR UPDATE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: tasks Users can update their assigned tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their assigned tasks" ON public.tasks FOR UPDATE USING (((org_id = public.get_user_org_id(auth.uid())) AND ((assigned_to = auth.uid()) OR (assigned_by = auth.uid()))));


--
-- Name: invoice_import_items Users can update their org invoice import items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their org invoice import items" ON public.invoice_import_items FOR UPDATE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: invoice_imports Users can update their org invoice imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their org invoice imports" ON public.invoice_imports FOR UPDATE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: contact_activities Users can update their own activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own activities" ON public.contact_activities FOR UPDATE TO authenticated USING (((org_id = public.get_user_org_id(auth.uid())) AND (created_by = auth.uid())));


--
-- Name: call_logs Users can update their own call logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own call logs" ON public.call_logs FOR UPDATE USING (((org_id = public.get_user_org_id(auth.uid())) AND (agent_id = auth.uid())));


--
-- Name: agent_call_sessions Users can update their own call sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own call sessions" ON public.agent_call_sessions FOR UPDATE USING ((agent_id = auth.uid()));


--
-- Name: import_jobs Users can update their own import jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own import jobs" ON public.import_jobs FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (org_id = public.get_user_org_id(auth.uid()))));


--
-- Name: bulk_import_history Users can update their own imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own imports" ON public.bulk_import_history FOR UPDATE USING (((org_id = public.get_user_org_id(auth.uid())) AND (user_id = auth.uid())));


--
-- Name: notifications Users can update their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: chat_participants Users can update their own participant record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own participant record" ON public.chat_participants FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((id = auth.uid()));


--
-- Name: operation_queue Users can update their own queue items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own queue items" ON public.operation_queue FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: saved_reports Users can update their own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own reports" ON public.saved_reports FOR UPDATE USING (((org_id = public.get_user_org_id(auth.uid())) AND (created_by = auth.uid())));


--
-- Name: user_module_usage Users can update their own usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own usage" ON public.user_module_usage FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: calendar_shares Users can update their shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their shares" ON public.calendar_shares FOR UPDATE USING ((auth.uid() = owner_id));


--
-- Name: support_tickets Users can update tickets in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update tickets in their org" ON public.support_tickets FOR UPDATE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: automation_ab_tests Users can view AB tests in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view AB tests in their org" ON public.automation_ab_tests FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: exotel_exophones Users can view ExoPhones in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view ExoPhones in their org" ON public.exotel_exophones FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: gst_payment_tracking Users can view GST payments in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view GST payments in their org" ON public.gst_payment_tracking FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: sms_campaign_recipients Users can view SMS campaign recipients in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view SMS campaign recipients in their org" ON public.sms_campaign_recipients FOR SELECT USING ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: sms_bulk_campaigns Users can view SMS campaigns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view SMS campaigns in their org" ON public.sms_bulk_campaigns FOR SELECT USING ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: sms_messages Users can view SMS messages in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view SMS messages in their org" ON public.sms_messages FOR SELECT USING ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: whatsapp_settings Users can view WhatsApp settings in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view WhatsApp settings in their org" ON public.whatsapp_settings FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: contact_activities Users can view activities in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view activities in their org" ON public.contact_activities FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: client_alternate_contacts Users can view alternate contacts in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view alternate contacts in their org" ON public.client_alternate_contacts FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: campaign_analytics Users can view analytics in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view analytics in their org" ON public.campaign_analytics FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: approval_rules Users can view approval rules in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view approval rules in their org" ON public.approval_rules FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: approval_types Users can view approval types in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view approval types in their org" ON public.approval_types FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: automation_approvals Users can view approvals in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view approvals in their org" ON public.automation_approvals FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: pipeline_benchmarks Users can view benchmarks in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view benchmarks in their org" ON public.pipeline_benchmarks FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: blog_posts Users can view blog posts in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view blog posts in their org" ON public.blog_posts FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: org_business_hours Users can view business hours in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view business hours in their org" ON public.org_business_hours FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: call_logs Users can view call logs in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view call logs in their org" ON public.call_logs FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: whatsapp_bulk_campaigns Users can view campaigns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view campaigns in their org" ON public.whatsapp_bulk_campaigns FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: clients Users can view clients in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view clients in their org" ON public.clients FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: support_ticket_comments Users can view comments in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view comments in their org" ON public.support_ticket_comments FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: contact_custom_fields Users can view contact custom fields in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view contact custom fields in their org" ON public.contact_custom_fields FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.contacts
  WHERE ((contacts.id = contact_custom_fields.contact_id) AND (contacts.org_id = public.get_user_org_id(auth.uid()))))));


--
-- Name: contacts Users can view contacts in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view contacts in their org" ON public.contacts FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.org_id = contacts.org_id))))));


--
-- Name: chat_conversations Users can view conversations they created or participate in; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view conversations they created or participate in" ON public.chat_conversations FOR SELECT USING (((created_by = auth.uid()) OR public.is_participant_in_conversation(id, auth.uid())));


--
-- Name: email_automation_cooldowns Users can view cooldowns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view cooldowns in their org" ON public.email_automation_cooldowns FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: custom_fields Users can view custom fields in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view custom fields in their org" ON public.custom_fields FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_automation_daily_limits Users can view daily limits in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view daily limits in their org" ON public.email_automation_daily_limits FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_automation_rule_dependencies Users can view dependencies in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view dependencies in their org" ON public.email_automation_rule_dependencies FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: designations Users can view designations in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view designations in their org" ON public.designations FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: call_dispositions Users can view dispositions in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view dispositions in their org" ON public.call_dispositions FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: client_documents Users can view documents in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view documents in their org" ON public.client_documents FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_bulk_campaigns Users can view email campaigns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view email campaigns in their org" ON public.email_bulk_campaigns FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_conversations Users can view email conversations in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view email conversations in their org" ON public.email_conversations FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_campaign_recipients Users can view email recipients in their org campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view email recipients in their org campaigns" ON public.email_campaign_recipients FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.email_bulk_campaigns
  WHERE ((email_bulk_campaigns.id = email_campaign_recipients.campaign_id) AND (email_bulk_campaigns.org_id = public.get_user_org_id(auth.uid()))))));


--
-- Name: email_settings Users can view email settings in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view email settings in their org" ON public.email_settings FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_templates Users can view email templates in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view email templates in their org" ON public.email_templates FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: contact_emails Users can view emails in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view emails in their org" ON public.contact_emails FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.org_id = contact_emails.org_id))))));


--
-- Name: contact_enrichment_logs Users can view enrichment logs in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view enrichment logs in their org" ON public.contact_enrichment_logs FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: support_ticket_escalations Users can view escalations in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view escalations in their org" ON public.support_ticket_escalations FOR SELECT USING ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: email_automation_executions Users can view executions in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view executions in their org" ON public.email_automation_executions FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: exotel_settings Users can view exotel settings in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view exotel settings in their org" ON public.exotel_settings FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: external_entities Users can view external entities in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view external entities in their org" ON public.external_entities FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: form_fields Users can view form fields in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view form fields in their org" ON public.form_fields FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.forms
  WHERE ((forms.id = form_fields.form_id) AND (forms.org_id = public.get_user_org_id(auth.uid()))))));


--
-- Name: forms Users can view forms in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view forms in their org" ON public.forms FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: reporting_hierarchy Users can view hierarchy in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view hierarchy in their org" ON public.reporting_hierarchy FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: support_ticket_history Users can view history in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view history in their org" ON public.support_ticket_history FOR SELECT USING ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: campaign_insights Users can view insights in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view insights in their org" ON public.campaign_insights FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: inventory_items Users can view inventory in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view inventory in their org" ON public.inventory_items FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: client_invoices Users can view invoices in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view invoices in their org" ON public.client_invoices FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: contact_lead_scores Users can view lead scores in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view lead scores in their org" ON public.contact_lead_scores FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: connector_logs Users can view logs in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view logs in their org" ON public.connector_logs FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: chat_messages Users can view messages in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages in their conversations" ON public.chat_messages FOR SELECT USING (public.is_participant_in_conversation(conversation_id, auth.uid()));


--
-- Name: whatsapp_messages Users can view messages in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages in their org" ON public.whatsapp_messages FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: pipeline_movement_history Users can view movement history in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view movement history in their org" ON public.pipeline_movement_history FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: support_ticket_notifications Users can view notifications for their org tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view notifications for their org tickets" ON public.support_ticket_notifications FOR SELECT USING ((org_id = ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: recurring_activity_patterns Users can view org recurring patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view org recurring patterns" ON public.recurring_activity_patterns FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: carry_forward_snapshot Users can view own org carry forward; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own org carry forward" ON public.carry_forward_snapshot FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: designation_feature_access Users can view own org designation access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own org designation access" ON public.designation_feature_access FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: org_feature_access Users can view own org feature access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own org feature access" ON public.org_feature_access FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: monthly_actuals_snapshot Users can view own org snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own org snapshots" ON public.monthly_actuals_snapshot FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: chat_participants Users can view participants in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view participants in their conversations" ON public.chat_participants FOR SELECT USING (((user_id = auth.uid()) OR public.is_participant_in_conversation(conversation_id, auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.chat_conversations
  WHERE ((chat_conversations.id = chat_participants.conversation_id) AND (chat_conversations.created_by = auth.uid()))))));


--
-- Name: activity_participants Users can view participants in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view participants in their org" ON public.activity_participants FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_engagement_patterns Users can view patterns in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view patterns in their org" ON public.email_engagement_patterns FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: automation_performance_daily Users can view performance reports in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view performance reports in their org" ON public.automation_performance_daily FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: contact_phones Users can view phones in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view phones in their org" ON public.contact_phones FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (org_id = public.get_user_org_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.org_id = contact_phones.org_id))))));


--
-- Name: pipeline_stages Users can view pipeline stages in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view pipeline stages in their org" ON public.pipeline_stages FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: profiles Users can view profiles in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view profiles in their org" ON public.profiles FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (org_id = public.get_user_org_id(auth.uid()))));


--
-- Name: chat_message_reactions Users can view reactions in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view reactions in their conversations" ON public.chat_message_reactions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.chat_messages m
  WHERE ((m.id = chat_message_reactions.message_id) AND public.is_participant_in_conversation(m.conversation_id, auth.uid())))));


--
-- Name: whatsapp_campaign_recipients Users can view recipients in their org campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view recipients in their org campaigns" ON public.whatsapp_campaign_recipients FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.whatsapp_bulk_campaigns
  WHERE ((whatsapp_bulk_campaigns.id = whatsapp_campaign_recipients.campaign_id) AND (whatsapp_bulk_campaigns.org_id = public.get_user_org_id(auth.uid()))))));


--
-- Name: saved_reports Users can view reports in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view reports in their org" ON public.saved_reports FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: revenue_goals Users can view revenue goals in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view revenue goals in their org" ON public.revenue_goals FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: user_roles Users can view roles in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view roles in their org" ON public.user_roles FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_automation_rules Users can view rules in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view rules in their org" ON public.email_automation_rules FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: call_sub_dispositions Users can view sub-dispositions in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view sub-dispositions in their org" ON public.call_sub_dispositions FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: email_suppression_list Users can view suppression list in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view suppression list in their org" ON public.email_suppression_list FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: contact_tag_assignments Users can view tag assignments in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view tag assignments in their org" ON public.contact_tag_assignments FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: contact_tags Users can view tags in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view tags in their org" ON public.contact_tags FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: tasks Users can view tasks in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view tasks in their org" ON public.tasks FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: team_members Users can view team members in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view team members in their org" ON public.team_members FOR SELECT USING ((team_id IN ( SELECT teams.id
   FROM public.teams
  WHERE (teams.org_id = public.get_user_org_id(auth.uid())))));


--
-- Name: teams Users can view teams in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view teams in their org" ON public.teams FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: communication_templates Users can view templates in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view templates in their org" ON public.communication_templates FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: bulk_import_history Users can view their org import history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org import history" ON public.bulk_import_history FOR SELECT USING (((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_platform_admin = true))))));


--
-- Name: bulk_import_records Users can view their org import records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org import records" ON public.bulk_import_records FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.bulk_import_history h
  WHERE ((h.id = bulk_import_records.import_id) AND (h.org_id = public.get_user_org_id(auth.uid()))))));


--
-- Name: bulk_import_history Users can view their org imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org imports" ON public.bulk_import_history FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: invoice_import_items Users can view their org invoice import items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org invoice import items" ON public.invoice_import_items FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: invoice_imports Users can view their org invoice imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org invoice imports" ON public.invoice_imports FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: subscription_invoices Users can view their org invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org invoices" ON public.subscription_invoices FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: organization_subscriptions Users can view their org subscription; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org subscription" ON public.organization_subscriptions FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: payment_transactions Users can view their org transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org transactions" ON public.payment_transactions FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: wallet_transactions Users can view their org wallet transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org wallet transactions" ON public.wallet_transactions FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: contact_enrichment_runs Users can view their org's enrichment runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org's enrichment runs" ON public.contact_enrichment_runs FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: organizations Users can view their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their organization" ON public.organizations FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));


--
-- Name: agent_call_sessions Users can view their own active call sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own active call sessions" ON public.agent_call_sessions FOR SELECT USING ((agent_id = auth.uid()));


--
-- Name: import_jobs Users can view their own import jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own import jobs" ON public.import_jobs FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: notifications Users can view their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: operation_queue Users can view their own queue items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own queue items" ON public.operation_queue FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: service_usage_logs Users can view their own usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own usage" ON public.service_usage_logs FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_module_usage Users can view their own usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own usage" ON public.user_module_usage FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: calendar_shares Users can view their shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their shares" ON public.calendar_shares FOR SELECT USING (((auth.uid() = owner_id) OR (auth.uid() = shared_with_id)));


--
-- Name: support_tickets Users can view tickets in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view tickets in their org" ON public.support_tickets FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: email_unsubscribes Users can view unsubscribes in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view unsubscribes in their org" ON public.email_unsubscribes FOR SELECT TO authenticated USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: outbound_webhook_logs Users can view webhook logs in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view webhook logs in their org" ON public.outbound_webhook_logs FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: outbound_webhooks Users can view webhooks in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view webhooks in their org" ON public.outbound_webhooks FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));


--
-- Name: activity_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_call_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_call_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: api_key_usage_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_key_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_types ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_ab_tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_ab_tests ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_performance_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_performance_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: bulk_import_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bulk_import_history ENABLE ROW LEVEL SECURITY;

--
-- Name: bulk_import_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bulk_import_records ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: call_dispositions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_dispositions ENABLE ROW LEVEL SECURITY;

--
-- Name: call_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: call_sub_dispositions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_sub_dispositions ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_analytics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: carry_forward_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.carry_forward_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_message_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: client_alternate_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_alternate_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: client_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: client_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: communication_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: connector_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connector_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_custom_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_enrichment_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_enrichment_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_enrichment_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_enrichment_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_lead_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_lead_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_phones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_phones ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_tag_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_tag_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: designation_feature_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.designation_feature_access ENABLE ROW LEVEL SECURITY;

--
-- Name: designations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;

--
-- Name: email_automation_cooldowns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_automation_cooldowns ENABLE ROW LEVEL SECURITY;

--
-- Name: email_automation_daily_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_automation_daily_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: email_automation_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_automation_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: email_automation_rule_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_automation_rule_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: email_automation_rule_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_automation_rule_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_automation_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_automation_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: email_bulk_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_bulk_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaign_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: email_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: email_engagement_patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_engagement_patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: email_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: email_suppression_list; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_suppression_list ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_unsubscribes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;

--
-- Name: error_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: exotel_exophones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exotel_exophones ENABLE ROW LEVEL SECURITY;

--
-- Name: exotel_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exotel_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: external_entities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.external_entities ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feature_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: form_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: forms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

--
-- Name: google_oauth_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: gst_payment_tracking; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gst_payment_tracking ENABLE ROW LEVEL SECURITY;

--
-- Name: import_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: import_staging; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_staging ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_import_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_import_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_imports ENABLE ROW LEVEL SECURITY;

--
-- Name: monthly_actuals_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.monthly_actuals_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: operation_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operation_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: org_business_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_business_hours ENABLE ROW LEVEL SECURITY;

--
-- Name: org_feature_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_feature_access ENABLE ROW LEVEL SECURITY;

--
-- Name: org_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: outbound_webhook_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbound_webhook_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: outbound_webhooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_benchmarks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_benchmarks ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_movement_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_movement_history ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admin_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admin_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_email_sending_list; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_email_sending_list ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_activity_patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recurring_activity_patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: redefine_data_repository; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.redefine_data_repository ENABLE ROW LEVEL SECURITY;

--
-- Name: redefine_repository_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.redefine_repository_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: reporting_hierarchy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reporting_hierarchy ENABLE ROW LEVEL SECURITY;

--
-- Name: revenue_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.revenue_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: service_usage_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_bulk_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_bulk_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_campaign_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_campaign_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_pricing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: support_ticket_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_ticket_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: support_ticket_escalations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_ticket_escalations ENABLE ROW LEVEL SECURITY;

--
-- Name: support_ticket_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_ticket_history ENABLE ROW LEVEL SECURITY;

--
-- Name: support_ticket_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_ticket_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: user_module_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_module_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: wallet_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_bulk_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_bulk_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_campaign_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_campaign_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict hLbRlLZLVqBkL7ja8FSb4DbemiJwKjJeriH3pKg7tAPLy97GX661POEPwE1itrh

