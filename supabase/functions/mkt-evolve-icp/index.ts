import { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvolveBody {
  mode: 'evolve';
  org_id?: string;      // if omitted, evolve all active products across all orgs
  product_key?: string; // if omitted, evolve all active products for the org
}

interface ManualOverrideBody {
  mode: 'manual_override';
  org_id: string;
  product_key: string;
  icp_patch: Partial<ICPFields>;
  reason: string;
  evolved_by?: 'manual' | 'amit_suggestion'; // defaults to 'manual'; pass 'amit_suggestion' from Arohan chat
  confidence_score?: number; // 0.0-1.0; if omitted, current value is preserved
}

interface ICPFields {
  industries: string[];
  company_sizes: string[];
  designations: string[];
  geographies: string[];
  languages: string[];
  budget_range: { min_paise: number; max_paise: number; currency: string };
  pain_points: string[];
  aha_moment_days: number | null;
}

interface ICPRow extends ICPFields {
  id: string;
  org_id: string;
  product_key: string;
  version: number;
  confidence_score: number;
  last_evolved_at: string;
  evolution_reason: string | null;
  evolved_by: string;
}

type RequestBody = EvolveBody | ManualOverrideBody;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count occurrences of a field value across an array of lead rows. */
function buildFreqMap(
  rows: Record<string, unknown>[],
  field: string,
): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const row of rows) {
    const val = row[field];
    if (val != null && String(val).trim()) {
      const key = String(val).trim();
      freq[key] = (freq[key] || 0) + 1;
    }
  }
  return freq;
}

