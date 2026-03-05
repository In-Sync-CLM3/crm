import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    console.log('Starting subscription status check...');

    // Get all active organizations
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('subscription_active', true);

    if (orgsError) {
      console.error('Error fetching organizations:', orgsError);
      throw orgsError;
    }

    console.log(`Found ${orgs?.length || 0} active organizations`);

    let checkedCount = 0;
    let updatedCount = 0;

    // Check and update subscription status for each org
    for (const org of orgs || []) {
      try {
        const { error: checkError } = await supabase.rpc('check_and_update_subscription_status', {
          _org_id: org.id
        });

        if (checkError) {
          console.error(`Error checking subscription for org ${org.id}:`, checkError);
        } else {
          checkedCount++;
          
          // Get the updated subscription status
          const { data: sub } = await supabase
            .from('organization_subscriptions')
            .select('subscription_status')
            .eq('org_id', org.id)
            .single();

          if (sub && sub.subscription_status !== 'active') {
            updatedCount++;
          }
        }
      } catch (error) {
        console.error(`Error processing org ${org.id}:`, error);
      }
    }

    console.log(`Subscription check complete: ${checkedCount} checked, ${updatedCount} updated`);

    return new Response(
      JSON.stringify({
        success: true,
        checked: checkedCount,
        updated: updatedCount,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error) {
    console.error('Subscription status checker error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});