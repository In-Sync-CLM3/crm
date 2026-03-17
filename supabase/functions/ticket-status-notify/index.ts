import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_id, new_status } = await req.json();

    if (!ticket_id || !new_status) {
      return new Response(
        JSON.stringify({ error: "Missing ticket_id or new_status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validStatuses = ["in_progress", "resolved", "closed"];
    if (!validStatuses.includes(new_status)) {
      return new Response(
        JSON.stringify({ error: "Invalid status. Must be: in_progress, resolved, or closed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, status, priority, contact_name, contact_email, org_id, created_at, resolved_at")
      .eq("id", ticket_id)
      .single();

    if (ticketError || !ticket) {
      return new Response(
        JSON.stringify({ error: "Ticket not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ticket.contact_email) {
      return new Response(
        JSON.stringify({ error: "No contact email on ticket" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update ticket status
    const updateData: Record<string, unknown> = { status: new_status };
    if (new_status === "resolved" || new_status === "closed") {
      updateData.resolved_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("support_tickets")
      .update(updateData)
      .eq("id", ticket_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update ticket status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email notification
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[ticket-status-notify] RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: true, email_sent: false, reason: "RESEND_API_KEY not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get sending domain
    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("sending_domain, verification_status, is_active")
      .eq("org_id", ticket.org_id)
      .eq("is_active", true)
      .maybeSingle();

    const sendingDomain = emailSettings?.sending_domain && emailSettings.verification_status === "verified"
      ? emailSettings.sending_domain
      : "in-sync.co.in";
    const fromEmail = `noreply@${sendingDomain}`;
    const replyToEmail = `support+${ticket.ticket_number}@${sendingDomain}`;

    const statusLabels: Record<string, string> = {
      in_progress: "In Progress",
      resolved: "Resolved",
      closed: "Closed",
    };
    const statusColors: Record<string, string> = {
      in_progress: "#f59e0b",
      resolved: "#22c55e",
      closed: "#6b7280",
    };

    const statusLabel = statusLabels[new_status] || new_status;
    const statusColor = statusColors[new_status] || "#6366f1";
    const contactName = ticket.contact_name || "Customer";

    const resolvedAt = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const createdAt = new Date(ticket.created_at).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    let statusMessage = "";
    if (new_status === "resolved") {
      statusMessage = "Your support ticket has been resolved. If you believe the issue is not fully resolved, simply reply to this email to reopen the ticket.";
    } else if (new_status === "closed") {
      statusMessage = "Your support ticket has been closed. If you need further assistance, feel free to raise a new ticket or reply to this email.";
    } else if (new_status === "in_progress") {
      statusMessage = "Our team is now actively working on your support ticket. We will notify you once it is resolved.";
    }

    const emailSubject = `[${ticket.ticket_number}] Ticket ${statusLabel} - ${ticket.subject}`;
    const emailHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333;">
        <div style="background:#6366f1;padding:20px 24px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;font-size:20px;color:#fff;">Ticket Update: ${statusLabel}</h1>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p style="font-size:15px;margin-top:0;">Dear ${contactName},</p>
          <p style="font-size:15px;">${statusMessage}</p>

          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
            <tr style="background:#f3f4f6;">
              <td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;width:40%;">Ticket Number</td>
              <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:700;color:#6366f1;">${ticket.ticket_number}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Subject</td>
              <td style="padding:10px 14px;border:1px solid #e5e7eb;">${ticket.subject}</td>
            </tr>
            <tr style="background:#f3f4f6;">
              <td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Status</td>
              <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:700;color:${statusColor};">${statusLabel}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Created</td>
              <td style="padding:10px 14px;border:1px solid #e5e7eb;">${createdAt}</td>
            </tr>
            <tr style="background:#f3f4f6;">
              <td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Updated</td>
              <td style="padding:10px 14px;border:1px solid #e5e7eb;">${resolvedAt}</td>
            </tr>
          </table>

          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:20px 0;">
            <p style="margin:0;font-size:13px;color:#1e40af;"><strong>Need further help?</strong> Simply reply to this email with your query. Please keep the ticket number <strong>${ticket.ticket_number}</strong> in the subject line.</p>
          </div>

          <p style="font-size:15px;margin-top:24px;">Best regards,<br/><strong>Team In-Sync</strong></p>
        </div>
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
        to: [ticket.contact_email],
        reply_to: replyToEmail,
        subject: emailSubject,
        html: emailHtml,
      }),
    });

    const emailSent = resendResponse.ok;

    // Log notification
    await supabase.from("support_ticket_notifications").insert({
      ticket_id: ticket.id,
      org_id: ticket.org_id,
      channel: "email",
      recipient: ticket.contact_email,
      subject: emailSubject,
      message_preview: `Ticket ${ticket.ticket_number} status changed to ${statusLabel}`,
      status: emailSent ? "sent" : "failed",
      error_message: emailSent ? null : await resendResponse.text(),
    });

    if (emailSent) {
      console.log(`[ticket-status-notify] Email sent for ${ticket.ticket_number} -> ${statusLabel}`);
    } else {
      console.error(`[ticket-status-notify] Email failed for ${ticket.ticket_number}`);
    }

    return new Response(
      JSON.stringify({ success: true, email_sent: emailSent, status: new_status }),
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
