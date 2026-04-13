import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

// ---------------------------------------------------------------------------
// mkt-daily-lead-refresh
//
// Runs daily (via pg_cron at 01:00 UTC / 06:30 IST).
// For every active product across all orgs:
//   - Count contacts with status='new' (the uncontacted, actionable pool)
//   - If count < LEAD_CAP (3000), fire mkt-source-leads to top it up
//
// mkt-source-leads is self-chaining (cursor-based) so it pages through the
// 464K native dataset automatically until the gap is filled.
// ---------------------------------------------------------------------------

const LEAD_CAP = 3000;

interface ActiveProduct {
  org_id: string;
  product_key: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-daily-lead-refresh');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    await logger.info('daily-refresh-start', { ts: new Date().toISOString() });

    // 1. Fetch all registered products
    const { data: products, error: prodError } = await supabase
      .from('mkt_products')
      .select('org_id, product_key');

    if (prodError) throw new Error(`Failed to fetch active products: ${prodError.message}`);
    if (!products || products.length === 0) {
      await logger.info('daily-refresh-no-products', {});
      return new Response(
        JSON.stringify({ status: 'ok', triggered: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await logger.info('daily-refresh-products', { count: products.length });

    let triggered = 0;
    let skipped = 0;

    // 2. For each product, count available (status='new') contacts
    for (const p of products as ActiveProduct[]) {
      const { org_id, product_key } = p;

      const { count, error: countError } = await supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org_id)
        .eq('mkt_product_key', product_key)
        .eq('status', 'new');

      if (countError) {
        await logger.warn('daily-refresh-count-error', { org_id, product_key, error: countError.message });
        continue;
      }

      const available = count ?? 0;

      if (available >= LEAD_CAP) {
        await logger.info('daily-refresh-skip', { org_id, product_key, available, cap: LEAD_CAP });
        skipped++;
        continue;
      }

      await logger.info('daily-refresh-trigger', {
        org_id, product_key,
        available,
        gap: LEAD_CAP - available,
      });

      // 3. Fire mkt-source-leads (fire-and-forget — it self-chains until cap is filled)
      fetch(`${supabaseUrl}/functions/v1/mkt-source-leads`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ org_id, product_key }),
      }).catch(() => {});

      triggered++;
    }

    const result = { status: 'ok', total_products: products.length, triggered, skipped };
    await logger.info('daily-refresh-complete', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    await logger.error('daily-refresh-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
