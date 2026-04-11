import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { jsonResponse, errorResponse, handleCors } from '../_shared/responseHelpers.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingStep {
  org_id: string;
  product_key: string;
  step_name: string;
  status: string;
  scheduled_for: string | null;
  error_message: string | null;
}

interface ResumeResult {
  org_id: string;
  product_key: string;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Call mkt-product-manager with mode='resume' for a given org/product combo.
 */
async function resumeProduct(
  org_id: string,
  product_key: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<ResumeResult> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/mkt-product-manager`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ mode: 'resume', org_id, product_key }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    await logger.info('product-resumed', { org_id, product_key });
    return { org_id, product_key, success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await logger.error('resume-failed', err, { org_id, product_key });
    return { org_id, product_key, success: false, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const logger = createEngineLogger('mkt-onboarding-watchdog');
  const startedAt = Date.now();

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const now = new Date().toISOString();
    const today = new Date();

    await logger.info('watchdog-start', { now });

    // -----------------------------------------------------------------------
    // 1. Find (org_id, product_key) combos with pending/failed steps due now
    // -----------------------------------------------------------------------
    const { data: dueSteps, error: dueErr } = await supabase
      .from('mkt_onboarding_steps')
      .select('org_id, product_key, step_name, status, scheduled_for, error_message')
      .in('status', ['pending', 'failed'])
      .lte('scheduled_for', now);

    if (dueErr) throw new Error(`Failed to query mkt_onboarding_steps: ${dueErr.message}`);

    // Deduplicate (org_id, product_key) pairs
    const combos = new Map<string, { org_id: string; product_key: string }>();
    for (const step of (dueSteps || []) as OnboardingStep[]) {
      const key = `${step.org_id}::${step.product_key}`;
      if (!combos.has(key)) {
        combos.set(key, { org_id: step.org_id, product_key: step.product_key });
      }
    }

    // -----------------------------------------------------------------------
    // 2. Also find products where vapi_assistants step is pending + due (Day 7 deferred)
    //    These may not yet be in the main set — add them too
    // -----------------------------------------------------------------------
    const { data: vapiSteps, error: vapiErr } = await supabase
      .from('mkt_onboarding_steps')
      .select('org_id, product_key, step_name, status, scheduled_for')
      .eq('step_name', 'vapi_assistants')
      .eq('status', 'pending')
      .lte('scheduled_for', now);

    if (vapiErr) {
      await logger.warn('vapi-step-query-failed', { error: vapiErr.message });
    } else {
      for (const step of (vapiSteps || []) as OnboardingStep[]) {
        const key = `${step.org_id}::${step.product_key}`;
        if (!combos.has(key)) {
          combos.set(key, { org_id: step.org_id, product_key: step.product_key });
        }
      }
    }

    // -----------------------------------------------------------------------
    // 3. Resume each product
    // -----------------------------------------------------------------------
    const resumeResults: ResumeResult[] = [];

    for (const { org_id, product_key } of combos.values()) {
      const result = await resumeProduct(
        org_id,
        product_key,
        supabaseUrl,
        serviceRoleKey,
        logger,
      );
      resumeResults.push(result);
    }

    const productsResumed = resumeResults.filter((r) => r.success).length;
    const resumeErrors = resumeResults
      .filter((r) => !r.success)
      .map((r) => `${r.org_id}/${r.product_key}: ${r.error}`);

    // -----------------------------------------------------------------------
    // 4. Monthly source_leads re-sourcing (runs only on the 1st of the month)
    // -----------------------------------------------------------------------
    let sourceLeadsReset = 0;

    if (today.getDate() === 1) {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      await logger.info('monthly-resourcing-start', { month: startOfMonth });

      // Get all active products
      const { data: activeProducts, error: activeErr } = await supabase
        .from('mkt_products')
        .select('org_id, product_key')
        .eq('active', true);

      if (activeErr) {
        await logger.warn('active-products-query-failed', { error: activeErr.message });
      } else {
        for (const product of (activeProducts || [])) {
          try {
            // Check if source_leads step completed this month or doesn't exist
            const { data: sourceStep } = await supabase
              .from('mkt_onboarding_steps')
              .select('id, status, completed_at')
              .eq('org_id', product.org_id)
              .eq('product_key', product.product_key)
              .eq('step_name', 'source_leads')
              .maybeSingle();

            const needsReset =
              !sourceStep || // Step doesn't exist at all
              !sourceStep.completed_at || // Never completed
              sourceStep.completed_at < startOfMonth; // Completed before this month

            if (needsReset) {
              if (sourceStep) {
                // Reset existing step to pending
                const { error: resetErr } = await supabase
                  .from('mkt_onboarding_steps')
                  .update({
                    status: 'pending',
                    scheduled_for: new Date().toISOString(),
                    completed_at: null,
                    error_message: null,
                  })
                  .eq('id', sourceStep.id);

                if (resetErr) {
                  await logger.warn('source-leads-reset-failed', {
                    org_id: product.org_id,
                    product_key: product.product_key,
                    error: resetErr.message,
                  });
                  continue;
                }
              } else {
                // Insert new step row
                const { error: insertErr } = await supabase
                  .from('mkt_onboarding_steps')
                  .insert({
                    org_id: product.org_id,
                    product_key: product.product_key,
                    step_name: 'source_leads',
                    step_order: 8,
                    status: 'pending',
                    scheduled_for: new Date().toISOString(),
                  });

                if (insertErr) {
                  await logger.warn('source-leads-insert-failed', {
                    org_id: product.org_id,
                    product_key: product.product_key,
                    error: insertErr.message,
                  });
                  continue;
                }
              }

              sourceLeadsReset++;
              await logger.info('source-leads-reset', {
                org_id: product.org_id,
                product_key: product.product_key,
              });
            }
          } catch (err) {
            await logger.error('source-leads-check-failed', err, {
              org_id: product.org_id,
              product_key: product.product_key,
            });
          }
        }
      }

      await logger.info('monthly-resourcing-done', { source_leads_reset: sourceLeadsReset });
    }

    // -----------------------------------------------------------------------
    // 5. Summary log + response
    // -----------------------------------------------------------------------
    const duration_ms = Date.now() - startedAt;

    await logger.info('watchdog-complete', {
      combos_found: combos.size,
      products_resumed: productsResumed,
      source_leads_reset: sourceLeadsReset,
      errors: resumeErrors.length,
      duration_ms,
    });

    const summary = {
      products_resumed: productsResumed,
      source_leads_reset: sourceLeadsReset,
      errors: resumeErrors,
      duration_ms,
    };

    return jsonResponse(summary);
  } catch (error) {
    await logger.error('watchdog-fatal', error);
    return errorResponse(error);
  }
});
