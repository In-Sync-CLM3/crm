import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

/**
 * mkt-ga4-sync
 * Pulls landing page traffic from GA4 Data API filtered by utm_source=insync_engine.
 * Maps hostnames to product_keys via mkt_products (SoT).
 * Upserts into mkt_ga4_traffic for campaign analytics reporting.
 * Cron: daily at 4 AM UTC.
 */
Deno.serve(async (req) => {
  const logger = createEngineLogger('mkt-ga4-sync');

  try {
    const supabase = getSupabaseClient();

    // -------------------------------------------------------------------------
    // 1. Get fresh access token using stored refresh token
    // -------------------------------------------------------------------------
    const refreshToken = Deno.env.get('GA4_REFRESH_TOKEN');
    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const propertyId   = Deno.env.get('GA4_PROPERTY_ID') || '533494217';

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
    // 2. Build hostname → product_key map from mkt_products (SoT)
    // -------------------------------------------------------------------------
    const { data: products } = await supabase
      .from('mkt_products')
      .select('org_id, product_key, product_url, payment_url');

    const hostnameMap = new Map<string, { org_id: string; product_key: string }>();
    for (const p of products || []) {
      for (const rawUrl of [p.product_url, p.payment_url]) {
        if (!rawUrl) continue;
        try {
          const hostname = new URL(rawUrl).hostname;
          if (!hostnameMap.has(hostname)) {
            hostnameMap.set(hostname, { org_id: p.org_id, product_key: p.product_key });
          }
        } catch { /* ignore invalid URLs */ }
      }
    }

    // -------------------------------------------------------------------------
    // 3. Query GA4 — last 7 days, all sources (we filter insync_engine + show all
    //    for context; store only insync_engine rows in mkt_ga4_traffic)
    // -------------------------------------------------------------------------
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
            { name: 'date' },               // YYYYMMDD
            { name: 'sessionCampaignName' }, // utm_campaign
            { name: 'sessionMedium' },       // utm_medium
            { name: 'sessionSource' },       // utm_source
            { name: 'hostName' },            // landing page domain
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
    if (ga4Data.error) throw new Error(`GA4 API error: ${JSON.stringify(ga4Data.error)}`);

    const rows = ga4Data.rows || [];
    await logger.info('ga4-rows-fetched', { count: rows.length });

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: 'No insync_engine traffic in last 7 days yet' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------------------
    // 4. Upsert into mkt_ga4_traffic
    // -------------------------------------------------------------------------
    const upsertRows: Record<string, unknown>[] = [];

    for (const row of rows) {
      const [dateVal, campaignSlug, medium, , hostname] = row.dimensionValues.map(
        (d: { value: string }) => d.value
      );
      const [sessions, activeUsers, engagedSessions] = row.metricValues.map(
        (m: { value: string }) => parseInt(m.value, 10)
      );

      // Map hostname to product
      const product = hostnameMap.get(hostname);
      if (!product) continue; // hostname not registered in mkt_products — skip

      // Parse GA4 date YYYYMMDD → YYYY-MM-DD
      const date = `${dateVal.slice(0, 4)}-${dateVal.slice(4, 6)}-${dateVal.slice(6, 8)}`;

      upsertRows.push({
        org_id:           product.org_id,
        product_key:      product.product_key,
        hostname,
        campaign_slug:    campaignSlug === '(not set)' ? null : campaignSlug,
        medium:           medium === '(not set)' ? null : medium,
        date,
        sessions,
        active_users:     activeUsers,
        engaged_sessions: engagedSessions,
        synced_at:        new Date().toISOString(),
      });
    }

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from('mkt_ga4_traffic')
        .upsert(upsertRows, { onConflict: 'product_key,hostname,campaign_slug,medium,date' });

      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }

    await logger.info('ga4-sync-complete', { synced: upsertRows.length });

    return new Response(
      JSON.stringify({ success: true, synced: upsertRows.length }),
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
