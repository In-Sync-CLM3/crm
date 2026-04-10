-- ============================================================================
-- ICP Evolution — Weekly pg_cron Schedule
-- Runs every Monday at 03:30 UTC (09:00 IST).
-- Calls mkt-evolve-icp with mode='evolve' to evolve all active product ICPs.
-- ============================================================================

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Monday 03:30 UTC (09:00 IST): Weekly ICP evolution
    PERFORM cron.schedule(
      'mkt-evolve-icp-weekly',
      '30 3 * * 1',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-evolve-icp',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{"mode": "evolve"}'::jsonb
      )$sql$
    );

    RAISE NOTICE 'mkt-evolve-icp-weekly cron job scheduled (Monday 03:30 UTC)';

  ELSE
    RAISE NOTICE 'pg_cron extension not found — skipping mkt-evolve-icp cron. Enable pg_cron and re-run.';
  END IF;
END $outer$;
