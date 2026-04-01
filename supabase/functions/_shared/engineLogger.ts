import { getSupabaseClient } from './supabaseClient.ts';

type LogLevel = 'info' | 'warn' | 'error';

interface EngineLogEntry {
  org_id?: string;
  function_name: string;
  action: string;
  level?: LogLevel;
  details?: Record<string, unknown>;
  error?: string;
  duration_ms?: number;
  tokens_used?: number;
}

/**
 * Logs engine execution events to mkt_engine_logs table.
 * Provides structured logging for all Revenue Engine edge functions.
 */
export async function logEngine(entry: EngineLogEntry): Promise<void> {
  const {
    org_id,
    function_name,
    action,
    level = 'info',
    details = {},
    error,
    duration_ms,
    tokens_used,
  } = entry;

  // Always log to console
  const consoleMsg = `[MKT-${function_name}] ${action}`;
  if (level === 'error') {
    console.error(consoleMsg, { error, details, duration_ms });
  } else if (level === 'warn') {
    console.warn(consoleMsg, { details, duration_ms });
  } else {
    console.log(consoleMsg, { details, duration_ms });
  }

  // Write to database
  try {
    const supabase = getSupabaseClient();
    await supabase.from('mkt_engine_logs').insert({
      org_id: org_id || null,
      function_name,
      action,
      level,
      details,
      error: error || null,
      duration_ms: duration_ms || null,
      tokens_used: tokens_used || null,
    });
  } catch (e) {
    // Don't let logging failures break the engine
    console.error('[MKT-LOGGER-FAILED]', e);
  }
}

/**
 * Creates a scoped logger for a specific function.
 * Reduces boilerplate by pre-filling function_name and org_id.
 */
export function createEngineLogger(function_name: string, org_id?: string) {
  return {
    info: (action: string, details?: Record<string, unknown>, extra?: Partial<EngineLogEntry>) =>
      logEngine({ function_name, org_id, action, level: 'info', details, ...extra }),

    warn: (action: string, details?: Record<string, unknown>, extra?: Partial<EngineLogEntry>) =>
      logEngine({ function_name, org_id, action, level: 'warn', details, ...extra }),

    error: (action: string, error: unknown, details?: Record<string, unknown>, extra?: Partial<EngineLogEntry>) =>
      logEngine({
        function_name,
        org_id,
        action,
        level: 'error',
        error: error instanceof Error ? error.message : String(error),
        details: {
          ...details,
          stack: error instanceof Error ? error.stack : undefined,
        },
        ...extra,
      }),
  };
}

/**
 * Utility: measure execution time of an async function and log it.
 */
export async function withTiming<T>(
  logger: ReturnType<typeof createEngineLogger>,
  action: string,
  fn: () => Promise<T>,
  details?: Record<string, unknown>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration_ms = Date.now() - start;
    await logger.info(action, { ...details, duration_ms }, { duration_ms });
    return result;
  } catch (error) {
    const duration_ms = Date.now() - start;
    await logger.error(action, error, details, { duration_ms });
    throw error;
  }
}
