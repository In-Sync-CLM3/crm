import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const SQL = `
UPDATE public.contacts c
   SET status = 'contacted'
 WHERE c.status = 'new'
   AND EXISTS (
     SELECT 1 FROM public.mkt_sequence_enrollments e
      WHERE e.lead_id = c.id
   );

CREATE OR REPLACE FUNCTION public.enroll_new_contacts(
  p_org_id      UUID,
  p_campaign_id UUID,
  p_product_key TEXT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now      TIMESTAMPTZ := NOW();
  v_inserted INT;
BEGIN
  INSERT INTO public.mkt_sequence_enrollments
    (org_id, lead_id, campaign_id, current_step, status, next_action_at, enrolled_at)
  SELECT
    c.org_id, c.id, p_campaign_id, 1, 'active', v_now, v_now
  FROM public.contacts c
  WHERE c.org_id          = p_org_id
    AND c.mkt_product_key = p_product_key
    AND c.status          = 'new'
    AND NOT EXISTS (
      SELECT 1 FROM public.mkt_sequence_enrollments e
       WHERE e.lead_id     = c.id
         AND e.campaign_id = p_campaign_id
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.contacts
     SET status = 'contacted'
   WHERE org_id          = p_org_id
     AND mkt_product_key = p_product_key
     AND status          = 'new'
     AND EXISTS (
       SELECT 1 FROM public.mkt_sequence_enrollments e
        WHERE e.lead_id     = id
          AND e.campaign_id = p_campaign_id
     );

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enroll_new_contacts(UUID, UUID, TEXT) TO service_role;
`;

serve(async (_req) => {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(SQL);

    // Verify: count remaining 'new' contacts per product
    const counts = await sql`
      SELECT mkt_product_key, COUNT(*) AS new_count
      FROM public.contacts
      WHERE status = 'new' AND mkt_product_key IS NOT NULL
      GROUP BY mkt_product_key
      ORDER BY new_count DESC
    `;

    return new Response(JSON.stringify({
      ok: true,
      message: "Backfill complete + enroll_new_contacts RPC updated",
      remaining_new_per_product: counts,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  } finally {
    await sql.end();
  }
});
