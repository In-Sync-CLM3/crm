import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLMJson } from '../_shared/llmClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardBody {
  mode: 'onboard';
  org_id: string;
  product_name: string;
  product_url: string;
  supabase_url: string;
  supabase_service_role_key: string;
}

interface ToggleBody {
  mode: 'toggle';
  product_id: string;
  active: boolean;
}

interface SyncBody {
  mode: 'sync';
  org_id: string;
}

type RequestBody = OnboardBody | ToggleBody | SyncBody;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "Vendor Verification" -> "vendor-verification" */
function deriveProductKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** "Vendor Verification" -> "VV" */
function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/** Create a Supabase client for an external product database */
function createProductClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Read the service role key for a product from env vars */
function getProductServiceKey(productName: string): string | undefined {
  const initials = deriveInitials(productName);
  return Deno.env.get(`${initials}_SUPABASE_SERVICE_KEY`);
}

// ---------------------------------------------------------------------------
// ONBOARD
// ---------------------------------------------------------------------------

async function handleOnboard(
  supabase: SupabaseClient,
  body: OnboardBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { org_id, product_name, product_url, supabase_url, supabase_service_role_key } = body;
  const productKey = deriveProductKey(product_name);
  const initials = deriveInitials(product_name);
  const secretUrlName = `${initials}_SUPABASE_URL`;
  const secretKeyName = `${initials}_SUPABASE_SERVICE_KEY`;
  const logLines: string[] = [];

  const log = (msg: string) => {
    logLines.push(`[${new Date().toISOString()}] ${msg}`);
  };

  log(`Starting onboard for "${product_name}" (key: ${productKey})`);

  // 1. Insert product row (onboarding_status = in_progress)
  const { data: product, error: insertErr } = await supabase
    .from('mkt_products')
    .upsert(
      {
        org_id,
        product_key: productKey,
        product_name,
        supabase_url,
        supabase_secret_name: secretKeyName,
        onboarding_status: 'in_progress',
        active: false,
      },
      { onConflict: 'org_id,product_key' },
    )
    .select('id')
    .single();

  if (insertErr) throw new Error(`Failed to upsert mkt_products: ${insertErr.message}`);
  const productId = product.id;
  log(`Product row created/updated: ${productId}`);

  // 2. Log secret names — user must set these as Supabase secrets
  log(`ACTION REQUIRED: Set the following Supabase secrets:`);
  log(`  supabase secrets set ${secretUrlName}=${supabase_url}`);
  log(`  supabase secrets set ${secretKeyName}=<your-service-role-key>`);
  await logger.info('onboard-secrets-needed', {
    product_key: productKey,
    secret_url_name: secretUrlName,
    secret_key_name: secretKeyName,
  });

  // 3. Connect to product's Supabase and inspect schema
  const productClient = createProductClient(supabase_url, supabase_service_role_key);
  const schemaMap: Record<string, string> = {};

  // Look for registrations/users table
  for (const tableName of ['users', 'profiles', 'registrations', 'accounts', 'customers']) {
    const { error } = await productClient.from(tableName).select('*').limit(1);
    if (!error) {
      schemaMap.registrations_table = tableName;
      log(`Found registrations table: ${tableName}`);
      break;
    }
  }

  // Look for payments/subscriptions table
  for (const tableName of ['payments', 'subscriptions', 'orders', 'invoices', 'billing']) {
    const { error } = await productClient.from(tableName).select('*').limit(1);
    if (!error) {
      schemaMap.payments_table = tableName;
      log(`Found payments table: ${tableName}`);
      break;
    }
  }

  // Look for plans/pricing table
  for (const tableName of ['plans', 'pricing', 'products', 'tiers', 'packages']) {
    const { error } = await productClient.from(tableName).select('*').limit(1);
    if (!error) {
      schemaMap.pricing_table = tableName;
      log(`Found pricing table: ${tableName}`);
      break;
    }
  }

  // Look for activity/events table
  for (const tableName of ['events', 'activities', 'activity_log', 'audit_log', 'usage']) {
    const { error } = await productClient.from(tableName).select('*').limit(1);
    if (!error) {
      schemaMap.events_table = tableName;
      log(`Found events table: ${tableName}`);
      break;
    }
  }

  if (Object.keys(schemaMap).length === 0) {
    log('WARNING: No recognisable tables found. Schema map is empty.');
  }

  // 4. Read existing data to infer ICP
  let icpHints: Record<string, unknown> = {};
  if (schemaMap.registrations_table) {
    const { data: sampleUsers } = await productClient
      .from(schemaMap.registrations_table)
      .select('*')
      .limit(50);

    if (sampleUsers && sampleUsers.length > 0) {
      // Try to detect common fields for ICP inference
      const fields = Object.keys(sampleUsers[0]);
      const industryField = fields.find((f) => /industry|sector|vertical/i.test(f));
      const sizeField = fields.find((f) => /size|employees|company_size/i.test(f));
      const designationField = fields.find((f) => /designation|role|title|position/i.test(f));

      if (industryField) {
        const industries = sampleUsers
          .map((u: Record<string, unknown>) => u[industryField])
          .filter(Boolean);
        const freq: Record<string, number> = {};
        industries.forEach((i: unknown) => {
          const key = String(i);
          freq[key] = (freq[key] || 0) + 1;
        });
        icpHints.industries = freq;
      }
      if (sizeField) {
        const sizes = sampleUsers
          .map((u: Record<string, unknown>) => u[sizeField])
          .filter(Boolean);
        icpHints.company_sizes = sizes;
      }
      if (designationField) {
        const titles = sampleUsers
          .map((u: Record<string, unknown>) => u[designationField])
          .filter(Boolean);
        const freq: Record<string, number> = {};
        titles.forEach((t: unknown) => {
          const key = String(t);
          freq[key] = (freq[key] || 0) + 1;
        });
        icpHints.designations = freq;
      }

      icpHints.sample_size = sampleUsers.length;
      log(`ICP data sampled from ${sampleUsers.length} records`);
    }
  }

  // 5. Calculate trial_days
  // Default: 14 for single-action products, 21 for workflow products
  // If we had aha data: MAX(14, MIN(30, median_aha_days * 2.5))
  let trialDays = 14;
  if (schemaMap.events_table) {
    // Assume it's a workflow product if it has an events table
    trialDays = 21;
  }
  log(`Trial days set to ${trialDays}`);

  // Update product with schema_map and trial_days
  await supabase
    .from('mkt_products')
    .update({
      schema_map: schemaMap,
      trial_days: trialDays,
    })
    .eq('id', productId);

  // 6. Generate content via Claude Sonnet (5 emails at a time)
  log('Generating email templates...');
  const emailCategories = [
    { category: 'nurture', description: 'nurture sequence emails for leads who showed interest but haven\'t converted' },
    { category: 'closing', description: 'closing emails to push trial users toward purchase' },
    { category: 'onboarding', description: 'onboarding emails for new trial signups to help them get value' },
    { category: 'cold', description: 'cold outbound emails to new prospects who haven\'t heard of the product' },
    { category: 'reactivation', description: 'reactivation emails for churned or dormant users' },
  ];

  const allEmails: Array<{
    name: string;
    subject: string;
    body_html: string;
    body_text: string;
    category: string;
  }> = [];

  for (const cat of emailCategories) {
    try {
      const { data: emails } = await callLLMJson<
        Array<{ name: string; subject: string; body_html: string; body_text: string }>
      >(
        `Generate 5 ${cat.description} for a B2B SaaS product called "${product_name}" (${product_url}).
${Object.keys(icpHints).length > 0 ? `ICP hints: ${JSON.stringify(icpHints)}` : 'No ICP data available yet.'}

Each email should have:
- name: a short identifier like "${productKey}-${cat.category}-1"
- subject: compelling subject line
- body_html: full HTML email body (keep it professional, under 300 words)
- body_text: plain text version

Return a JSON array of 5 email objects.`,
        { model: 'sonnet', max_tokens: 4096, temperature: 0.5 },
      );

      if (Array.isArray(emails)) {
        emails.forEach((e) => allEmails.push({ ...e, category: cat.category }));
      }
    } catch (err) {
      log(`WARNING: Failed to generate ${cat.category} emails: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  log(`Generated ${allEmails.length} email templates`);

  // 7. Generate WhatsApp templates
  log('Generating WhatsApp templates...');
  let waTemplates: Array<{
    name: string;
    template_name: string;
    body: string;
    category: string;
  }> = [];
  try {
    const { data } = await callLLMJson<
      Array<{ name: string; template_name: string; body: string; category: string }>
    >(
      `Generate 4 WhatsApp message templates for a B2B SaaS product called "${product_name}" (${product_url}).
Types needed: 1 welcome/intro, 1 trial reminder, 1 feature highlight, 1 reactivation.

Each template should have:
- name: human-readable name like "${productKey}-wa-welcome"
- template_name: Exotel-compatible template name (lowercase, underscores, e.g. "${productKey.replace(/-/g, '_')}_welcome")
- body: WhatsApp message body (max 1024 chars, can use {{1}}, {{2}} for variables)
- category: "marketing" or "utility"

Return a JSON array of 4 template objects.`,
      { model: 'sonnet', max_tokens: 2048, temperature: 0.5 },
    );
    if (Array.isArray(data)) waTemplates = data;
  } catch (err) {
    log(`WARNING: Failed to generate WhatsApp templates: ${err instanceof Error ? err.message : String(err)}`);
  }
  log(`Generated ${waTemplates.length} WhatsApp templates`);

  // 8. Generate call scripts
  log('Generating call scripts...');
  let callScripts: Array<{
    name: string;
    call_type: string;
    objective: string;
    opening: string;
    key_points: string[];
    objection_handling: Record<string, string>;
    closing: string;
  }> = [];
  try {
    const { data } = await callLLMJson<typeof callScripts>(
      `Generate 4 phone call scripts for a B2B SaaS product called "${product_name}" (${product_url}).
Types needed: 1 intro/discovery, 1 follow-up, 1 demo, 1 closing.

Each script should have:
- name: e.g. "${productKey}-call-intro"
- call_type: "intro" | "follow_up" | "demo" | "closing"
- objective: what the call aims to achieve (1 sentence)
- opening: how to start the call (2-3 sentences)
- key_points: array of 3-5 talking points
- objection_handling: object with 3 common objections as keys and responses as values
- closing: how to end the call (2-3 sentences)

Return a JSON array of 4 script objects.`,
      { model: 'sonnet', max_tokens: 4096, temperature: 0.5 },
    );
    if (Array.isArray(data)) callScripts = data;
  } catch (err) {
    log(`WARNING: Failed to generate call scripts: ${err instanceof Error ? err.message : String(err)}`);
  }
  log(`Generated ${callScripts.length} call scripts`);

  // 9. Seed all content tables
  // Email templates
  if (allEmails.length > 0) {
    const emailRows = allEmails.map((e) => ({
      org_id,
      name: e.name,
      subject: e.subject,
      body_html: e.body_html,
      body_text: e.body_text || '',
      category: mapEmailCategory(e.category),
      is_active: true,
    }));
    const { error: emailErr } = await supabase.from('mkt_email_templates').insert(emailRows);
    if (emailErr) log(`WARNING: Email insert error: ${emailErr.message}`);
    else log(`Inserted ${emailRows.length} email templates`);
  }

  // WhatsApp templates
  if (waTemplates.length > 0) {
    const waRows = waTemplates.map((w) => ({
      org_id,
      name: w.name,
      template_name: w.template_name,
      body: w.body,
      category: w.category || 'marketing',
      approval_status: 'pending',
      is_active: true,
    }));
    const { error: waErr } = await supabase.from('mkt_whatsapp_templates').insert(waRows);
    if (waErr) log(`WARNING: WhatsApp insert error: ${waErr.message}`);
    else log(`Inserted ${waRows.length} WhatsApp templates`);
  }

  // Call scripts
  if (callScripts.length > 0) {
    const scriptRows = callScripts.map((s) => ({
      org_id,
      name: s.name,
      product_key: productKey,
      call_type: s.call_type,
      objective: s.objective,
      opening: s.opening,
      key_points: s.key_points,
      objection_handling: s.objection_handling,
      closing: s.closing,
      is_active: true,
    }));
    const { error: scriptErr } = await supabase.from('mkt_call_scripts').insert(scriptRows);
    if (scriptErr) log(`WARNING: Call scripts insert error: ${scriptErr.message}`);
    else log(`Inserted ${scriptRows.length} call scripts`);
  }

  // 10. Create initial campaign with steps
  log('Creating initial outbound campaign...');
  const { data: campaign, error: campErr } = await supabase
    .from('mkt_campaigns')
    .insert({
      org_id,
      name: `${product_name} - Initial Outbound`,
      campaign_type: 'outbound',
      status: 'draft',
      metadata: { product_key: productKey },
    })
    .select('id')
    .single();

  if (campErr) {
    log(`WARNING: Campaign creation error: ${campErr.message}`);
  } else if (campaign) {
    // Add basic 5-step sequence: email -> wait -> email -> wait -> email
    const steps = [
      { step_order: 1, channel: 'email', delay_hours: 0, action_type: 'send_email', subject_line: 'Introduction' },
      { step_order: 2, channel: 'email', delay_hours: 72, action_type: 'send_email', subject_line: 'Follow-up' },
      { step_order: 3, channel: 'whatsapp', delay_hours: 48, action_type: 'send_whatsapp', subject_line: 'Quick check-in' },
      { step_order: 4, channel: 'email', delay_hours: 96, action_type: 'send_email', subject_line: 'Value proposition' },
      { step_order: 5, channel: 'email', delay_hours: 120, action_type: 'send_email', subject_line: 'Last follow-up' },
    ];

    const stepRows = steps.map((s) => ({
      campaign_id: campaign.id,
      step_order: s.step_order,
      channel: s.channel,
      delay_hours: s.delay_hours,
      action_type: s.action_type,
      subject_line: s.subject_line,
    }));

    const { error: stepErr } = await supabase.from('mkt_campaign_steps').insert(stepRows);
    if (stepErr) log(`WARNING: Campaign steps error: ${stepErr.message}`);
    else log(`Created campaign "${campaign.id}" with ${steps.length} steps`);
  }

  // 11. Finalize: set onboarding_status = complete, active = false
  const onboardingLog = logLines.join('\n');
  await supabase
    .from('mkt_products')
    .update({
      onboarding_status: 'complete',
      active: false,
      onboarding_log: onboardingLog,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', productId);

  log('Onboarding complete. Product is inactive — toggle manually when ready.');

  await logger.info('onboard-complete', {
    product_key: productKey,
    product_id: productId,
    emails_generated: allEmails.length,
    wa_templates_generated: waTemplates.length,
    call_scripts_generated: callScripts.length,
    schema_map: schemaMap,
    trial_days: trialDays,
  });

  return {
    product_id: productId,
    product_key: productKey,
    schema_map: schemaMap,
    trial_days: trialDays,
    content_generated: {
      emails: allEmails.length,
      whatsapp_templates: waTemplates.length,
      call_scripts: callScripts.length,
    },
    secrets_to_set: [secretUrlName, secretKeyName],
    onboarding_log: onboardingLog,
  };
}

/** Map our category names to the DB's category values */
function mapEmailCategory(cat: string): string {
  const map: Record<string, string> = {
    nurture: 'nurture',
    closing: 'follow_up',
    onboarding: 'nurture',
    cold: 'outreach',
    reactivation: 're_engagement',
  };
  return map[cat] || 'outreach';
}

// ---------------------------------------------------------------------------
// TOGGLE
// ---------------------------------------------------------------------------

async function handleToggle(
  supabase: SupabaseClient,
  body: ToggleBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { product_id, active } = body;

  // Call the PostgreSQL function
  const { error } = await supabase.rpc('toggle_product_active', {
    _product_id: product_id,
    _active: active,
  });

  if (error) throw new Error(`toggle_product_active failed: ${error.message}`);

  // Fetch the updated product
  const { data: product } = await supabase
    .from('mkt_products')
    .select('id, product_key, product_name, active')
    .eq('id', product_id)
    .single();

  await logger.info('product-toggled', {
    product_id,
    active,
    product_key: product?.product_key,
  });

  return {
    product_id,
    active,
    product: product || null,
  };
}

// ---------------------------------------------------------------------------
// SYNC
// ---------------------------------------------------------------------------

async function handleSync(
  supabase: SupabaseClient,
  body: SyncBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { org_id } = body;

  // Get all products for this org that have a supabase_url
  const { data: products, error: fetchErr } = await supabase
    .from('mkt_products')
    .select('*')
    .eq('org_id', org_id)
    .not('supabase_url', 'is', null);

  if (fetchErr) throw new Error(`Failed to fetch products: ${fetchErr.message}`);
  if (!products || products.length === 0) {
    return { synced: 0, message: 'No products with supabase_url found' };
  }

  const results: Array<Record<string, unknown>> = [];

  for (const product of products) {
    const syncResult: Record<string, unknown> = {
      product_key: product.product_key,
      product_name: product.product_name,
    };

    try {
      // Get service key from env vars
      const serviceKey = getProductServiceKey(product.product_name);
      if (!serviceKey) {
        syncResult.status = 'skipped';
        syncResult.reason = `Missing env var: ${deriveInitials(product.product_name)}_SUPABASE_SERVICE_KEY`;
        results.push(syncResult);
        continue;
      }

      const productClient = createProductClient(product.supabase_url, serviceKey);
      const schemaMap = (product.schema_map || {}) as Record<string, string>;
      const dataBefore: Record<string, unknown> = {};
      const dataAfter: Record<string, unknown> = {};

      // Read current counts
      if (schemaMap.registrations_table) {
        // Total users
        const { count: totalUsers } = await productClient
          .from(schemaMap.registrations_table)
          .select('*', { count: 'exact', head: true });
        dataAfter.total_users = totalUsers || 0;
      }

      if (schemaMap.payments_table) {
        // Total paid
        const { count: paidCount } = await productClient
          .from(schemaMap.payments_table)
          .select('*', { count: 'exact', head: true });
        dataAfter.total_payments = paidCount || 0;
      }

      // Read current pricing if pricing table exists
      if (schemaMap.pricing_table) {
        const { data: pricing } = await productClient
          .from(schemaMap.pricing_table)
          .select('*')
          .limit(10);
        dataAfter.pricing = pricing || [];
      }

      // Compare against last sync
      const { data: lastSync } = await supabase
        .from('mkt_product_sync_log')
        .select('data_after')
        .eq('org_id', org_id)
        .eq('product_key', product.product_key)
        .order('synced_at', { ascending: false })
        .limit(1)
        .single();

      if (lastSync?.data_after) {
        Object.assign(dataBefore, lastSync.data_after);
      }

      // Check for pricing changes
      const pricingChanged =
        JSON.stringify(dataBefore.pricing) !== JSON.stringify(dataAfter.pricing) &&
        dataBefore.pricing !== undefined;

      if (pricingChanged) {
        await logger.warn('pricing-changed', {
          product_key: product.product_key,
          message: 'Pricing changed — content regeneration may be needed',
        });
        syncResult.pricing_changed = true;
      }

      // Update mkt_products with latest counts
      await supabase
        .from('mkt_products')
        .update({
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', product.id);

      // Write sync log
      await supabase.from('mkt_product_sync_log').insert({
        org_id,
        product_key: product.product_key,
        sync_type: 'full',
        data_before: dataBefore,
        data_after: dataAfter,
        changes_detected: JSON.stringify(dataBefore) !== JSON.stringify(dataAfter),
      });

      syncResult.status = 'synced';
      syncResult.data = dataAfter;
      syncResult.changes_detected = JSON.stringify(dataBefore) !== JSON.stringify(dataAfter);
    } catch (err) {
      syncResult.status = 'error';
      syncResult.error = err instanceof Error ? err.message : String(err);
      await logger.error('sync-product-failed', err, {
        product_key: product.product_key,
      });
    }

    results.push(syncResult);
  }

  await logger.info('sync-complete', {
    org_id,
    products_synced: results.filter((r) => r.status === 'synced').length,
    products_skipped: results.filter((r) => r.status === 'skipped').length,
    products_errored: results.filter((r) => r.status === 'error').length,
  });

  return {
    synced: results.filter((r) => r.status === 'synced').length,
    total: results.length,
    results,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-product-manager');

  try {
    const supabase = getSupabaseClient();
    const body: RequestBody = await req.json();
    const mode = body.mode;

    let result: Record<string, unknown> = {};

    switch (mode) {
      case 'onboard':
        result = await handleOnboard(supabase, body as OnboardBody, logger);
        break;
      case 'toggle':
        result = await handleToggle(supabase, body as ToggleBody, logger);
        break;
      case 'sync':
        result = await handleSync(supabase, body as SyncBody, logger);
        break;
      default:
        throw new Error(`Unknown mode: ${mode}`);
    }

    return new Response(
      JSON.stringify({ success: true, mode, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    await logger.error('product-manager-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
