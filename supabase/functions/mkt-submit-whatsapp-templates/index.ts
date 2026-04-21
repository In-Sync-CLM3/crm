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

function buildComponents(template: Record<string, any>): unknown[] {
  const components: unknown[] = [];

  if (template.header) {
    components.push({ type: 'HEADER', format: 'TEXT', text: template.header });
  }

  const bodyComponent: Record<string, unknown> = { type: 'BODY', text: template.body };
  // Only add example when the body actually contains {{N}} placeholders
  const bodyHasVars = /\{\{\d+\}\}/.test(template.body ?? '');
  if (bodyHasVars && template.variables?.length > 0) {
    const exampleMap: Record<string, string> = {
      first_name: 'Rahul', last_name: 'Sharma', company: 'Acme Corp', job_title: 'CFO',
    };
    const examples = template.variables.map((v: string) => exampleMap[v] ?? `Example ${v}`);
    bodyComponent.example = { body_text: [examples] };
  }
  components.push(bodyComponent);

  if (template.footer) components.push({ type: 'FOOTER', text: template.footer });
  if (Array.isArray(template.buttons) && template.buttons.length > 0) {
    components.push({ type: 'BUTTONS', buttons: template.buttons });
  }
  return components;
}

/** Try to fix a known submission error in-place and return the corrected template row.
 *  Updates the DB record so the fix persists. Returns null if unfixable. */
async function autoFixTemplate(
  supabase: ReturnType<typeof getSupabaseClient>,
  template: Record<string, any>,
): Promise<Record<string, any> | null> {
  const errMsg = (template.submission_error ?? '') as string;

  // Fix: "There is already English content for this template" — rename with versioned date suffix.
  // Meta permanently remembers ALL previously submitted names. Strip any existing date/version
  // suffix, then find the next unused version: base_YYMMDD, base_YYMMDD_v2, base_YYMMDD_v3, ...
  if (/already.*(english|content)/i.test(errMsg) || /content.*already/i.test(errMsg)) {
    // Strip trailing _vN and _YYMMDD (6+ digit) suffixes to get the canonical base name
    const base = template.template_name
      .replace(/_v\d+$/, '')
      .replace(/_\d{6,}$/, '');
    const dateSuffix = new Date().toISOString().slice(2, 10).replace(/-/g, '');  // e.g. "260421"

    // Find all sibling template names in the DB that share this base + date prefix
    const { data: siblings } = await supabase
      .from('mkt_whatsapp_templates')
      .select('template_name')
      .like('template_name', `${base}_${dateSuffix}%`);

    const existingNames = new Set((siblings ?? []).map((r: any) => r.template_name as string));

    // Pick the lowest unused version: base_date, base_date_v2, base_date_v3, ...
    let newName = `${base}_${dateSuffix}`;
    let v = 2;
    while (existingNames.has(newName)) {
      newName = `${base}_${dateSuffix}_v${v}`;
      v++;
    }

    await supabase.from('mkt_whatsapp_templates')
      .update({ template_name: newName, submission_error: null })
      .eq('id', template.id);
    return { ...template, template_name: newName };
  }

  // Fix: "Variables can't be at the start or end of the template"
  // Meta requires fixed text at the beginning and end of a template body.
  if (/variables.*start.*end|start.*end.*variable/i.test(errMsg)) {
    let body: string = template.body ?? '';

    // If body starts with a variable placeholder like "{{1}}," → prepend "Hi "
    if (/^\{\{\d+\}\}/.test(body)) {
      body = `Hi ${body}`;
    }

    // If body ends with a variable (possibly followed by ?, ., !) → append fixed text
    if (/\{\{\d+\}\}[?!.]?\s*$/.test(body)) {
      // Remove trailing var + punctuation, then append a fixed CTA
      body = body.replace(/,?\s*\{\{\d+\}\}[?!.]?\s*$/, '. Would you like to know more?');
    }

    if (body !== template.body) {
      // If all variables were removed from the body, clear the variables array too
      const stillHasVars = /\{\{\d+\}\}/.test(body);
      const updatedVars = stillHasVars ? template.variables : [];
      await supabase.from('mkt_whatsapp_templates')
        .update({ body, variables: updatedVars, submission_error: null })
        .eq('id', template.id);
      return { ...template, body, variables: updatedVars };
    }
    return null; // Can't fix automatically
  }

  // Fix: "The category X doesn't match the one that's already associated with this template, Y"
  const catMatch = errMsg.match(/already associated with this template[,\s]+(\w+)/i);
  if (catMatch) {
    const corrected = catMatch[1].toLowerCase();
    await supabase.from('mkt_whatsapp_templates')
      .update({ category: corrected, submission_error: null })
      .eq('id', template.id);
    return { ...template, category: corrected };
  }

  return null;
}

