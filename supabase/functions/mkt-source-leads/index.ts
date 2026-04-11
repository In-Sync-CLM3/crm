import { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAD_CAP = 3000;
const BATCH_SIZE = 100;
const APOLLO_MAX_PAGES = 5;
const APOLLO_PAGE_SIZE = 100; // max per Apollo request

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestBody {
  product_key: string;
  org_id: string;
}

interface ICPRow {
  id: string;
  org_id: string;
  product_key: string;
  version: number;
  industries: string[];
  designations: string[];
  company_sizes: string[];
  geographies?: string[];
  confidence_score?: number;
}

interface NativeContact {
  id: string;
  full_name: string | null;
  phone: string | null;
  email_official: string | null;
  email_personal: string | null;
  email_generic: string | null;
  company_name: string | null;
  designation: string | null;
  industry_type: string | null;
  emp_size: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin_url: string | null;
}

interface ApolloPerson {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_numbers?: Array<{ sanitized_number: string }>;
  title: string | null;
  linkedin_url?: string | null;
  organization?: {
    name: string | null;
    website_url?: string | null;
    industry?: string | null;
  };
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

interface ApolloSearchResponse {
  people: ApolloPerson[];
  pagination?: { total_entries?: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split a full name into { first_name, last_name }. */
function splitName(fullName: string | null): { first_name: string; last_name: string } {
  if (!fullName || fullName.trim() === '') {
    return { first_name: '', last_name: '' };
  }
  const parts = fullName.trim().split(/\s+/);
  const first_name = parts[0];
  const last_name = parts.slice(1).join(' ');
  return { first_name, last_name };
}

/** Return the first non-null / non-empty value from a list of candidates. */
function firstNonNull(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    if (v && v.trim() !== '') return v.trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step 1 — Fetch current ICP (highest version)
// ---------------------------------------------------------------------------

async function fetchCurrentICP(
  supabase: SupabaseClient,
  orgId: string,
  productKey: string,
): Promise<ICPRow | null> {
  const { data, error } = await supabase
    .from('mkt_product_icp')
    .select('*')
    .eq('org_id', orgId)
    .eq('product_key', productKey)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // PGRST116 = no rows found — not a fatal error
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch ICP: ${error.message}`);
  }

  return data as ICPRow;
}

// ---------------------------------------------------------------------------
// Step 2 — Count contacts already tagged for this product this month
// ---------------------------------------------------------------------------

async function countTaggedContacts(
  supabase: SupabaseClient,
  orgId: string,
  productKey: string,
): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { count, error } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('mkt_product_key', productKey)
    .gte('mkt_sourced_at', monthStart);

  if (error) throw new Error(`Failed to count tagged contacts: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Step 3 — Query + insert native contacts
// ---------------------------------------------------------------------------

async function sourceFromNative(
  supabase: SupabaseClient,
  orgId: string,
  productKey: string,
  icp: ICPRow,
  limit: number,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<number> {
  // Build the base query against mkt_native_contacts filtered by ICP
  let query = supabase
    .from('mkt_native_contacts')
    .select('*');

  if (icp.industries && icp.industries.length > 0) {
    query = query.in('industry_type', icp.industries);
  }
  if (icp.designations && icp.designations.length > 0) {
    query = query.in('designation', icp.designations);
  }
  if (icp.company_sizes && icp.company_sizes.length > 0) {
    query = query.in('emp_size', icp.company_sizes);
  }

  // Fetch a reasonable pool — we will dedup in-process
  const { data: candidates, error: fetchError } = await query.limit(limit * 3);

  if (fetchError) throw new Error(`Failed to query mkt_native_contacts: ${fetchError.message}`);
  if (!candidates || candidates.length === 0) {
    await logger.info('native-no-candidates', { org_id: orgId, product_key: productKey });
    return 0;
  }

  // Collect all phones and emails to exclude in a single lookup
  const phones = (candidates as NativeContact[])
    .map((c) => c.phone)
    .filter(Boolean) as string[];

  const emails = (candidates as NativeContact[])
    .flatMap((c) => [c.email_official, c.email_personal, c.email_generic])
    .filter(Boolean) as string[];

  // Fetch existing contacts for this org that match any phone or email
  const [phoneCheck, emailCheck] = await Promise.all([
    phones.length > 0
      ? supabase
          .from('contacts')
          .select('phone')
          .eq('org_id', orgId)
          .in('phone', phones)
      : Promise.resolve({ data: [], error: null }),
    emails.length > 0
      ? supabase
          .from('contacts')
          .select('email')
          .eq('org_id', orgId)
          .in('email', emails)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (phoneCheck.error) throw new Error(`Phone dedup check failed: ${phoneCheck.error.message}`);
  if (emailCheck.error) throw new Error(`Email dedup check failed: ${emailCheck.error.message}`);

  const existingPhones = new Set((phoneCheck.data || []).map((r: { phone: string }) => r.phone));
  const existingEmails = new Set((emailCheck.data || []).map((r: { email: string }) => r.email));

  // Filter out duplicates
  const fresh = (candidates as NativeContact[]).filter((c) => {
    if (c.phone && existingPhones.has(c.phone)) return false;
    const email = firstNonNull(c.email_official, c.email_personal, c.email_generic);
    if (email && existingEmails.has(email)) return false;
    return true;
  }).slice(0, limit);

  if (fresh.length === 0) {
    await logger.info('native-all-duplicates', { org_id: orgId, product_key: productKey, candidates: candidates.length });
    return 0;
  }

  // Map to contacts rows
  const now = new Date().toISOString();
  const rows = fresh.map((c) => {
    const { first_name, last_name } = splitName(c.full_name);
    const email = firstNonNull(c.email_official, c.email_personal, c.email_generic);
    return {
      org_id: orgId,
      first_name,
      last_name: last_name || null,
      phone: c.phone || null,
      email: email || null,
      company: c.company_name || null,
      job_title: c.designation || null,
      organization_industry: c.industry_type || null,
      headline: c.emp_size || null,
      city: c.city || null,
      state: c.state || null,
      country: c.country || null,
      linkedin_url: c.linkedin_url || null,
      mkt_product_key: productKey,
      mkt_source: 'native',
      mkt_sourced_at: now,
      source: 'native_dataset',
      status: 'new',
    };
  });

  // Insert in batches of BATCH_SIZE
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error: insertError, data: insertData } = await supabase
      .from('contacts')
      .upsert(batch, { ignoreDuplicates: true, onConflict: 'org_id,phone' })
      .select('id');

    if (insertError) {
      await logger.warn('native-batch-insert-error', {
        org_id: orgId,
        batch_start: i,
        error: insertError.message,
      });
    } else {
      inserted += (insertData || []).length;
    }
  }

  await logger.info('native-sourced', {
    org_id: orgId,
    product_key: productKey,
    candidates: candidates.length,
    fresh: fresh.length,
    inserted,
  });

  return inserted;
}

// ---------------------------------------------------------------------------
// Step 4 — Apollo API sourcing
// ---------------------------------------------------------------------------

async function callApollo(
  apiKey: string,
  icp: ICPRow,
  numResults: number,
  page: number,
): Promise<ApolloSearchResponse> {
  const body = {
    person_titles: icp.designations,
    q_organization_industry_keywords: icp.industries.join(' OR '),
    num_results: Math.min(numResults, APOLLO_PAGE_SIZE),
    page,
  };

  const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apollo API error ${response.status}: ${errorText}`);
  }

  return await response.json() as ApolloSearchResponse;
}

async function sourceFromApollo(
  supabase: SupabaseClient,
  orgId: string,
  productKey: string,
  icp: ICPRow,
  gap: number,
  apolloApiKey: string,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<number> {
  let apolloInserted = 0;
  let remaining = gap;

  for (let page = 1; page <= APOLLO_MAX_PAGES && remaining > 0; page++) {
    let apolloData: ApolloSearchResponse;

    try {
      apolloData = await callApollo(apolloApiKey, icp, remaining, page);
    } catch (err) {
      await logger.warn('apollo-fetch-failed', {
        org_id: orgId,
        product_key: productKey,
        page,
        error: err instanceof Error ? err.message : String(err),
      });
      break; // Don't fail the whole function — just stop Apollo sourcing
    }

    const people = apolloData.people || [];
    if (people.length === 0) break;

    const now = new Date().toISOString();
    const rows = people.map((p: ApolloPerson) => ({
      org_id: orgId,
      first_name: p.first_name || null,
      last_name: p.last_name || null,
      email: p.email || null,
      phone: p.phone_numbers?.[0]?.sanitized_number || null,
      company: p.organization?.name || null,
      job_title: p.title || null,
      city: p.city || null,
      state: p.state || null,
      country: p.country || null,
      linkedin_url: p.linkedin_url || null,
      apollo_person_id: p.id || null,
      mkt_product_key: productKey,
      mkt_source: 'apollo',
      mkt_sourced_at: now,
      source: 'apollo',
      status: 'new',
      enrichment_status: 'enriched',
      last_enriched_at: now,
    }));

    // Insert in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error: insertError, data: insertData } = await supabase
        .from('contacts')
        .upsert(batch, { ignoreDuplicates: true, onConflict: 'org_id,phone' })
        .select('id');

      if (insertError) {
        await logger.warn('apollo-batch-insert-error', {
          org_id: orgId,
          page,
          batch_start: i,
          error: insertError.message,
        });
      } else {
        const batchInserted = (insertData || []).length;
        apolloInserted += batchInserted;
        remaining -= batchInserted;
      }
    }

    await logger.info('apollo-page-done', {
      org_id: orgId,
      product_key: productKey,
      page,
      people_fetched: people.length,
      inserted_so_far: apolloInserted,
    });

    // If Apollo returned fewer than requested, there are no more pages
    if (people.length < Math.min(remaining + apolloInserted, APOLLO_PAGE_SIZE)) break;
  }

  return apolloInserted;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-source-leads');

  try {
    const body: RequestBody = await req.json();
    const { product_key, org_id } = body;

    if (!product_key || !org_id) {
      return new Response(
        JSON.stringify({ error: 'product_key and org_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const productLogger = createEngineLogger('mkt-source-leads', org_id);
    const supabase = getSupabaseClient();

    await productLogger.info('sourcing-start', { product_key, org_id });

    // 1. Fetch current ICP
    const icp = await fetchCurrentICP(supabase, org_id, product_key);
    if (!icp) {
      return new Response(
        JSON.stringify({ error: `No ICP found for product_key=${product_key} org_id=${org_id}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await productLogger.info('icp-loaded', {
      product_key,
      version: icp.version,
      industries: icp.industries,
      designations: icp.designations,
      company_sizes: icp.company_sizes,
    });

    // 2. Count already-tagged contacts this month
    const existingCount = await countTaggedContacts(supabase, org_id, product_key);

    if (existingCount >= LEAD_CAP) {
      await productLogger.info('lead-cap-reached', { product_key, count: existingCount, cap: LEAD_CAP });
      return new Response(
        JSON.stringify({ status: 'sufficient', count: existingCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const initialGap = LEAD_CAP - existingCount;

    // 3 & 4. Source from native contacts
    const nativeInserted = await sourceFromNative(
      supabase,
      org_id,
      product_key,
      icp,
      initialGap,
      productLogger,
    );

    // 5. Recount after native inserts
    const countAfterNative = await countTaggedContacts(supabase, org_id, product_key);
    const gapAfterNative = LEAD_CAP - countAfterNative;

    let apolloInserted = 0;

    // 6. If still below cap, fill with Apollo
    if (gapAfterNative > 0) {
      const apolloApiKey = Deno.env.get('APOLLO_API_KEY');

      if (!apolloApiKey) {
        await productLogger.warn('apollo-key-missing', {
          org_id,
          product_key,
          message: 'APOLLO_API_KEY not set — skipping Apollo sourcing',
        });
      } else {
        apolloInserted = await sourceFromApollo(
          supabase,
          org_id,
          product_key,
          icp,
          gapAfterNative,
          apolloApiKey,
          productLogger,
        );
      }
    }

    // 7. Final recount for accurate gap_remaining
    const finalCount = await countTaggedContacts(supabase, org_id, product_key);
    const gapRemaining = Math.max(0, LEAD_CAP - finalCount);

    const result = {
      status: 'sourced',
      native_count: nativeInserted,
      apollo_count: apolloInserted,
      total: finalCount,
      gap_remaining: gapRemaining,
    };

    await productLogger.info('sourcing-complete', {
      product_key,
      ...result,
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    await logger.error('handler-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
