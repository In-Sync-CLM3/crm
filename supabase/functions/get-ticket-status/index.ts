import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_number, email } = await req.json();

    if (!ticket_number || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: ticket_number, email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ticket by ticket_number and verify email matches
    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .select("ticket_number, subject, description, category, priority, status, resolution_notes, resolved_at, created_at, updated_at, contact_name, company_name")
      .eq("ticket_number", ticket_number.trim().toUpperCase())
      .eq("contact_email", email.trim().toLowerCase())
      .maybeSingle();

    if (error) {
      console.error("Query error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch ticket" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ticket) {
      return new Response(
        JSON.stringify({ error: "Ticket not found. Please verify your ticket number and email address." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch ticket history (status changes only, no internal details)
    const { data: history } = await supabase
      .from("support_ticket_history")
      .select("action, new_value, created_at")
      .eq("ticket_id", (await supabase
        .from("support_tickets")
        .select("id")
        .eq("ticket_number", ticket_number.trim().toUpperCase())
        .eq("contact_email", email.trim().toLowerCase())
        .single()).data?.id || "")
      .in("action", ["status_changed", "assigned"])
      .order("created_at", { ascending: true });

    return new Response(
      JSON.stringify({
        success: true,
        ticket: {
          ticket_number: ticket.ticket_number,
          subject: ticket.subject,
          description: ticket.description,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
          resolution_notes: ticket.resolution_notes,
          resolved_at: ticket.resolved_at,
          created_at: ticket.created_at,
          updated_at: ticket.updated_at,
          contact_name: ticket.contact_name,
          company_name: ticket.company_name,
        },
        history: history || [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
