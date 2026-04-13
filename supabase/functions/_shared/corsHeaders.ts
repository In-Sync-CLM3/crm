/**
 * Standard CORS headers used by all edge functions.
 * Previously copy-pasted identically across 100+ functions.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
