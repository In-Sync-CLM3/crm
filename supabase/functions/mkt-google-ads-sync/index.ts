import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Syncs Google Ads campaign metrics and pushes offline conversions to GA4.
 * Runs daily at 3AM via pg_cron.
 *
 * Two flows:
 * 1. PULL: Google Ads API → mkt_google_ads_campaigns + mkt_google_ads_keywords
 * 2. PUSH: mkt_google_ads_feedback → GA4 Measurement Protocol (offline conversions)
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-google-ads-sync');

  try {
    const supabase = getSupabaseClient();

    // Check for required config
    const googleAdsConfig = {
      developerToken: Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN'),
      clientId: Deno.env.get('GOOGLE_ADS_CLIENT_ID'),
      clientSecret: Deno.env.get('GOOGLE_ADS_CLIENT_SECRET'),
      refreshToken: Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN'),
    };

    const ga4Config = {
      measurementId: Deno.env.get('GA4_MEASUREMENT_ID'),
      apiSecret: Deno.env.get('GA4_API_SECRET'),
    };

    // Allow partial execution — pull and push independently
    let pullResult = { synced: 0, error: null as string | null };
    let pushResult = { pushed: 0, error: null as string | null };

    // 1. PULL — Sync Google Ads campaign metrics
    if (googleAdsConfig.developerToken && googleAdsConfig.refreshToken) {
      pullResult = await pullGoogleAdsMetrics(supabase, googleAdsConfig, logger);
    } else {
      pullResult.error = 'Google Ads credentials not configured — skipping pull';
      await logger.warn('pull-skipped', { reason: 'Missing Google Ads credentials' });
    }

    // 2. PUSH — Send offline conversions to GA4
    if (ga4Config.measurementId && ga4Config.apiSecret) {
      pushResult = await pushOfflineConversions(supabase, ga4Config, logger);
    } else {
      pushResult.error = 'GA4 credentials not configured — skipping push';
      await logger.warn('push-skipped', { reason: 'Missing GA4 credentials' });
    }

    await logger.info('sync-complete', {
      pull: pullResult,
      push: pushResult,
    });

    return new Response(
      JSON.stringify({
        message: 'Google Ads sync complete',
        pull: pullResult,
        push: pushResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('sync-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Pull Google Ads campaign and keyword metrics.
 * Uses Google Ads API v16 with GAQL queries.
 */
async function pullGoogleAdsMetrics(
  supabase: ReturnType<typeof getSupabaseClient>,
  config: { developerToken: string | undefined; clientId: string | undefined; clientSecret: string | undefined; refreshToken: string | undefined },
  logger: ReturnType<typeof createEngineLogger>
): Promise<{ synced: number; error: string | null }> {
  try {
    // Get access token via OAuth refresh
    const accessToken = await getGoogleAccessToken(config);

    // Get configured Google Ads account IDs from engine config
    const { data: accountConfigs } = await supabase
      .from('mkt_engine_config')
      .select('org_id, config_value')
      .eq('config_key', 'google_ads_accounts');

    if (!accountConfigs || accountConfigs.length === 0) {
      return { synced: 0, error: 'No Google Ads accounts configured' };
    }

    let totalSynced = 0;

    for (const accountConfig of accountConfigs) {
      const accounts = accountConfig.config_value as { customer_ids: string[] };
      if (!accounts?.customer_ids) continue;

      for (const customerId of accounts.customer_ids) {
        // Fetch campaign metrics for yesterday
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const campaignQuery = `
          SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
                 campaign_budget.amount_micros,
                 metrics.impressions, metrics.clicks, metrics.cost_micros,
                 metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.average_cpc
          FROM campaign
          WHERE segments.date = '${yesterday}'
          AND campaign.status != 'REMOVED'
        `;

        const campaignResults = await queryGoogleAds(
          accessToken,
          config.developerToken!,
          customerId,
          campaignQuery
        );

        for (const row of campaignResults) {
          const campaign = row.campaign;
          const budget = row.campaignBudget;
          const m = row.metrics;

          await supabase.from('mkt_google_ads_campaigns').upsert(
            {
              org_id: accountConfig.org_id,
              google_campaign_id: campaign.id,
              account_id: customerId,
              name: campaign.name,
              status: campaign.status,
              campaign_type: campaign.advertisingChannelType,
              budget_amount: budget?.amountMicros ? budget.amountMicros / 1_000_000 : null,
              impressions: m?.impressions || 0,
              clicks: m?.clicks || 0,
              cost: m?.costMicros ? m.costMicros / 1_000_000 : 0,
              conversions: m?.conversions || 0,
              conversion_value: m?.conversionsValue || 0,
              ctr: m?.ctr || 0,
              avg_cpc: m?.averageCpc ? m.averageCpc / 1_000_000 : 0,
              metrics_date: yesterday,
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: 'org_id,google_campaign_id' }
          );

          totalSynced++;
        }

        // Fetch keyword metrics
        const keywordQuery = `
          SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
                 ad_group_criterion.status, campaign.id,
                 metrics.impressions, metrics.clicks, metrics.cost_micros,
                 metrics.conversions, metrics.historical_quality_score
          FROM keyword_view
          WHERE segments.date = '${yesterday}'
          LIMIT 500
        `;

        const keywordResults = await queryGoogleAds(
          accessToken,
          config.developerToken!,
          customerId,
          keywordQuery
        );

        for (const row of keywordResults) {
          const kw = row.adGroupCriterion?.keyword;
          const m = row.metrics;
          const campaignId = row.campaign?.id;

          if (!kw?.text) continue;

          // Find the internal campaign ID
          const { data: internalCampaign } = await supabase
            .from('mkt_google_ads_campaigns')
            .select('id')
            .eq('google_campaign_id', campaignId)
            .eq('org_id', accountConfig.org_id)
            .single();

          await supabase.from('mkt_google_ads_keywords').insert({
            org_id: accountConfig.org_id,
            campaign_id: internalCampaign?.id || null,
            keyword: kw.text,
            match_type: kw.matchType,
            status: row.adGroupCriterion?.status,
            impressions: m?.impressions || 0,
            clicks: m?.clicks || 0,
            cost: m?.costMicros ? m.costMicros / 1_000_000 : 0,
            conversions: m?.conversions || 0,
            quality_score: m?.historicalQualityScore || null,
            metrics_date: yesterday,
            last_synced_at: new Date().toISOString(),
          });
        }
      }
    }

    return { synced: totalSynced, error: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logger.error('pull-failed', error);
    return { synced: 0, error: msg };
  }
}

/**
 * Push offline conversions to GA4 Measurement Protocol.
 * Sends conversion events for leads that have gclid or ga_client_id.
 */
async function pushOfflineConversions(
  supabase: ReturnType<typeof getSupabaseClient>,
  config: { measurementId: string | undefined; apiSecret: string | undefined },
  logger: ReturnType<typeof createEngineLogger>
): Promise<{ pushed: number; error: string | null }> {
  try {
    // Fetch unpushed conversions
    const { data: conversions, error } = await supabase
      .from('mkt_google_ads_feedback')
      .select('*')
      .eq('pushed_to_ga4', false)
      .not('ga_client_id', 'is', null)
      .limit(100);

    if (error) throw error;
    if (!conversions || conversions.length === 0) {
      return { pushed: 0, error: null };
    }

    let pushed = 0;

    for (const conversion of conversions) {
      try {
        const event = {
          client_id: conversion.ga_client_id,
          events: [
            {
              name: mapConversionType(conversion.conversion_type),
              params: {
                value: conversion.conversion_value || 0,
                currency: 'INR',
                transaction_id: conversion.id,
                gclid: conversion.gclid || undefined,
              },
            },
          ],
        };

        const response = await fetch(
          `https://www.google-analytics.com/mp/collect?measurement_id=${config.measurementId}&api_secret=${config.apiSecret}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
          }
        );

        if (response.ok || response.status === 204) {
          await supabase
            .from('mkt_google_ads_feedback')
            .update({
              pushed_to_ga4: true,
              pushed_at: new Date().toISOString(),
            })
            .eq('id', conversion.id);
          pushed++;
        } else {
          const errText = await response.text();
          await supabase
            .from('mkt_google_ads_feedback')
            .update({ push_error: `GA4 error ${response.status}: ${errText}` })
            .eq('id', conversion.id);
        }
      } catch (err) {
        await supabase
          .from('mkt_google_ads_feedback')
          .update({ push_error: err instanceof Error ? err.message : String(err) })
          .eq('id', conversion.id);
      }
    }

    return { pushed, error: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logger.error('push-failed', error);
    return { pushed: 0, error: msg };
  }
}

/**
 * Map internal conversion types to GA4 event names.
 */
function mapConversionType(type: string): string {
  const map: Record<string, string> = {
    lead_qualified: 'generate_lead',
    demo_booked: 'book_appointment',
    payment_received: 'purchase',
  };
  return map[type] || 'conversion';
}

/**
 * Get Google OAuth access token from refresh token.
 */
async function getGoogleAccessToken(config: {
  clientId: string | undefined;
  clientSecret: string | undefined;
  refreshToken: string | undefined;
}): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId!,
      client_secret: config.clientSecret!,
      refresh_token: config.refreshToken!,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google OAuth error: ${errText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Query Google Ads API using GAQL.
 */
async function queryGoogleAds(
  accessToken: string,
  developerToken: string,
  customerId: string,
  query: string
): Promise<Array<Record<string, unknown>>> {
  const cleanCustomerId = customerId.replace(/-/g, '');

  const response = await fetch(
    `https://googleads.googleapis.com/v16/customers/${cleanCustomerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Ads API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  // searchStream returns array of batches
  const results: Array<Record<string, unknown>> = [];
  for (const batch of data) {
    if (batch.results) {
      results.push(...batch.results);
    }
  }
  return results;
}
