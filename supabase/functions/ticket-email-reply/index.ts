import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Ticket Email Reply Handler
 *
 * Processes inbound emails that are replies to support tickets.
 * Matches ticket number from subject line or reply-to address (support+TKT-XXXXX@domain).
 * Adds the reply as a comment on the ticket and sends an acknowledgement email.
 */

// Extract ticket number from subject or reply-to address
function extractTicketNumber(subject: string, toEmail: string): string | null {
  // Try subject line first: look for [TKT-XXXXX] pattern
  const subjectMatch = subject?.match(/\[?(TKT-\d+)\]?/i);
  if (subjectMatch) return subjectMatch[1].toUpperCase();

  // Try the to email: support+TKT-XXXXX@domain
  const emailMatch = toEmail?.match(/support\+(TKT-\d+)@/i);
  if (emailMatch) return emailMatch[1].toUpperCase();

  return null;
}

// Strip quoted reply content (lines starting with >) and email signatures
function extractReplyContent(text: string): string {
  if (!text) return "";

  const lines = text.split("\n");
  const cleanLines: string[] = [];
  let hitQuotedSection = false;

  for (const line of lines) {
    // Stop at common reply markers
    if (
      line.startsWith(">") ||
      line.startsWith("On ") && line.includes("wrote:") ||
      line.match(/^-{2,}/) ||
      line.match(/^_{2,}/) ||
      line.includes("Original Message") ||
      line.includes("From:") && line.includes("@")
    ) {
      hitQuotedSection = true;
      continue;
    }

    if (hitQuotedSection) continue;
    cleanLines.push(line);
  }

  return cleanLines.join("\n").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const payload = JSON.parse(body);

    // Handle Resend webhook events (has 'type' field) - just acknowledge
    if (payload.type) {
      console.log(`[ticket-email-reply] Ignoring Resend event: ${payload.type}`);
      return new Response(
        JSON.stringify({ success: true, message: "Event acknowledged" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // This is an inbound email
    const { from, fromName, to, subject, text, html } = payload;

    console.log(`[ticket-email-reply] Inbound email from: ${from}, to: ${to}, subject: ${subject}`);

    const ticketNumber = extractTicketNumber(subject || "", to || "");
    if (!ticketNumber) {
      console.log("[ticket-email-reply] No ticket number found in email, ignoring");
      return new Response(
        JSON.stringify({ success: false, message: "No ticket number found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ticket-email-reply] Matched ticket: ${ticketNumber}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const mainOrgId = "65e22e43-f23d-4c0a-9d84-2eba65ad0e12";

    // Find the ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, contact_email, contact_name, status, subject, assigned_to")
      .eq("ticket_number", ticketNumber)
      .eq("org_id", mainOrgId)
      .single();

    if (ticketError || !ticket) {
      console.error("[ticket-email-reply] Ticket not found:", ticketNumber);
      return new Response(
        JSON.stringify({ success: false, message: "Ticket not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract clean reply content
    const replyContent = extractReplyContent(text || "");
    if (!replyContent) {
      console.log("[ticket-email-reply] Empty reply content, skipping");
      return new Response(
        JSON.stringify({ success: true, message: "Empty reply ignored" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine if this is from the client or an internal team member
    const isFromClient = from?.toLowerCase() === ticket.contact_email?.toLowerCase();
    const senderName = fromName || from?.split("@")[0] || "Unknown";

    // Get system user for creating the comment
    const { data: systemUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("org_id", mainOrgId)
      .limit(1)
      .single();

    if (!systemUser) {
      console.error("[ticket-email-reply] No system user found");
      return new Response(
        JSON.stringify({ error: "System configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add comment to the ticket
    const commentText = `[Email Reply from ${senderName} <${from}>]\n\n${replyContent}`;
    const { error: commentError } = await supabase
      .from("support_ticket_comments")
      .insert({
        ticket_id: ticket.id,
        org_id: mainOrgId,
        user_id: systemUser.id,
        comment: commentText,
        is_internal: false,
      });

    if (commentError) {
      console.error("[ticket-email-reply] Failed to add comment:", commentError);
      return new Response(
        JSON.stringify({ error: "Failed to add comment" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log in ticket history
    await supabase.from("support_ticket_history").insert({
      ticket_id: ticket.id,
      org_id: mainOrgId,
      user_id: systemUser.id,
      action: "email_reply_received",
      new_value: `Email reply from ${senderName}`,
    });

    // If ticket is resolved/closed and client replies, reopen it
    if (isFromClient && ["resolved", "closed"].includes(ticket.status)) {
      await supabase
        .from("support_tickets")
        .update({ status: "in_progress", resolved_at: null })
        .eq("id", ticket.id);

      await supabase.from("support_ticket_history").insert({
        ticket_id: ticket.id,
        org_id: mainOrgId,
        user_id: systemUser.id,
        action: "status_changed",
        old_value: ticket.status,
        new_value: "in_progress",
      });

      console.log(`[ticket-email-reply] Ticket ${ticketNumber} reopened due to client reply`);
    }

    // Send acknowledgement email to the reply sender
    try {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY && isFromClient) {
        const { data: emailSettings } = await supabase
          .from("email_settings")
          .select("sending_domain, verification_status, is_active")
          .eq("org_id", mainOrgId)
          .eq("is_active", true)
          .maybeSingle();

        const sendingDomain = emailSettings?.sending_domain && emailSettings.verification_status === "verified"
          ? emailSettings.sending_domain
          : "in-sync.co.in";
        const fromEmailAddr = `noreply@${sendingDomain}`;
        const replyToEmail = `support+${ticketNumber}@${sendingDomain}`;

        const ackSubject = `Re: [${ticketNumber}] ${ticket.subject}`;
        const ackHtml = `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333;">
            <div style="background:#6366f1;padding:16px 20px;border-radius:12px 12px 0 0;">
              <h2 style="margin:0;font-size:16px;color:#fff;">Reply Received - ${ticketNumber}</h2>
            </div>
            <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
              <p style="font-size:14px;">Dear ${ticket.contact_name || senderName},</p>
              <p style="font-size:14px;">Your reply to ticket <strong>${ticketNumber}</strong> has been received and added to your support case. Our team will review and respond during working hours.</p>

              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:16px 0;">
                <p style="margin:0;font-size:13px;color:#666;"><strong>Your message:</strong></p>
                <p style="margin:8px 0 0;font-size:13px;color:#333;white-space:pre-wrap;">${replyContent.length > 300 ? replyContent.substring(0, 300) + "..." : replyContent}</p>
              </div>

              <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:16px 0;">
                <p style="margin:0;font-size:12px;color:#92400e;"><strong>Working Hours:</strong> Monday to Friday, 9:00 AM to 6:00 PM IST</p>
              </div>

              <p style="font-size:14px;margin-top:20px;">Best regards,<br/><strong>Team In-Sync</strong></p>
            </div>
          </div>
        `;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: `In-Sync Support <${fromEmailAddr}>`,
            to: [from],
            reply_to: replyToEmail,
            subject: ackSubject,
            html: ackHtml,
          }),
        });

        // Log notification
        await supabase.from("support_ticket_notifications").insert({
          ticket_id: ticket.id,
          org_id: mainOrgId,
          channel: "email",
          recipient: from,
          subject: ackSubject,
          message_preview: `Reply acknowledgement for ${ticketNumber}`,
          status: "sent",
        });
      }
    } catch (emailErr) {
      console.error("[ticket-email-reply] Ack email error:", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticket_number: ticketNumber,
        message: "Reply added to ticket",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[ticket-email-reply] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
