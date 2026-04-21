import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

/**
 * mkt-ga4-sync
 * Pulls landing page traffic from GA4 Data API filtered by utm_source=insync_engine.
 * Supports multiple GA4 properties — one per product via mkt_products.ga4_property_id.
 * Maps hostnames to product_keys via mkt_products (SoT).
 * Upserts into mkt_ga4_traffic for campaign analytics reporting.
 * Cron: daily at 4 AM UTC.
 */
Deno.serve(async (req) => {
  const logger = createEngineLogger('mkt-ga4-sync');

  try {
    const supabase = getSupabaseClient();

    // -------------------------------------------------------------------------
    // 1. Get fresh access token (shared across all GA4 properties)
    // -------------------------------------------------------------------------
    const refreshToken = Deno.env.get('GA4_REFRESH_TOKEN');
    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!refreshToken || !clientId || !clientSecret) {
      throw new Error('Missing GA4_REFRESH_TOKEN, GOOGLE_CLIENT_ID, or GOOGLE_CLIENT_SECRET');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(tokenData)}`);
    const accessToken = tokenData.access_token as string;

    // -------------------------------------------------------------------------
    // 2. Load products that have a GA4 property configured
    //    Group by property_id so each unique property gets one API call.
    // -------------------------------------------------------------------------
    const { data: products, error: productsError } = await supabase
      .from('mkt_products')
      .select('org_id, product_key, product_url, ga4_property_id')
      .not('ga4_property_id', 'is', null);

    if (productsError) throw new Error(`Failed to load products: ${productsError.message}`);
    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: 'No products have ga4_property_id configured' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Group products by ga4_property_id
    const byProperty = new Map<string, Array<typeof products[0]>>();
    for (const p of products) {
      const pid = p.ga4_property_id as string;
      if (!byProperty.has(pid)) byProperty.set(pid, []);
      byProperty.get(pid)!.push(p);
    }

    // -------------------------------------------------------------------------
    // 3. For each GA4 property: query API and collect upsert rows
    // -------------------------------------------------------------------------
    const allUpsertRows: Record<string, unknown>[] = [];
    const summary: Record<string, number> = {};
    // action_id → { date, org_id } for real-click write-back
    const actionClickMap = new Map<string, { date: string; org_id: string }>();

    for (const [propertyId, propertyProducts] of byProperty) {
      // Build hostname → product map for this property's products
      const hostnameMap = new Map<string, { org_id: string; product_key: string }>();
      for (const p of propertyProducts) {
        if (!p.product_url) continue;
        try {
          const hostname = new URL(p.product_url as string).hostname;
          if (!hostnameMap.has(hostname)) {
            hostnameMap.set(hostname, { org_id: p.org_id as string, product_key: p.product_key as string });
          }
        } catch { /* ignore invalid URLs */ }
      }

      const ga4Res = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
            dimensions: [
              { name: 'date' },                    // YYYYMMDD
              { name: 'sessionCampaignName' },      // utm_campaign
              { name: 'sessionMedium' },            // utm_medium
              { name: 'sessionSource' },            // utm_source
              { name: 'hostName' },                 // landing page domain
              { name: 'sessionManualAdContent' },   // utm_content = action_id
            ],
            metrics: [
              { name: 'sessions' },
              { name: 'activeUsers' },
              { name: 'engagedSessions' },
            ],
            dimensionFilter: {
              filter: {
                fieldName: 'sessionSource',
                stringFilter: { matchType: 'EXACT', value: 'insync_engine' },
              },
            },
            limit: 10000,
          }),
        }
      );

      const ga4Data = await ga4Res.json();
      if (ga4Data.error) {
        await logger.warn('ga4-property-error', { property_id: propertyId, error: ga4Data.error });
        continue; // skip this property, try others
      }

      const rows = ga4Data.rows || [];
      await logger.info('ga4-rows-fetched', { property_id: propertyId, count: rows.length });

      // Aggregate by traffic key (product/hostname/campaign/medium/date).
      // sessionManualAdContent (utm_content = action_id) expands rows — we must re-aggregate
      // for the traffic table, but collect action_ids separately for clicked_at writes.
      const trafficAgg = new Map<string, {
        org_id: string; product_key: string; hostname: string;
        campaign_slug: string | null; medium: string | null; date: string;
        sessions: number; active_users: number; engaged_sessions: number;
      }>();

      for (const row of rows) {
        const [dateVal, campaignSlug, medium, , hostname, adContent] = row.dimensionValues.map(
          (d: { value: string }) => d.value
        );
        const [sessions, activeUsers, engagedSessions] = row.metricValues.map(
          (m: { value: string }) => parseInt(m.value, 10)
        );

        const product = hostnameMap.get(hostname);
        if (!product) continue;

        const date = `${dateVal.slice(0, 4)}-${dateVal.slice(4, 6)}-${dateVal.slice(6, 8)}`;
        const slug  = campaignSlug === '(not set)' ? null : campaignSlug;
        const med   = medium       === '(not set)' ? null : medium;

        // ── Traffic aggregation ──────────────────────────────────────────────
        const trafficKey = `${product.product_key}|${hostname}|${slug}|${med}|${date}`;
        const existing   = trafficAgg.get(trafficKey);
        if (existing) {
          existing.sessions         += sessions;
          existing.active_users     += activeUsers;
          existing.engaged_sessions += engagedSessions;
        } else {
          trafficAgg.set(trafficKey, {
            org_id: product.org_id, product_key: product.product_key,
            hostname, campaign_slug: slug, medium: med, date,
            sessions, active_users: activeUsers, engaged_sessions: engagedSessions,
          });
        }

        // ── Action-level click attribution ───────────────────────────────────
        // utm_content carries the action_id — a real browser visit confirmed.
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adContent ?? '');
        if (isUuid) {
          actionClickMap.set(adContent, { date, org_id: product.org_id });
        }
      }

      const synced = trafficAgg.size;
      for (const r of trafficAgg.values()) {
        allUpsertRows.push({ ...r, synced_at: new Date().toISOString() });
      }
      summary[propertyId] = synced;
    }

    // -------------------------------------------------------------------------
    // 4. Batch upsert all rows
    // -------------------------------------------------------------------------
    if (allUpsertRows.length > 0) {
      const { error } = await supabase
        .from('mkt_ga4_traffic')
        .upsert(allUpsertRows, { onConflict: 'product_key,hostname,campaign_slug,medium,date' });

      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }

    // -------------------------------------------------------------------------
    // 5. Write real clicks back to mkt_sequence_actions
    //    utm_content = action_id → confirmed real browser visit (GA4 requires JS).
    //    This replaces the bot-polluted Resend email.clicked webhook as the source
    //    of clicked_at. Also updates engagement score and A/B test metrics.
    // -------------------------------------------------------------------------
    let clicksWritten = 0;
    if (actionClickMap.size > 0) {
      for (const [actionId, { date }] of actionClickMap) {
        // First touch only — don't overwrite an existing real click
        const { data: updated } = await supabase
          .from('mkt_sequence_actions')
          .update({ clicked_at: `${date}T12:00:00Z` })
          .eq('id', actionId)
          .is('clicked_at', null)
          .select('id, enrollment_id, step_id, variant, org_id')
          .single();

        if (updated) {
          clicksWritten++;

          // Engagement score: real click = 5 pts
          await supabase.rpc('increment_engagement_score', {
            p_action_id:   actionId,
            p_event_type:  'email_click',
            p_score_delta: 5,
          }).catch(() => {});

          // A/B test metrics: count this as a real click for the variant
          if (updated.step_id && updated.variant) {
            const { data: step } = await supabase
              .from('mkt_campaign_steps')
              .select('ab_test_id')
              .eq('id', updated.step_id)
              .single();
            if (step?.ab_test_id) {
              const { data: abResult } = await supabase
                .from('mkt_ab_test_results')
                .select('clicks')
                .eq('ab_test_id', step.ab_test_id)
                .eq('variant', updated.variant)
                .single();
              if (abResult != null) {
                await supabase
                  .from('mkt_ab_test_results')
                  .update({ clicks: (abResult.clicks ?? 0) + 1 })
                  .eq('ab_test_id', step.ab_test_id)
                  .eq('variant', updated.variant);
              }
            }
          }
        }
      }
    }

    await logger.info('ga4-sync-complete', {
      synced: allUpsertRows.length,
      real_clicks_written: clicksWritten,
      by_property: summary,
    });

    return new Response(
      JSON.stringify({ success: true, synced: allUpsertRows.length, by_property: summary }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('ga4-sync-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
