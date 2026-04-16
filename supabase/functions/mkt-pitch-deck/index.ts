import { getSupabaseClient } from '../_shared/supabaseClient.ts';

/**
 * mkt-pitch-deck — serves the generated pitch deck HTML for a product.
 * Public endpoint — no auth required (shareable link for champion emails).
 * GET /functions/v1/mkt-pitch-deck?product_key=vendor-verification&org_id=xxx
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const url = new URL(req.url);
  const productKey = url.searchParams.get('product_key');
  const orgId = url.searchParams.get('org_id');

  if (!productKey) {
    return new Response('<h1>Missing product_key</h1>', {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    const supabase = getSupabaseClient();

    let query = supabase
      .from('mkt_products')
      .select('product_name, pitch_deck_html, pitch_deck_built_at')
      .eq('product_key', productKey);

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data: product, error } = await query.maybeSingle();

    if (error || !product) {
      return new Response('<h1>Product not found</h1>', {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (!product.pitch_deck_html) {
      return new Response(
        `<html><body style="font-family:sans-serif;padding:40px">
          <h2>${product.product_name}</h2>
          <p>Pitch deck is being generated. Please check back shortly.</p>
        </body></html>`,
        {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache',
          },
        },
      );
    }

    return new Response(product.pitch_deck_html as string, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Pitch-Deck-Built': product.pitch_deck_built_at ?? '',
      },
    });
  } catch (err) {
    console.error('[mkt-pitch-deck]', err);
    return new Response('<h1>Server error</h1>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
});
