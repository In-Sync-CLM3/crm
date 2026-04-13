import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';

interface AuthResult {
  user: { id: string; email?: string };
  orgId: string;
  supabaseClient: SupabaseClient;
}

/**
 * Authenticate user from request Authorization header.
 * Returns the authenticated user, their org_id, and a user-scoped Supabase client.
 * Used by 37+ edge functions that need JWT auth + org lookup.
 */
export async function getUserFromRequest(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('No Authorization header provided');
  }

  const token = authHeader.replace('Bearer ', '');

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    }
  );

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
  if (userError || !user) {
    throw new Error(`Authentication failed: ${userError?.message || 'No user found'}`);
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.org_id) {
    throw new Error('Organization not found');
  }

  return {
    user: { id: user.id, email: user.email },
    orgId: profile.org_id,
    supabaseClient,
  };
}
