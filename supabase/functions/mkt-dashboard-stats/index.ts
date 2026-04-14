import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Decode JWT payload to extract sub (user ID). Returns null if not a valid JWT. */
function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

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

    // Parse body once (POST requests send params in body, not URL)
    let reqBody: Record<string, unknown> = {};
    try {
      reqBody = await req.clone().json();
    } catch { /* ignore — GET requests have no body */ }

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

    // Supabase gateway validates JWTs before functions run, so we can safely
    // decode the payload to get sub (user ID) without a round-trip to auth API.
    // Service role key is not a JWT, so decode will return null — handled below.
    const jwtUserId = decodeJwtSub(token);
    if (jwtUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', jwtUserId)
        .single();
      orgId = profile?.org_id || null;
    }

    // Fall back to org_id from request body/params (for service role / cron calls)
    if (!orgId) {
      orgId = (reqBody.org_id as string | undefined) || null;
      if (!orgId) {
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

    // Parse query params — body takes precedence over URL params (POST requests)
    const url = new URL(req.url);
    const daysBack = parseInt(
      String(reqBody.days ?? url.searchParams.get('days') ?? '30'),
      10
    );
    const sectionParam = String(
      reqBody.section ?? url.searchParams.get('section') ?? 'all'
    );

    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    const stats: Record<string, unknown> = {};

    // Support comma-separated sections e.g. "leads,funnel"
    const sections = sectionParam === 'all'
      ? ['overview', 'campaigns', 'leads', 'channels', 'funnel', 'actions']
      : sectionParam.split(',').map((s) => s.trim());

    await Promise.all(
      sections.map(async (s) => {
        switch (s) {
          case 'overview':
            stats.overview = await getOverviewStats(supabase, orgId!, since);
            break;
          case 'campaigns':
            stats.campaigns = await getCampaignStats(supabase, orgId!);
            break;
          case 'leads':
            stats.leads = await getLeadStats(supabase, orgId!, since);
            break;
          case 'channels':
            stats.channels = await getChannelStats(supabase, orgId!, since);
            break;
          case 'funnel':
            stats.funnel = await getFunnelStats(supabase, orgId!, since);
            break;
          case 'actions':
            stats.actions = await getRecentActions(supabase, orgId!);
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
  const [campaignsRes, actionsRes, enrollmentsRes] = await Promise.all([
    supabase.from('mkt_campaigns').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
    supabase.from('mkt_sequence_actions').select('id', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', since),
    supabase.from('mkt_sequence_enrollments').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('status', ['active']),
  ]);

  return {
    active_campaigns: campaignsRes.count || 0,
    leads_sourced: enrollmentsRes.count || 0,
    leads_converted: 0,
    total_actions: actionsRes.count || 0,
    active_enrollments: enrollmentsRes.count || 0,
  };
}

async function getCampaignStats(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string
): Promise<Array<Record<string, unknown>>> {
  // 2 parallel queries instead of N×3 per-campaign queries
  const [analyticsRes, metaRes] = await Promise.all([
    supabase.rpc('get_all_campaigns_analytics', { p_org_id: orgId }),
    supabase
      .from('mkt_campaigns')
      .select('id, campaign_type, budget, budget_spent')
      .eq('org_id', orgId),
  ]);

  const analytics = analyticsRes.data ?? [];
  const metaMap = new Map(
    (metaRes.data ?? []).map((c: Record<string, unknown>) => [c.id, c])
  );

  return analytics.map((row: Record<string, unknown>) => {
    const meta = metaMap.get(row.campaign_id) as Record<string, unknown> | undefined;
    return {
      id: row.campaign_id,
      name: row.campaign_name,
      type: meta?.campaign_type ?? null,
      status: row.campaign_status,
      budget: meta?.budget ?? null,
      spent: meta?.budget_spent ?? 0,
      leads: row.enrolled ?? 0,
      enrollments: row.active_enrollments ?? 0,
      actions: (row.sent as number ?? 0) + (row.failed as number ?? 0),
    };
  });
}

async function getLeadStats(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  since: string
): Promise<Record<string, unknown>> {
  const { data: enrollments } = await supabase
    .from('mkt_sequence_enrollments')
    .select('status, campaign_id')
    .eq('org_id', orgId)
    .gte('created_at', since);

  if (!enrollments) return { total: 0, by_status: {}, by_source: {}, score_distribution: {}, avg_score: 0 };

  const byStatus: Record<string, number> = {};
  const byCampaign: Record<string, number> = {};

  for (const e of enrollments) {
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    byCampaign[e.campaign_id] = (byCampaign[e.campaign_id] || 0) + 1;
  }

  return {
    total: enrollments.length,
    by_status: byStatus,
    by_source: byCampaign,
    score_distribution: {},
    avg_score: 0,
  };
}

async function getChannelStats(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  since: string
): Promise<Array<Record<string, unknown>>> {
  const { data: actions } = await supabase
    .from('mkt_sequence_actions')
    .select('channel, status, delivered_at, opened_at, clicked_at, replied_at')
    .eq('org_id', orgId)
    .gte('created_at', since);

  if (!actions) return [];

  const channels: Record<string, { sent: number; delivered: number; opened: number; clicked: number; replied: number; bounced: number; failed: number }> = {};

  for (const action of actions) {
    const ch = action.channel;
    if (!channels[ch]) channels[ch] = { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0 };

    // sent = anything that left our system (excludes pending/skipped)
    if (['sent', 'delivered', 'bounced'].includes(action.status)) channels[ch].sent++;
    // delivered = confirmed by provider webhook
    if (action.delivered_at) channels[ch].delivered++;
    if (action.opened_at) channels[ch].opened++;
    if (action.clicked_at) channels[ch].clicked++;
    if (action.replied_at) channels[ch].replied++;
    if (action.status === 'bounced') channels[ch].bounced++;
    if (action.status === 'failed') channels[ch].failed++;
  }

  // Return as array (component expects Array<ChannelData>)
  return Object.entries(channels).map(([channel, stats]) => ({
    channel,
    ...stats,
    open_rate: stats.delivered > 0 ? (stats.opened / stats.delivered * 100).toFixed(1) + '%' : '0%',
    click_rate: stats.delivered > 0 ? (stats.clicked / stats.delivered * 100).toFixed(1) + '%' : '0%',
    reply_rate: stats.sent > 0 ? (stats.replied / stats.sent * 100).toFixed(1) + '%' : '0%',
    bounce_rate: stats.sent > 0 ? (stats.bounced / stats.sent * 100).toFixed(1) + '%' : '0%',
  }));
}

async function getFunnelStats(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  since: string
): Promise<Record<string, unknown>> {
  const { data: enrollments } = await supabase
    .from('mkt_sequence_enrollments')
    .select('status')
    .eq('org_id', orgId)
    .gte('created_at', since);

  if (!enrollments) return { sourced: 0, enriched: 0, scored: 0, enrolled: 0, converted: 0, disqualified: 0, conversion_rate: '0%' };

  const total = enrollments.length;
  const active = enrollments.filter((e) => e.status === 'active').length;
  const completed = enrollments.filter((e) => e.status === 'completed').length;
  const cancelled = enrollments.filter((e) => e.status === 'cancelled').length;

  return {
    sourced: total,
    enriched: total,
    scored: total,
    enrolled: active + completed,
    converted: completed,
    disqualified: cancelled,
    conversion_rate: total > 0 ? ((completed / total) * 100).toFixed(1) + '%' : '0%',
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
        contacts(first_name, last_name, email, company),
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
    lead: a.mkt_sequence_enrollments?.contacts,
    campaign: a.mkt_sequence_enrollments?.mkt_campaigns?.name,
  }));
}
