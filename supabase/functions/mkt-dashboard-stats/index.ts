import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * API endpoint for the CRM frontend Revenue Engine dashboard.
 * Returns aggregated stats: campaigns, leads, channels, funnel, recent actions.
 * Supports date range filtering.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    // Authenticate user — supports user JWT or service role key with org_id in body/params
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    let orgId: string | null = null;

    // Try user JWT auth first
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (!userError && user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();
      orgId = profile?.org_id || null;
    }

    // Fall back to org_id from request body/params (for service role / cron calls)
    if (!orgId) {
      try {
        const body = await req.clone().json();
        orgId = body.org_id || null;
      } catch {
        const url = new URL(req.url);
        orgId = url.searchParams.get('org_id');
      }
    }

    if (!orgId) {
      return new Response(JSON.stringify({ error: 'No organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse query params
    const url = new URL(req.url);
    const daysBack = parseInt(url.searchParams.get('days') || '30', 10);
    const section = url.searchParams.get('section') || 'all'; // all | overview | campaigns | leads | channels | funnel | actions

    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    const stats: Record<string, unknown> = {};

    // Fetch sections in parallel based on request
    const sections = section === 'all'
      ? ['overview', 'campaigns', 'leads', 'channels', 'funnel', 'actions']
      : [section];

    await Promise.all(
      sections.map(async (s) => {
        switch (s) {
          case 'overview':
            stats.overview = await getOverviewStats(supabase, orgId, since);
            break;
          case 'campaigns':
            stats.campaigns = await getCampaignStats(supabase, orgId);
            break;
          case 'leads':
            stats.leads = await getLeadStats(supabase, orgId, since);
            break;
          case 'channels':
            stats.channels = await getChannelStats(supabase, orgId, since);
            break;
          case 'funnel':
            stats.funnel = await getFunnelStats(supabase, orgId, since);
            break;
          case 'actions':
            stats.actions = await getRecentActions(supabase, orgId);
            break;
        }
      })
    );

    return new Response(
      JSON.stringify({ success: true, period_days: daysBack, ...stats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getOverviewStats(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  since: string
): Promise<Record<string, unknown>> {
  const [
    campaignsRes,
    leadsRes,
    convertedRes,
    actionsRes,
    enrollmentsRes,
  ] = await Promise.all([
    supabase.from('mkt_campaigns').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
    supabase.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', since),
    supabase.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'converted').gte('converted_at', since),
    supabase.from('mkt_sequence_actions').select('id', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', since),
    supabase.from('mkt_sequence_enrollments').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
  ]);

  return {
    active_campaigns: campaignsRes.count || 0,
    leads_sourced: leadsRes.count || 0,
    leads_converted: convertedRes.count || 0,
    total_actions: actionsRes.count || 0,
    active_enrollments: enrollmentsRes.count || 0,
  };
}

async function getCampaignStats(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string
): Promise<Array<Record<string, unknown>>> {
  const { data: campaigns } = await supabase
    .from('mkt_campaigns')
    .select('id, name, campaign_type, status, start_date, budget, budget_spent, max_enrollments, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!campaigns) return [];

  // Enrich with counts
  const enriched = await Promise.all(
    campaigns.map(async (campaign) => {
      const [leadCount, enrollCount, actionCount] = await Promise.all([
        supabase.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign.id),
        supabase.from('mkt_sequence_enrollments').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign.id),
        supabase.from('mkt_sequence_actions').select('id', { count: 'exact', head: true })
          .in('enrollment_id',
            (await supabase.from('mkt_sequence_enrollments').select('id').eq('campaign_id', campaign.id)).data?.map((e) => e.id) || ['__none__']
          ),
      ]);

      return {
        ...campaign,
        leads_count: leadCount.count || 0,
        enrollments_count: enrollCount.count || 0,
        actions_count: actionCount.count || 0,
      };
    })
  );

  return enriched;
}

async function getLeadStats(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  since: string
): Promise<Record<string, unknown>> {
  const { data: leads } = await supabase
    .from('mkt_leads')
    .select('status, source, total_score')
    .eq('org_id', orgId)
    .gte('created_at', since);

  if (!leads) return { by_status: {}, by_source: {}, score_distribution: {} };

  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const scoreRanges = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };

  for (const lead of leads) {
    byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
    bySource[lead.source] = (bySource[lead.source] || 0) + 1;

    const score = lead.total_score || 0;
    if (score <= 20) scoreRanges['0-20']++;
    else if (score <= 40) scoreRanges['21-40']++;
    else if (score <= 60) scoreRanges['41-60']++;
    else if (score <= 80) scoreRanges['61-80']++;
    else scoreRanges['81-100']++;
  }

  return {
    total: leads.length,
    by_status: byStatus,
    by_source: bySource,
    score_distribution: scoreRanges,
    avg_score: leads.length > 0
      ? Math.round(leads.reduce((s, l) => s + (l.total_score || 0), 0) / leads.length)
      : 0,
  };
}

async function getChannelStats(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  since: string
): Promise<Record<string, unknown>> {
  const { data: actions } = await supabase
    .from('mkt_sequence_actions')
    .select('channel, status, opened_at, clicked_at, replied_at')
    .eq('org_id', orgId)
    .gte('created_at', since);

  if (!actions) return {};

  const channels: Record<string, { sent: number; delivered: number; opened: number; clicked: number; replied: number; failed: number }> = {};

  for (const action of actions) {
    const ch = action.channel;
    if (!channels[ch]) channels[ch] = { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, failed: 0 };

    if (['sent', 'delivered', 'pending'].includes(action.status)) channels[ch].sent++;
    if (action.status === 'delivered') channels[ch].delivered++;
    if (action.opened_at) channels[ch].opened++;
    if (action.clicked_at) channels[ch].clicked++;
    if (action.replied_at) channels[ch].replied++;
    if (['failed', 'bounced'].includes(action.status)) channels[ch].failed++;
  }

  // Calculate rates
  const withRates: Record<string, unknown> = {};
  for (const [ch, stats] of Object.entries(channels)) {
    withRates[ch] = {
      ...stats,
      open_rate: stats.sent > 0 ? (stats.opened / stats.sent * 100).toFixed(1) + '%' : '0%',
      click_rate: stats.sent > 0 ? (stats.clicked / stats.sent * 100).toFixed(1) + '%' : '0%',
      reply_rate: stats.sent > 0 ? (stats.replied / stats.sent * 100).toFixed(1) + '%' : '0%',
    };
  }

  return withRates;
}

async function getFunnelStats(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  since: string
): Promise<Record<string, unknown>> {
  const [sourced, enriched, scored, enrolled, converted, disqualified] = await Promise.all([
    supabase.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', since),
    supabase.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('status', ['enriched', 'scored', 'enrolled', 'converted']).gte('created_at', since),
    supabase.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('status', ['scored', 'enrolled', 'converted']).gte('created_at', since),
    supabase.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('status', ['enrolled', 'converted']).gte('created_at', since),
    supabase.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'converted').gte('created_at', since),
    supabase.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'disqualified').gte('created_at', since),
  ]);

  const s = sourced.count || 0;
  return {
    sourced: s,
    enriched: enriched.count || 0,
    scored: scored.count || 0,
    enrolled: enrolled.count || 0,
    converted: converted.count || 0,
    disqualified: disqualified.count || 0,
    conversion_rate: s > 0 ? ((converted.count || 0) / s * 100).toFixed(1) + '%' : '0%',
  };
}

async function getRecentActions(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string
): Promise<Array<Record<string, unknown>>> {
  const { data: actions } = await supabase
    .from('mkt_sequence_actions')
    .select(`
      id, channel, status, step_number, variant,
      scheduled_at, sent_at, delivered_at, opened_at, clicked_at, replied_at,
      metadata,
      mkt_sequence_enrollments!inner(
        lead_id,
        mkt_leads(first_name, last_name, email, company),
        mkt_campaigns(name)
      )
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (actions || []).map((a) => ({
    id: a.id,
    channel: a.channel,
    status: a.status,
    step_number: a.step_number,
    variant: a.variant,
    sent_at: a.sent_at,
    opened_at: a.opened_at,
    clicked_at: a.clicked_at,
    replied_at: a.replied_at,
    lead: a.mkt_sequence_enrollments?.mkt_leads,
    campaign: a.mkt_sequence_enrollments?.mkt_campaigns?.name,
  }));
}