async function submitTemplate(settings: Record<string, any>, template: Record<string, any>) {
  // waba_id is a query param; body is wrapped in whatsapp.templates array
  const url = `https://${settings.subdomain}/v2/accounts/${settings.account_sid}/templates?waba_id=${settings.waba_id}`;
  const basicAuth = btoa(`${settings.api_key}:${settings.api_token}`);

  const templatePayload = {
    name: template.template_name,
    category: template.category.toUpperCase(),
    language: template.language,            // keep as-is ('en'), Exotel does not need 'en_US'
    components: buildComponents(template),
    allow_category_change: true,
  };

  const body = {
    whatsapp: {
      templates: [{ template: templatePayload }],
    },
  };

  console.log(`[submit-templates] Submitting: ${template.template_name}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let result: Record<string, any> = {};
  try { result = JSON.parse(text); } catch {
    return { success: false, error: `Non-JSON (${response.status}): ${text.substring(0, 300)}` };
  }

  const tplResponse = result?.response?.whatsapp?.templates?.[0];
  const errorData   = tplResponse?.error_data;

  if (errorData) {
    const errMsg = errorData?.description || errorData?.message || JSON.stringify(errorData);
    return { success: false, error: errMsg };
  }

  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}: ${JSON.stringify(result).substring(0, 300)}` };
  }

  const externalId = tplResponse?.data?.id || undefined;
  return { success: true, external_template_id: externalId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getSupabaseClient();

    let orgId: string | undefined;
    let templateIds: string[] | undefined;
    let dryRun = false;
    try {
      const b = await req.json();
      orgId = b.org_id;
      templateIds = b.template_ids;
      dryRun = b.dry_run === true;
    } catch { /* no body */ }

    let settingsQuery = supabase
      .from('exotel_settings')
      .select('api_key, api_token, subdomain, account_sid, waba_id, org_id')
      .eq('is_active', true)
      .eq('whatsapp_enabled', true);
    if (orgId) settingsQuery = settingsQuery.eq('org_id', orgId);

    const { data: allSettings, error: settingsError } = await settingsQuery;
    if (settingsError) throw new Error(`Failed to load Exotel settings: ${settingsError.message}`);
    if (!allSettings?.length) throw new Error('No active WhatsApp-enabled Exotel settings found');

    const settingsMap = new Map((allSettings as any[]).map(s => [s.org_id, s]));

    // Only fetch templates for orgs that have WhatsApp settings — avoids cycling through "no settings" skips
    const eligibleOrgIds = [...settingsMap.keys()];

    let tplQuery = supabase
      .from('mkt_whatsapp_templates')
      .select('id, org_id, name, template_name, language, body, header, footer, buttons, variables, category, submission_error')
      .eq('approval_status', 'pending')
      .eq('is_active', true)
      .in('org_id', eligibleOrgIds);
    if (orgId) tplQuery = tplQuery.eq('org_id', orgId);
    if (templateIds?.length) tplQuery = tplQuery.in('id', templateIds);

    // Process in batches of 10 — each invocation handles one batch then chains the next
    const BATCH_SIZE = 10;
    tplQuery = tplQuery.limit(BATCH_SIZE);

    const { data: templates, error: tplError } = await tplQuery;
    if (tplError) throw new Error(`Failed to fetch templates: ${tplError.message}`);
    if (!templates?.length) return jsonResponse({ message: 'No pending templates to submit', submitted: 0, failed: 0 });

    console.log(`[submit-templates] Processing batch of ${templates.length}, dry_run=${dryRun}`);

    const results: any[] = [];

    for (const template of templates as any[]) {
      const settings = settingsMap.get(template.org_id);
      if (!settings) {
        results.push({ id: template.id, template_name: template.template_name, status: 'skipped', error: 'No Exotel settings for org' });
        continue;
      }
      if (dryRun) {
        results.push({ id: template.id, template_name: template.template_name, status: 'submitted' });
        continue;
      }

      // If this template previously failed with a known fixable error, auto-fix before submitting
      let effectiveTemplate = template;
      if (template.submission_error) {
        const fixed = await autoFixTemplate(supabase, template);
        if (fixed) {
          effectiveTemplate = fixed;
          console.log(`[submit-templates] Auto-fixed ${template.template_name} → ${fixed.template_name ?? fixed.category}`);
        }
      }

      const { success, external_template_id, error } = await submitTemplate(settings, effectiveTemplate);

      if (success) {
        await supabase.from('mkt_whatsapp_templates').update({
          approval_status: 'submitted',
          external_template_id: external_template_id ?? null,
          submitted_at: new Date().toISOString(),
          submission_error: null,
        }).eq('id', template.id);
        results.push({ id: template.id, template_name: effectiveTemplate.template_name, status: 'submitted', external_template_id });
      } else {
        await supabase.from('mkt_whatsapp_templates').update({
          submission_error: error ?? 'Unknown error',
        }).eq('id', template.id);
        results.push({ id: template.id, template_name: effectiveTemplate.template_name, status: 'failed', error });
        console.error(`[submit-templates] Failed: ${effectiveTemplate.template_name} — ${error}`);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    const submitted = results.filter(r => r.status === 'submitted').length;
    const failed    = results.filter(r => r.status === 'failed').length;
    const skipped   = results.filter(r => r.status === 'skipped').length;

    // Always chain next invocation after a non-dry-run batch — next call exits cleanly if nothing remains
    if (!dryRun && templates.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const nextUrl = `${supabaseUrl}/functions/v1/mkt-submit-whatsapp-templates`;
      fetch(nextUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ org_id: orgId }),
      }).catch(e => console.error('[submit-templates] Chain failed:', e));
      console.log('[submit-templates] Chained next batch');
    }

    return jsonResponse({ submitted, failed, skipped, dry_run: dryRun, results, more: templates.length === BATCH_SIZE });
  } catch (error) {
    console.error('[submit-templates] Fatal:', error);
    return errorResponse(error);
  }
});
