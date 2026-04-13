import postgres from "npm:postgres@3";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1 });

Deno.serve(async () => {
  try {
    // GIN trigram indexes for fast ILIKE matching on native contacts
    await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await sql.unsafe(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_native_designation_trgm
        ON mkt_native_contacts USING GIN (LOWER(designation) gin_trgm_ops)
    `);
    await sql.unsafe(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_native_industry_trgm
        ON mkt_native_contacts USING GIN (LOWER(industry_type) gin_trgm_ops)
    `);

    // Repoint get_icp_native_contacts with SECURITY DEFINER + local 25s timeout
    await sql.unsafe(`
CREATE OR REPLACE FUNCTION get_icp_native_contacts(
  p_industries    text[],
  p_designations  text[],
  p_company_sizes text[],
  p_limit         int  DEFAULT 500,
  p_offset        int  DEFAULT 0,
  p_min_id        uuid DEFAULT '00000000-0000-0000-0000-000000000000'
)
RETURNS TABLE (
  id              uuid,
  full_name       text,
  phone           text,
  email_official  text,
  email_personal  text,
  email_generic   text,
  company_name    text,
  designation     text,
  industry_type   text,
  emp_size        text,
  city            text,
  state           text,
  country         text,
  linkedin_url    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_desig_patterns text[];
  v_indus_patterns text[];
  v_no_desig       boolean;
  v_no_indus       boolean;
BEGIN
  SET LOCAL statement_timeout = '25000';
  v_no_desig := p_designations IS NULL OR array_length(p_designations, 1) IS NULL;
  v_no_indus := p_industries   IS NULL OR array_length(p_industries,   1) IS NULL;
  IF NOT v_no_desig THEN
    SELECT ARRAY_AGG('%' || LOWER(TRIM(x)) || '%') INTO v_desig_patterns
    FROM unnest(p_designations) x WHERE TRIM(x) <> '';
  END IF;
  IF NOT v_no_indus THEN
    SELECT ARRAY_AGG('%' || LOWER(TRIM(x)) || '%') INTO v_indus_patterns
    FROM unnest(p_industries) x WHERE TRIM(x) <> '';
  END IF;
  RETURN QUERY
  SELECT c.id, c.full_name, c.phone, c.email_official, c.email_personal,
    c.email_generic, c.company_name, c.designation, c.industry_type,
    c.emp_size, c.city, c.state, c.country, c.linkedin_url
  FROM mkt_native_contacts c
  WHERE c.id > p_min_id
    AND (
      (v_no_desig AND v_no_indus)
      OR (NOT v_no_desig AND v_desig_patterns IS NOT NULL
          AND LOWER(c.designation) ILIKE ANY(v_desig_patterns))
      OR (NOT v_no_indus AND v_indus_patterns IS NOT NULL
          AND LOWER(c.industry_type) ILIKE ANY(v_indus_patterns))
    )
  ORDER BY c.id LIMIT p_limit;
END;
$$
    `);

    // Per-step analytics RPC
    await sql.unsafe(`
CREATE OR REPLACE FUNCTION get_campaign_step_analytics(p_campaign_id uuid)
RETURNS TABLE (
  step_id      uuid,
  step_number  int,
  channel      text,
  delay_hours  int,
  template_id  uuid,
  in_queue     bigint,
  sent         bigint,
  delivered    bigint,
  opened       bigint,
  clicked      bigint,
  replied      bigint,
  failed       bigint,
  bounced      bigint,
  skipped      bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    s.id                                                                          AS step_id,
    s.step_number,
    s.channel,
    s.delay_hours,
    s.template_id,
    (SELECT COUNT(*) FROM mkt_sequence_enrollments e2
     WHERE e2.campaign_id = p_campaign_id
       AND e2.status      = 'active'
       AND e2.current_step = s.step_number)::bigint                              AS in_queue,
    COUNT(*) FILTER (WHERE a.status IN ('sent','delivered'))                      AS sent,
    COUNT(*) FILTER (WHERE a.delivered_at IS NOT NULL)                            AS delivered,
    COUNT(*) FILTER (WHERE a.opened_at IS NOT NULL)                               AS opened,
    COUNT(*) FILTER (WHERE a.clicked_at IS NOT NULL)                              AS clicked,
    COUNT(*) FILTER (WHERE a.replied_at IS NOT NULL)                              AS replied,
    COUNT(*) FILTER (WHERE a.status = 'failed')                                   AS failed,
    COUNT(*) FILTER (WHERE a.status = 'bounced')                                  AS bounced,
    COUNT(*) FILTER (WHERE a.status = 'skipped')                                  AS skipped
  FROM mkt_campaign_steps s
  LEFT JOIN mkt_sequence_actions a ON a.step_id = s.id
  WHERE s.campaign_id = p_campaign_id
    AND s.is_active    = true
  GROUP BY s.id, s.step_number, s.channel, s.delay_hours, s.template_id
  ORDER BY s.step_number;
$$;
    `);

    await sql.end();
    return new Response(JSON.stringify({ ok: true, message: "Migration applied" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    await sql.end();
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
