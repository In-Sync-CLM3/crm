import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const SQL = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old entry if exists
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mkt-outreach-executor') THEN
      PERFORM cron.unschedule('mkt-outreach-executor');
    END IF;
    -- Register: fire every 5 minutes to kick-start if self-chain stopped
    PERFORM cron.schedule(
      'mkt-outreach-executor',
      '*/5 * * * *',
      $sql$SELECT net.http_post(
        url     := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-outreach-executor',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body    := '{}'::jsonb
      )$sql$
    );
  END IF;
END $$;

-- Verify the job is registered
SELECT jobname, schedule, active FROM cron.job WHERE jobname IN ('mkt-outreach-executor', 'mkt-sequence-executor');
`;

serve(async (_req) => {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), { status: 500, headers: { "Content-Type": "application/json" } });
  const sql = postgres(dbUrl, { max: 1 });
  try {
    const result = await sql.unsafe(SQL);
    return new Response(JSON.stringify({ ok: true, cron_jobs: result }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  } finally {
    await sql.end();
  }
});