/** Top N keys from a frequency map, sorted by count descending. */
function topKeys(freq: Record<string, number>, limit = 7): string[] {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

/**
 * Confidence score: starts at 0.300 (50-record onboarding sample),
 * grows toward 0.950 as conversion count increases.
 * Reaches 0.950 at 100 conversions.
 */
function calcConfidence(convertedCount: number): number {
  const raw = 0.3 + (convertedCount / 100) * 0.65;
  return Math.round(Math.min(0.95, raw) * 1000) / 1000;
}

/** Fetch all campaign IDs for a given org + product_key. */
async function getCampaignIdsForProduct(
  supabase: SupabaseClient,
  orgId: string,
  productKey: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('mkt_campaigns')
    .select('id')
    .eq('org_id', orgId)
    .contains('metadata', { product_key: productKey });
  return (data || []).map((c: { id: string }) => c.id);
}

// ---------------------------------------------------------------------------
// ICP Evolution Core
// ---------------------------------------------------------------------------

/**
 * Evolve the ICP for a single product if guard conditions pass.
 * Inserts a new version row — never modifies existing rows.
 * Returns the new version number, or null if conditions were not met.
 */
async function evolveProductICP(
  supabase: SupabaseClient,
  orgId: string,
  productKey: string,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<number | null> {
  // 1. Fetch current ICP
  const { data: currentICPs } = await supabase
    .rpc('get_current_icp', { _org_id: orgId, _product_key: productKey });

  const currentICP = (currentICPs as ICPRow[] | null)?.[0];

  // 2. Guard: enforce 7-day cadence between evolutions
  if (currentICP) {
    const daysSince = (Date.now() - new Date(currentICP.last_evolved_at).getTime()) / 86_400_000;
    if (daysSince < 7) {
      await logger.info('icp-evolution-skipped', {
        org_id: orgId,
        product_key: productKey,
        reason: `Only ${daysSince.toFixed(1)} days since last evolution (min 7)`,
      });
      return null;
    }
  }

  // 3. Get campaign IDs for this product
  const campaignIds = await getCampaignIdsForProduct(supabase, orgId, productKey);

  // 4. Fetch converted contacts attributed to this product's campaigns
  // contacts is now the source of truth; mkt_sequence_enrollments.lead_id → contacts.id
  let convertedLeads: Record<string, unknown>[] = [];
  if (campaignIds.length > 0) {
    const { data: enrollments } = await supabase
      .from('mkt_sequence_enrollments')
      .select('lead_id')
      .in('campaign_id', campaignIds);
    const contactIds = (enrollments || []).map((e: any) => e.lead_id).filter(Boolean);
    if (contactIds.length > 0) {
      const { data } = await supabase
        .from('contacts')
        .select('industry_type, headline, job_title, source')
        .eq('org_id', orgId)
        .eq('status', 'converted')
        .in('id', contactIds);
      convertedLeads = (data as Record<string, unknown>[] | null) || [];
    }
  }

  // 5. Guard: minimum 5 conversions required for a meaningful signal
  if (convertedLeads.length < 5) {
    await logger.info('icp-evolution-skipped', {
      org_id: orgId,
      product_key: productKey,
      reason: `Only ${convertedLeads.length} conversions (minimum 5 required)`,
    });
    return null;
  }

  // 6. Build new ICP fields from conversion data
  // contacts uses industry_type (not industry), headline (not company_size)
  const industryFreq    = buildFreqMap(convertedLeads, 'industry_type');
  const designationFreq = buildFreqMap(convertedLeads, 'job_title');
  const companySizeFreq = buildFreqMap(convertedLeads, 'headline');

  const newIndustries   = topKeys(industryFreq);
  const newDesignations = topKeys(designationFreq);
  const newCompanySizes = topKeys(companySizeFreq);
  const newConfidence   = calcConfidence(convertedLeads.length);
  const nextVersion     = (currentICP?.version ?? 0) + 1;
  const evolutionReason = [
    `Evolved from ${convertedLeads.length} conversions.`,
    newIndustries.length   > 0 ? `Top industries: ${newIndustries.slice(0, 3).join(', ')}.`   : '',
    newDesignations.length > 0 ? `Top designations: ${newDesignations.slice(0, 3).join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  // 7. Insert new version (preserving non-conversion-derived fields from current ICP)
  const { error: insertErr } = await supabase.from('mkt_product_icp').insert({
    org_id:          orgId,
    product_key:     productKey,
    industries:      newIndustries,
    designations:    newDesignations,
    company_sizes:   newCompanySizes,
    geographies:     currentICP?.geographies  ?? [],
    languages:       currentICP?.languages    ?? ['en'],
    budget_range:    currentICP?.budget_range ?? { min_paise: 0, max_paise: 0, currency: 'INR' },
    pain_points:     currentICP?.pain_points  ?? [],
    aha_moment_days: currentICP?.aha_moment_days ?? null,
    version:         nextVersion,
    confidence_score: newConfidence,
    evolved_by:      'optimizer',
    evolution_reason: evolutionReason,
    last_evolved_at: new Date().toISOString(),
  });

  if (insertErr) {
    await logger.error('icp-insert-failed', new Error(insertErr.message), { org_id: orgId, product_key: productKey });
    return null;
  }

  await logger.info('icp-evolved', {
    org_id: orgId,
    product_key: productKey,
    version: nextVersion,
    confidence_score: newConfidence,
    converted_sample: convertedLeads.length,
    reason: evolutionReason,
  });

  // 8. Cascade the new ICP to all active/draft campaigns for this product
  await cascadeICPToCampaigns(supabase, orgId, productKey, campaignIds, {
    industries:    newIndustries,
    designations:  newDesignations,
    company_sizes: newCompanySizes,
    geographies:   currentICP?.geographies ?? [],
    languages:     currentICP?.languages   ?? ['en'],
  }, logger);

  return nextVersion;
}

/**
 * Write the evolved ICP criteria to all active/draft campaigns for this product.
 * Campaign IDs are pre-fetched to avoid a redundant query.
 */
async function cascadeICPToCampaigns(
  supabase: SupabaseClient,
  orgId: string,
  productKey: string,
  campaignIds: string[],
  icpCriteria: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<void> {
  if (campaignIds.length === 0) return;

  // Only cascade to active or draft campaigns (not paused/completed)
  const { data: targetCampaigns } = await supabase
    .from('mkt_campaigns')
    .select('id')
    .in('id', campaignIds)
    .in('status', ['active', 'draft']);

  const targetIds = (targetCampaigns || []).map((c: { id: string }) => c.id);
  if (targetIds.length === 0) return;

  const { error } = await supabase
    .from('mkt_campaigns')
    .update({ icp_criteria: icpCriteria })
    .in('id', targetIds);

  if (error) {
    await logger.warn('icp-cascade-failed', {
      org_id: orgId,
      product_key: productKey,
      error: error.message,
    });
  } else {
    await logger.info('icp-cascaded', {
      org_id: orgId,
      product_key: productKey,
      campaign_count: targetIds.length,
    });
  }
}

// ---------------------------------------------------------------------------
// Mode handlers
// ---------------------------------------------------------------------------

async function handleEvolve(
  supabase: SupabaseClient,
  body: EvolveBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  // Determine which org + product pairs to process
  let pairs: Array<{ org_id: string; product_key: string }> = [];

  if (body.org_id && body.product_key) {
    // Single product
    pairs = [{ org_id: body.org_id, product_key: body.product_key }];
  } else if (body.org_id) {
    // All active products for one org
    const { data } = await supabase
      .from('mkt_products')
      .select('org_id, product_key')
      .eq('org_id', body.org_id)
      .eq('active', true);
    pairs = data || [];
  } else {
    // Cron-triggered: all active products across all orgs
    const { data } = await supabase
      .from('mkt_products')
      .select('org_id, product_key')
      .eq('active', true);
    pairs = data || [];
  }

  const results: Array<{
    org_id: string;
    product_key: string;
    new_version: number | null;
  }> = [];

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  for (const { org_id, product_key } of pairs) {
    const newVersion = await evolveProductICP(supabase, org_id, product_key, logger);
    results.push({ org_id, product_key, new_version: newVersion });

    // If evolution produced a new ICP version, refresh all content automatically
    if (newVersion !== null) {
      fetch(`${supabaseUrl}/functions/v1/mkt-product-manager`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'refresh_content', org_id, product_key }),
      }).catch(() => {});
      await logger.info('icp-templates-regeneration-triggered', { org_id, product_key, version: newVersion });
    }
  }

  const evolved = results.filter((r) => r.new_version !== null).length;
  const skipped = results.length - evolved;

  return { evolved, skipped, total: results.length, results };
}

async function handleManualOverride(
  supabase: SupabaseClient,
  body: ManualOverrideBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { org_id, product_key, icp_patch, reason, evolved_by = 'manual', confidence_score: requestedConfidence } = body;

  if (!reason || reason.trim().length === 0) {
    throw new Error('reason is required for manual_override');
  }

  // Fetch current ICP to merge on top of
  const { data: currentICPs } = await supabase
    .rpc('get_current_icp', { _org_id: org_id, _product_key: product_key });

  const currentICP = (currentICPs as ICPRow[] | null)?.[0];
  const nextVersion = (currentICP?.version ?? 0) + 1;

  // Merge: patch fields override current values; unpatched fields are preserved
  const merged: ICPFields = {
    industries:      icp_patch.industries      ?? currentICP?.industries      ?? [],
    company_sizes:   icp_patch.company_sizes   ?? currentICP?.company_sizes   ?? [],
    designations:    icp_patch.designations    ?? currentICP?.designations    ?? [],
    geographies:     icp_patch.geographies     ?? currentICP?.geographies     ?? [],
    languages:       icp_patch.languages       ?? currentICP?.languages       ?? ['en'],
    budget_range:    icp_patch.budget_range    ?? currentICP?.budget_range    ?? { min_paise: 0, max_paise: 0, currency: 'INR' },
    pain_points:     icp_patch.pain_points     ?? currentICP?.pain_points     ?? [],
    aha_moment_days: icp_patch.aha_moment_days ?? currentICP?.aha_moment_days ?? null,
  };

  const { error } = await supabase.from('mkt_product_icp').insert({
    org_id,
    product_key,
    ...merged,
    version:          nextVersion,
    confidence_score: requestedConfidence ?? currentICP?.confidence_score ?? 0.300,
    evolved_by,
    evolution_reason: reason,
    last_evolved_at:  new Date().toISOString(),
  });

  if (error) throw new Error(`Failed to insert manual ICP: ${error.message}`);

  await logger.info('icp-manual-override', {
    org_id,
    product_key,
    version: nextVersion,
    evolved_by,
    reason,
    fields_patched: Object.keys(icp_patch),
  });

  // Cascade to campaigns
  const campaignIds = await getCampaignIdsForProduct(supabase, org_id, product_key);
  await cascadeICPToCampaigns(supabase, org_id, product_key, campaignIds, {
    industries:    merged.industries,
    designations:  merged.designations,
    company_sizes: merged.company_sizes,
    geographies:   merged.geographies,
    languages:     merged.languages,
  }, logger);

  // Wipe stale templates + scripts and regenerate from the new ICP — fire-and-forget.
  // A single refresh_content call handles all 3 steps sequentially (avoids the race
  // condition that 3 parallel reset_step calls would create).
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  fetch(`${supabaseUrl}/functions/v1/mkt-product-manager`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'refresh_content', org_id, product_key }),
  }).catch(() => {});

  await logger.info('icp-templates-regeneration-triggered', { org_id, product_key, version: nextVersion });

  return {
    org_id,
    product_key,
    new_version:    nextVersion,
    fields_patched: Object.keys(icp_patch),
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-evolve-icp');

  try {
    const supabase = getSupabaseClient();
    const body: RequestBody = await req.json();

    let result: Record<string, unknown> = {};

    switch (body.mode) {
      case 'evolve':
        result = await handleEvolve(supabase, body as EvolveBody, logger);
        break;
      case 'manual_override':
        result = await handleManualOverride(supabase, body as ManualOverrideBody, logger);
        break;
      default:
        throw new Error(`Unknown mode: ${(body as Record<string, unknown>).mode}`);
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    await logger.error('handler-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
