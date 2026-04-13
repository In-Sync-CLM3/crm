-- Phase 1B: RPC functions to replace client-side aggregations
-- All functions accept _org_id to enforce tenant isolation.
-- SECURITY DEFINER bypasses RLS, so org_id must be filtered explicitly.

-- 1. Client stats scoped to a single org
CREATE OR REPLACE FUNCTION get_client_stats(_org_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total',        count(*),
    'active',       count(*) FILTER (WHERE COALESCE(c.status, 'active') = 'active'),
    'inactive',     count(*) FILTER (WHERE c.status = 'inactive'),
    'churned',      count(*) FILTER (WHERE c.status = 'churned'),
    'withInvoices', count(DISTINCT ci.client_id)
  )
  FROM clients c
  LEFT JOIN client_invoices ci ON ci.client_id = c.id
  WHERE c.org_id = _org_id;
$$;

-- 2. Client filter options scoped to a single org
CREATE OR REPLACE FUNCTION get_client_filter_options(_org_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'companies', COALESCE(
      (SELECT json_agg(val ORDER BY val)
       FROM (SELECT DISTINCT company AS val FROM clients WHERE company IS NOT NULL AND org_id = _org_id) t),
      '[]'::json),
    'cities', COALESCE(
      (SELECT json_agg(val ORDER BY val)
       FROM (SELECT DISTINCT city AS val FROM clients WHERE city IS NOT NULL AND org_id = _org_id) t),
      '[]'::json),
    'states', COALESCE(
      (SELECT json_agg(val ORDER BY val)
       FROM (SELECT DISTINCT state AS val FROM clients WHERE state IS NOT NULL AND org_id = _org_id) t),
      '[]'::json)
  );
$$;

-- 3. Calling dashboard stats scoped to a single org
CREATE OR REPLACE FUNCTION get_calling_dashboard_stats(
  _org_id   uuid,
  _days     int      DEFAULT 7,
  _agent_ids uuid[]  DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  result json;
  cutoff timestamptz := now() - (_days || ' days')::interval;
BEGIN
  SELECT json_build_object(
    'overview', (
      SELECT json_build_object(
        'total_calls',   count(*),
        'total_duration', COALESCE(sum(conversation_duration), 0),
        'avg_duration',  COALESCE(
          CASE WHEN count(*) > 0
            THEN round(sum(conversation_duration)::numeric / count(*))
            ELSE 0 END, 0),
        'total_agents',  count(DISTINCT agent_id),
        'positive_rate', COALESCE(
          CASE WHEN count(*) > 0
            THEN round((count(*) FILTER (WHERE cd.category = 'positive'))::numeric / count(*) * 100)
            ELSE 0 END, 0)
      )
      FROM call_logs cl
      LEFT JOIN call_dispositions cd ON cd.id = cl.disposition_id
      WHERE cl.org_id = _org_id
        AND cl.created_at >= cutoff
        AND cl.status IN ('completed', 'failed', 'busy', 'no-answer', 'canceled')
        AND (_agent_ids IS NULL OR cl.agent_id = ANY(_agent_ids))
    ),
    'agent_stats', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.total_calls DESC)
      FROM (
        SELECT
          cl.agent_id,
          p.first_name || ' ' || p.last_name AS agent_name,
          count(*)                            AS total_calls,
          COALESCE(sum(cl.conversation_duration), 0) AS total_duration,
          CASE WHEN count(*) > 0
            THEN round(sum(cl.conversation_duration)::numeric / count(*)) ELSE 0
          END AS avg_call_duration,
          count(*) FILTER (WHERE cd.category = 'positive') AS positive_calls,
          count(*) FILTER (WHERE cd.category = 'negative') AS negative_calls,
          CASE WHEN count(*) > 0
            THEN round((count(*) FILTER (WHERE cd.category = 'positive'))::numeric / count(*) * 100)
            ELSE 0
          END AS conversion_rate
        FROM call_logs cl
        JOIN profiles p ON p.id = cl.agent_id
        LEFT JOIN call_dispositions cd ON cd.id = cl.disposition_id
        WHERE cl.org_id = _org_id
          AND cl.created_at >= cutoff
          AND cl.status IN ('completed', 'failed', 'busy', 'no-answer', 'canceled')
          AND cl.agent_id IS NOT NULL
          AND (_agent_ids IS NULL OR cl.agent_id = ANY(_agent_ids))
        GROUP BY cl.agent_id, p.first_name, p.last_name
      ) t
    ), '[]'::json),
    'disposition_stats', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.count DESC)
      FROM (
        SELECT
          cd.name     AS disposition_name,
          cd.category,
          count(*)    AS count
        FROM call_logs cl
        JOIN call_dispositions cd ON cd.id = cl.disposition_id
        WHERE cl.org_id = _org_id
          AND cl.created_at >= cutoff
          AND cl.status IN ('completed', 'failed', 'busy', 'no-answer', 'canceled')
          AND (_agent_ids IS NULL OR cl.agent_id = ANY(_agent_ids))
        GROUP BY cd.name, cd.category
      ) t
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;
