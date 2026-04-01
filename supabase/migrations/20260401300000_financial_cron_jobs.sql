-- pg_cron jobs for Financial Intelligence Layer

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Every Monday 1AM UTC (6:30 AM IST): Metrics collector (before weekly report)
    PERFORM cron.schedule(
      'mkt-metrics-collector',
      '0 1 * * 1',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-metrics-collector',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    -- Every 30 minutes: Breakpoint monitor
    PERFORM cron.schedule(
      'mkt-breakpoint-monitor',
      '30 * * * *',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-breakpoint-monitor',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    RAISE NOTICE 'Financial Intelligence: 2 pg_cron jobs scheduled';
  ELSE
    RAISE NOTICE 'pg_cron not available — skipping';
  END IF;
END $outer$;
