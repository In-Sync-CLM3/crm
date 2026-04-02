import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results: string[] = [];

    // Step 1: Drop old CHECK constraint and add new one via RPC
    // We need to use the database URL directly for DDL operations
    const dbUrl = Deno.env.get('SUPABASE_DB_URL');
    if (!dbUrl) {
      throw new Error('SUPABASE_DB_URL not available');
    }

    const { default: postgres } = await import('https://deno.land/x/postgresjs@v3.4.5/mod.js');
    const sql = postgres(dbUrl, { max: 1 });

    // RC2: Expand document_type CHECK constraint
    await sql`ALTER TABLE client_invoices DROP CONSTRAINT IF EXISTS client_invoices_document_type_check`;
    results.push('Dropped old CHECK constraint');

    await sql.unsafe(`ALTER TABLE client_invoices ADD CONSTRAINT client_invoices_document_type_check CHECK (document_type IN ('quotation', 'proforma', 'invoice', 'credit_note'))`);
    results.push('Added new CHECK constraint with proforma and credit_note');

    // RC3: Create trigger function
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION set_payment_received_date_on_paid()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.status = 'paid' AND (NEW.payment_received_date IS NULL) THEN
          NEW.payment_received_date := CURRENT_DATE;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    results.push('Created trigger function');

    await sql.unsafe(`DROP TRIGGER IF EXISTS trg_set_payment_received_date ON client_invoices`);
    await sql.unsafe(`
      CREATE TRIGGER trg_set_payment_received_date
        BEFORE INSERT OR UPDATE ON client_invoices
        FOR EACH ROW
        EXECUTE FUNCTION set_payment_received_date_on_paid()
    `);
    results.push('Created trigger');

    // Backfill
    const backfilled = await sql`
      UPDATE client_invoices
      SET payment_received_date = invoice_date
      WHERE status = 'paid' AND payment_received_date IS NULL
    `;
    results.push(`Backfilled ${backfilled.count} paid invoices missing payment_received_date`);

    await sql.end();

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
