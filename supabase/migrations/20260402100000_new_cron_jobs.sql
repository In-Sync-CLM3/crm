-- pg_cron jobs for exit-surveyor and client-reporter

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Monthly 1st at 4AM UTC (9:30 AM IST): Exit surveyor
    PERFORM cron.schedule(
      'mkt-exit-surveyor',
      '0 4 1 * *',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-exit-surveyor',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    -- Monthly 2nd at 5AM UTC (10:30 AM IST): Client outcome reporter
    PERFORM cron.schedule(
      'mkt-client-reporter',
      '0 5 2 * *',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-client-reporter',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    RAISE NOTICE 'Scheduled 2 new monthly cron jobs: mkt-exit-surveyor, mkt-client-reporter';
  ELSE
    RAISE NOTICE 'pg_cron not available — skipping';
  END IF;
END $outer$;
