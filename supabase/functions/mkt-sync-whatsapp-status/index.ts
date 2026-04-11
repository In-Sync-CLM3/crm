import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function errorResponse(error: unknown, status = 500): Response {
  const message = error instanceof Error ? error.message : String(error);
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// Map Exotel/Meta status strings → our approval_status values
function mapStatus(exotelStatus: string): string {
  const s = (exotelStatus || '').toUpperCase();
  if (s === 'APPROVED') return 'approved';
  if (s === 'REJECTED' || s === 'DISABLED') return 'rejected';
  // PENDING / IN_APPEAL / PAUSED / etc → submitted (it's at Meta, just not approved yet)
  return 'submitted';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getSupabaseClient();

    let orgId: string | undefined;
    try { orgId = (await req.json()).org_id; } catch { /* no body */ }

    // Load Exotel settings
    let settingsQuery = supabase
      .from('exotel_settings')
      .select('api_key, api_token, subdomain, account_sid, waba_id, org_id')
      .eq('is_active', true)
      .eq('whatsapp_enabled', true);
    if (orgId) settingsQuery = settingsQuery.eq('org_id', orgId);

    const { data: allSettings, error: settingsError } = await settingsQuery;
    if (settingsError) throw new Error(`Failed to load Exotel settings: ${settingsError.message}`);
    if (!allSettings?.length) throw new Error('No active WhatsApp-enabled Exotel settings found');

    let totalSynced = 0;
    let totalApproved = 0;
    let totalRejected = 0;
    const orgResults: Record<string, unknown>[] = [];

    for (const settings of allSettings as any[]) {
      const currentOrgId = settings.org_id;
      const basicAuth = btoa(`${settings.api_key}:${settings.api_token}`);
      const url = `https://${settings.subdomain}/v2/accounts/${settings.account_sid}/templates?waba_id=${settings.waba_id}&limit=200`;

      console.log(`[sync-whatsapp-status] Fetching templates for org ${currentOrgId}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${basicAuth}` },
      });

      const text = await response.text();
      let result: Record<string, any> = {};
      try { result = JSON.parse(text); } catch {
        orgResults.push({ org_id: currentOrgId, error: `Non-JSON (${response.status}): ${text.substring(0, 200)}` });
        continue;
      }

      if (!response.ok) {
        orgResults.push({ org_id: currentOrgId, error: `HTTP ${response.status}: ${JSON.stringify(result).substring(0, 200)}` });
        continue;
      }

      // Response: { response: { whatsapp: { templates: [ { data: { name, status, id, ... } }, ... ] } } }
      const templates: any[] = result?.response?.whatsapp?.templates || [];
      console.log(`[sync-whatsapp-status] Got ${templates.length} templates from Exotel for org ${currentOrgId}`);

      let synced = 0;
      let approved = 0;
      let rejected = 0;

      for (const wrapper of templates) {
        const tpl = wrapper?.data;
        if (!tpl?.name) continue;

        const newStatus = mapStatus(tpl.status);
        const externalId = tpl.id ? String(tpl.id) : undefined;

        // Match by template_name within this org
        const updatePayload: Record<string, unknown> = {
          approval_status: newStatus,
          submission_error: null,
        };
        if (externalId) updatePayload.external_template_id = externalId;
        if (newStatus === 'submitted' && !updatePayload.submitted_at) {
          // Don't overwrite submitted_at if already set
        }
        if (tpl.rejected_reason && tpl.rejected_reason !== 'NONE') {
          updatePayload.submission_error = tpl.rejected_reason;
        }

        const { error: updateError } = await supabase
          .from('mkt_whatsapp_templates')
          .update(updatePayload)
          .eq('org_id', currentOrgId)
          .eq('template_name', tpl.name);

        if (!updateError) {
          synced++;
          if (newStatus === 'approved') approved++;
          if (newStatus === 'rejected') rejected++;
        } else {
          console.error(`[sync-whatsapp-status] Update failed for ${tpl.name}:`, updateError.message);
        }
      }

      totalSynced += synced;
      totalApproved += approved;
      totalRejected += rejected;
      orgResults.push({ org_id: currentOrgId, synced, approved, rejected, total_from_exotel: templates.length });
    }

    console.log(`[sync-whatsapp-status] Done. synced=${totalSynced} approved=${totalApproved} rejected=${totalRejected}`);

    // -------------------------------------------------------------------------
    // Auto-regenerate: for each org, find products where ALL current templates
    // are rejected (nothing pending/submitted/approved). Trigger reset_step so
    // new versioned templates are generated and submitted automatically.
    // Cap at 3 auto-retries per product (3 rounds × 4 templates = 12 rejected).
    // -------------------------------------------------------------------------
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const autoRegenResults: Record<string, unknown>[] = [];

    for (const settings of allSettings as any[]) {
      const currentOrgId = settings.org_id;

      // Load all active WA templates for this org
      const { data: allTpls } = await supabase
        .from('mkt_whatsapp_templates')
        .select('name, approval_status')
        .eq('org_id', currentOrgId)
        .eq('is_active', true);

      if (!allTpls?.length) continue;

      // Group statuses by product_key (name pattern: "<product_key>-wa-...")
      const byProduct = new Map<string, string[]>();
      for (const tpl of allTpls as any[]) {
        const match = (tpl.name as string).match(/^(.+?)-wa-/);
        if (!match) continue;
        const pk = match[1];
        if (!byProduct.has(pk)) byProduct.set(pk, []);
        byProduct.get(pk)!.push(tpl.approval_status);
      }

      for (const [productKey, statuses] of byProduct) {
        const allRejected = statuses.length > 0 && statuses.every((s) => s === 'rejected');
        if (!allRejected) continue;

        // Count total rejected templates for this product (each round = 4 templates)
        const { count: rejectedCount } = await supabase
          .from('mkt_whatsapp_templates')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', currentOrgId)
          .ilike('name', `${productKey}-wa-%`)
          .eq('approval_status', 'rejected');

        if ((rejectedCount ?? 0) >= 12) {
          // 3 rounds of 4 templates all rejected — stop auto-retrying
          console.log(`[sync] Max auto-retries reached for ${productKey}, stopping`);
          autoRegenResults.push({ product_key: productKey, action: 'max_retries_reached' });
          continue;
        }

        // Trigger reset_step → new versioned templates generated + submitted automatically
        console.log(`[sync] All WA templates rejected for ${productKey}, auto-regenerating`);
        const res = await fetch(`${supabaseUrl}/functions/v1/mkt-product-manager`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'reset_step',
            org_id: currentOrgId,
            product_key: productKey,
            step_name: 'whatsapp_templates',
          }),
        });
        autoRegenResults.push({
          product_key: productKey,
          action: 'regenerated',
          ok: res.ok,
        });
      }
    }

    return jsonResponse({
      synced: totalSynced, approved: totalApproved, rejected: totalRejected,
      orgs: orgResults,
      auto_regen: autoRegenResults,
    });
  } catch (error) {
    console.error('[sync-whatsapp-status] Fatal:', error);
    return errorResponse(error);
  }
});
