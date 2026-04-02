import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger, withTiming } from '../_shared/engineLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LEADS_PER_SEARCH = 25; // Apollo returns up to 25 per page
const MAX_PAGES = 4; // Max 100 leads per campaign per run

interface ApolloSearchParams {
  person_titles?: string[];
  person_locations?: string[];
  person_seniorities?: string[];
  q_organization_domains?: string[];
  organization_locations?: string[];
  organization_num_employees_ranges?: string[];
  q_keywords?: string;
  per_page?: number;
  page?: number;
}

interface ApolloPerson {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_numbers?: Array<{ sanitized_number: string }>;
  title: string;
  linkedin_url?: string;
  organization?: {
    name: string;
    website_url: string;
    industry: string;
    estimated_num_employees?: number;
  };
  city?: string;
  state?: string;
  country?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-apollo-sourcer');

  try {
    const supabase = getSupabaseClient();
    const apolloApiKey = Deno.env.get('APOLLO_API_KEY');

    if (!apolloApiKey) {
      throw new Error('Missing APOLLO_API_KEY environment variable');
    }

    // Check if a specific campaign_id was passed (manual trigger)
    let campaignFilter: string | null = null;
    try {
      const body = await req.json();
      campaignFilter = body?.campaign_id || null;
    } catch {
      // No body — scheduled invocation, process all active campaigns
    }

    // Fetch active campaigns with Apollo source
    let query = supabase
      .from('mkt_campaigns')
      .select('id, org_id, name, icp_criteria, max_enrollments')
      .eq('status', 'active')
      .in('campaign_type', ['outbound', 'inbound']);

    if (campaignFilter) {
      query = query.eq('id', campaignFilter);
    }

    const { data: campaigns, error: campaignsError } = await query;

    if (campaignsError) throw campaignsError;

    if (!campaigns || campaigns.length === 0) {
      await logger.info('no-active-campaigns', { message: 'No active campaigns to source' });
      return new Response(
        JSON.stringify({ message: 'No active campaigns', sourced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logger.info('sourcing-start', { campaign_count: campaigns.length });

    let totalNewLeads = 0;
    let totalDuplicates = 0;
    let totalErrors = 0;

    for (const campaign of campaigns) {
      const campLogger = createEngineLogger('mkt-apollo-sourcer', campaign.org_id);

      try {
        const result = await withTiming(
          campLogger,
          `source-campaign-${campaign.name}`,
          () => sourceCampaign(supabase, campaign, apolloApiKey, campLogger),
          { campaign_id: campaign.id }
        );

        totalNewLeads += result.newLeads;
        totalDuplicates += result.duplicates;
      } catch (error) {
        totalErrors++;
        await campLogger.error('campaign-source-failed', error, { campaign_id: campaign.id });
      }
    }

    await logger.info('sourcing-complete', {
      campaigns_processed: campaigns.length,
      total_new_leads: totalNewLeads,
      total_duplicates: totalDuplicates,
      total_errors: totalErrors,
    });

    return new Response(
      JSON.stringify({
        message: 'Apollo sourcing complete',
        campaigns_processed: campaigns.length,
        new_leads: totalNewLeads,
        duplicates: totalDuplicates,
        errors: totalErrors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('sourcer-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Source leads for a single campaign using Apollo People Search API.
 */
async function sourceCampaign(
  supabase: ReturnType<typeof getSupabaseClient>,
  campaign: { id: string; org_id: string; name: string; icp_criteria: Record<string, unknown>; max_enrollments: number },
  apolloApiKey: string,
  logger: ReturnType<typeof createEngineLogger>
): Promise<{ newLeads: number; duplicates: number }> {
  const icp = campaign.icp_criteria || {};

  // Check how many leads this campaign already has
  const { count: existingCount } = await supabase
    .from('mkt_leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .not('status', 'eq', 'disqualified');

  const remaining = campaign.max_enrollments - (existingCount || 0);
  if (remaining <= 0) {
    await logger.info('campaign-full', {
      campaign_id: campaign.id,
      existing: existingCount,
      max: campaign.max_enrollments,
    });
    return { newLeads: 0, duplicates: 0 };
  }

  // Check beachhead vertical configuration
  let beachheadMeta: Record<string, unknown> = {};
  const { data: beachheadConfigs } = await supabase
    .from('mkt_engine_config')
    .select('config_key, config_value')
    .eq('org_id', campaign.org_id)
    .in('config_key', ['beachhead_test_verticals', 'beachhead_winning_vertical']);

  const configMap: Record<string, unknown> = {};
  for (const cfg of beachheadConfigs || []) {
    configMap[cfg.config_key] = cfg.config_value;
  }

  const winningVertical = configMap['beachhead_winning_vertical'] as string | undefined;
  const testVerticals = configMap['beachhead_test_verticals'] as string[] | undefined;

  // Apply beachhead weighting to ICP industry/vertical
  if (winningVertical && testVerticals && testVerticals.length > 0) {
    // 70/20/10 split: 70% winning vertical, 20% second vertical, 10% others
    // Implement by adjusting the keywords/industry in ICP for weighted searches
    const otherVerticals = testVerticals.filter((v: string) => v !== winningVertical);
    const secondVertical = otherVerticals[0] || winningVertical;
    const remainingVerticals = otherVerticals.slice(1);

    // Weight the industry search toward the winning vertical
    // Apollo supports multiple keywords, so we build a weighted keyword string
    icp.industry = winningVertical;
    icp.beachhead_verticals = {
      primary: { vertical: winningVertical, weight: 70 },
      secondary: { vertical: secondVertical, weight: 20 },
      tertiary: { verticals: remainingVerticals, weight: 10 },
    };

    beachheadMeta = {
      beachhead_active: true,
      winning_vertical: winningVertical,
      test_verticals: testVerticals,
      weight_split: '70/20/10',
    };
  } else if (testVerticals && testVerticals.length > 0 && !winningVertical) {
    // No winner yet — rotate evenly across test verticals
    // Pick vertical based on a simple round-robin using the current date
    const dayIndex = new Date().getDate() % testVerticals.length;
    icp.industry = testVerticals[dayIndex];

    beachheadMeta = {
      beachhead_active: true,
      winning_vertical: null,
      test_verticals: testVerticals,
      selected_vertical: testVerticals[dayIndex],
      selection_method: 'round-robin',
    };
  }

  // Build Apollo search params from ICP criteria
  const searchParams = buildSearchParams(icp);
  const maxToFetch = Math.min(remaining, LEADS_PER_SEARCH * MAX_PAGES);

  let newLeads = 0;
  let duplicates = 0;
  let totalResults = 0;
  let creditsUsed = 0;

  // Paginate through Apollo results
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (newLeads >= maxToFetch) break;

    searchParams.page = page;
    searchParams.per_page = LEADS_PER_SEARCH;

    const apolloResult = await callApolloSearch(apolloApiKey, searchParams);

    if (!apolloResult.people || apolloResult.people.length === 0) break;

    totalResults += apolloResult.people.length;
    creditsUsed += apolloResult.people.length;

    // Process each person — insert or skip duplicates
    const insertResults = await Promise.allSettled(
      apolloResult.people.map((person: ApolloPerson) =>
        insertLead(supabase, campaign, person)
      )
    );

    for (const result of insertResults) {
      if (result.status === 'fulfilled') {
        if (result.value === 'inserted') newLeads++;
        else if (result.value === 'duplicate') duplicates++;
      }
    }

    // If Apollo returned fewer than requested, no more pages
    if (apolloResult.people.length < LEADS_PER_SEARCH) break;
  }

  // Log the search (include beachhead metadata if applicable)
  await supabase.from('mkt_apollo_searches').insert({
    org_id: campaign.org_id,
    campaign_id: campaign.id,
    search_params: searchParams,
    results_count: totalResults,
    new_leads_count: newLeads,
    duplicates_count: duplicates,
    api_credits_used: creditsUsed,
    status: 'completed',
    metadata: Object.keys(beachheadMeta).length > 0 ? beachheadMeta : undefined,
  });

  await logger.info('campaign-sourced', {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    results: totalResults,
    new_leads: newLeads,
    duplicates: duplicates,
  });

  return { newLeads, duplicates };
}

/**
 * Build Apollo People Search API parameters from ICP criteria.
 * ICP fields map: {industry, company_size, roles, geography, seniority, keywords, domains}
 */
function buildSearchParams(icp: Record<string, unknown>): ApolloSearchParams {
  const params: ApolloSearchParams = {};

  if (icp.roles && Array.isArray(icp.roles)) {
    params.person_titles = icp.roles as string[];
  }

  if (icp.seniority && Array.isArray(icp.seniority)) {
    params.person_seniorities = icp.seniority as string[];
  }

  if (icp.geography) {
    const geo = icp.geography;
    if (Array.isArray(geo)) {
      params.person_locations = geo as string[];
    } else if (typeof geo === 'string') {
      params.person_locations = [geo];
    }
  }

  if (icp.company_size) {
    const sizes = Array.isArray(icp.company_size) ? icp.company_size : [icp.company_size];
    params.organization_num_employees_ranges = sizes.map((s: unknown) => String(s));
  }

  if (icp.domains && Array.isArray(icp.domains)) {
    params.q_organization_domains = icp.domains as string[];
  }

  if (icp.keywords && typeof icp.keywords === 'string') {
    params.q_keywords = icp.keywords;
  }

  // Industry / vertical — append to keywords for Apollo filtering
  if (icp.industry && typeof icp.industry === 'string') {
    params.q_keywords = params.q_keywords
      ? `${params.q_keywords} ${icp.industry}`
      : icp.industry;
  }

  return params;
}

/**
 * Call Apollo People Search API.
 */
async function callApolloSearch(
  apiKey: string,
  params: ApolloSearchParams
): Promise<{ people: ApolloPerson[]; pagination: { total_entries: number } }> {
  const response = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apollo API error ${response.status}: ${errorText}`);
  }

  return await response.json();
}

/**
 * Insert a single lead into mkt_leads. Returns 'inserted' or 'duplicate'.
 * Uses the unique index on (org_id, email) to detect duplicates.
 */
async function insertLead(
  supabase: ReturnType<typeof getSupabaseClient>,
  campaign: { id: string; org_id: string },
  person: ApolloPerson
): Promise<'inserted' | 'duplicate' | 'skipped'> {
  // Skip people without email
  if (!person.email) return 'skipped';

  // Check for existing lead with same email in this org
  const { data: existing } = await supabase
    .from('mkt_leads')
    .select('id')
    .eq('org_id', campaign.org_id)
    .eq('email', person.email)
    .limit(1);

  if (existing && existing.length > 0) return 'duplicate';

  const phone = person.phone_numbers?.[0]?.sanitized_number || null;

  const { error } = await supabase.from('mkt_leads').insert({
    org_id: campaign.org_id,
    campaign_id: campaign.id,
    source: 'apollo',
    status: 'enriched', // Apollo data is already enriched
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    phone: phone,
    company: person.organization?.name || null,
    job_title: person.title || null,
    industry: person.organization?.industry || null,
    company_size: person.organization?.estimated_num_employees
      ? categorizeCompanySize(person.organization.estimated_num_employees)
      : null,
    city: person.city || null,
    state: person.state || null,
    country: person.country || 'India',
    linkedin_url: person.linkedin_url || null,
    website: person.organization?.website_url || null,
    enrichment_data: {
      apollo_id: person.id,
      organization: person.organization,
      sourced_at: new Date().toISOString(),
    },
  });

  if (error) {
    // Could be a race condition duplicate
    if (error.code === '23505') return 'duplicate';
    console.error('[mkt-apollo-sourcer] Insert error:', error);
    return 'skipped';
  }

  return 'inserted';
}

/**
 * Categorize employee count into company size bucket.
 */
function categorizeCompanySize(employees: number): string {
  if (employees <= 10) return '1-10';
  if (employees <= 50) return '11-50';
  if (employees <= 200) return '51-200';
  if (employees <= 1000) return '201-1000';
  if (employees <= 5000) return '1001-5000';
  return '5000+';
}
