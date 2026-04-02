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
    const { ticket_number, email, feedback } = await req.json();

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

    // Fetch ticket and verify ownership
    const { data: ticket, error: fetchError } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, status, contact_name, contact_email, subject, org_id")
      .eq("ticket_number", ticket_number.trim().toUpperCase())
      .eq("contact_email", email.trim().toLowerCase())
      .maybeSingle();

    if (fetchError) {
      console.error("Query error:", fetchError);
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

    if (ticket.status === "closed") {
      return new Response(
        JSON.stringify({ success: true, message: "This ticket is already closed.", ticket_number: ticket.ticket_number }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (ticket.status !== "resolved") {
      return new Response(
        JSON.stringify({ error: `Ticket cannot be closed. Current status is "${ticket.status}". Only resolved tickets can be closed by the client.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Close the ticket
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({
        status: "closed",
        client_notified: true,
        client_notified_at: new Date().toISOString(),
      })
      .eq("id", ticket.id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to close ticket" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log history entry
    await supabase.from("support_ticket_history").insert({
      ticket_id: ticket.id,
      org_id: ticket.org_id,
      user_id: null,
      action: "status_changed",
      old_value: "resolved",
      new_value: "closed",
    });

    // If client provided feedback, log it as a comment
    if (feedback && typeof feedback === "string" && feedback.trim()) {
      await supabase.from("support_ticket_comments").insert({
        ticket_id: ticket.id,
        org_id: ticket.org_id,
        user_id: (await supabase.from("profiles").select("id").eq("org_id", ticket.org_id).limit(1).single()).data?.id,
        comment: `[Client Closure Feedback] ${feedback.trim()}`,
        is_internal: false,
      });

      await supabase.from("support_ticket_history").insert({
        ticket_id: ticket.id,
        org_id: ticket.org_id,
        user_id: null,
        action: "comment_added",
        new_value: `Client closure feedback: ${feedback.trim()}`,
      });
    }

    // Send closure confirmation email
    try {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        const { data: emailSettings } = await supabase
          .from("email_settings")
          .select("sending_domain, verification_status, is_active")
          .eq("org_id", ticket.org_id)
          .eq("is_active", true)
          .maybeSingle();

        const fromEmail = emailSettings?.sending_domain && emailSettings.verification_status === "verified"
          ? `noreply@${emailSettings.sending_domain}`
          : "noreply@in-sync.app";

        const clientName = ticket.contact_name || "Valued Client";
        const emailSubject = `Your Support Ticket ${ticket.ticket_number} Has Been Closed`;
        const emailHtml = `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333;">
            <p style="font-size:15px;">Dear ${clientName},</p>
            <p style="font-size:15px;">Your support ticket <strong>${ticket.ticket_number}</strong> regarding <strong>${ticket.subject}</strong> has been closed as per your confirmation.</p>
            <p style="font-size:15px;">Thank you for using our support services. If you face any further issues, please feel free to raise a new ticket through the Help section on your platform.</p>
            <p style="font-size:15px;">This is an automated email and replies to this address are not monitored.</p>
            <p style="font-size:15px;margin-top:24px;">Best regards,<br/><strong>Team In-Sync</strong></p>
          </div>
        `;

        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: `In-Sync Support <${fromEmail}>`,
            to: [email.trim()],
            subject: emailSubject,
            html: emailHtml,
          }),
        });

        const notifStatus = resendResponse.ok ? "sent" : "failed";
        const errorMsg = resendResponse.ok ? null : await resendResponse.text();

        await supabase.from("support_ticket_notifications").insert({
          ticket_id: ticket.id,
          org_id: ticket.org_id,
          channel: "email",
          recipient: email.trim(),
          subject: emailSubject,
          message_preview: `Ticket ${ticket.ticket_number} closed by client`,
          status: notifStatus,
          error_message: errorMsg,
        });
      }
    } catch (emailErr) {
      console.error("[close-ticket] Email notification error:", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Ticket ${ticket.ticket_number} has been closed successfully. Thank you for your confirmation.`,
        ticket_number: ticket.ticket_number,
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
