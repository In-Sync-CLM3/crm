import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov"];
const MAX_IMAGES = 6;
const MAX_VIDEOS = 2;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_SIZE = 10 * 1024 * 1024; // 10 MB

// Working hours: Monday-Friday 9:00 AM to 6:00 PM IST
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const WORK_HOURS_PER_DAY = WORK_END_HOUR - WORK_START_HOUR; // 9 hours

// SLA hours by priority (in working hours)
const SLA_HOURS: Record<string, number> = {
  critical: 4,
  high: 9,    // 1 working day
  medium: 18, // 2 working days
  low: 27,    // 3 working days
};

/**
 * Calculate due date based on working hours (Mon-Fri, 9AM-6PM IST).
 * Given a start time and number of working hours, returns the due date.
 */
function calculateDueDate(startDate: Date, workingHours: number): Date {
  // Convert to IST (UTC+5:30)
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(startDate.getTime() + IST_OFFSET);

  let remainingMinutes = workingHours * 60;
  let current = new Date(istTime);

  // If current time is outside working hours, move to next working period start
  current = moveToNextWorkingTime(current);

  while (remainingMinutes > 0) {
    const dayOfWeek = current.getUTCDay(); // 0=Sun, 6=Sat

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      current = moveToNextWorkingDay(current);
      continue;
    }

    const currentHour = current.getUTCHours();
    const currentMinute = current.getUTCMinutes();
    const currentMinutesInDay = currentHour * 60 + currentMinute;
    const workEndMinutes = WORK_END_HOUR * 60;

    // Minutes remaining in current work day
    const minutesLeftToday = workEndMinutes - currentMinutesInDay;

    if (minutesLeftToday <= 0) {
      // Past work hours, move to next working day
      current = moveToNextWorkingDay(current);
      continue;
    }

    if (remainingMinutes <= minutesLeftToday) {
      // Fits within today
      current = new Date(current.getTime() + remainingMinutes * 60 * 1000);
      remainingMinutes = 0;
    } else {
      // Consume rest of today, move to next working day
      remainingMinutes -= minutesLeftToday;
      current = moveToNextWorkingDay(current);
    }
  }

  // Convert back from IST to UTC
  return new Date(current.getTime() - IST_OFFSET);
}

function moveToNextWorkingTime(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getUTCDay();
  const hour = d.getUTCHours();

  // If weekend, move to Monday
  if (dayOfWeek === 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(WORK_START_HOUR, 0, 0, 0);
    return d;
  }
  if (dayOfWeek === 6) {
    d.setUTCDate(d.getUTCDate() + 2);
    d.setUTCHours(WORK_START_HOUR, 0, 0, 0);
    return d;
  }

  // If before work hours, move to start
  if (hour < WORK_START_HOUR) {
    d.setUTCHours(WORK_START_HOUR, 0, 0, 0);
    return d;
  }

  // If after work hours, move to next working day
  if (hour >= WORK_END_HOUR) {
    return moveToNextWorkingDay(d);
  }

  return d;
}

function moveToNextWorkingDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  // Skip weekends
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  d.setUTCHours(WORK_START_HOUR, 0, 0, 0);
  return d;
}

function formatDueDate(date: Date): string {
  // Format in IST for display
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getFileType(filename: string): "image" | "video" | "unknown" {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return "unknown";
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  };
  return mimeMap[ext] || "application/octet-stream";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, phone, subject, description, source, company_name, category, priority: reqPriority, attachments } = await req.json();

    // Validate required fields
    if (!name || !email || !subject || !description || !source) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: name, email, subject, description, source" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and normalize source
    const VALID_SOURCES = ["crm", "rmpl", "paisaa_saarthi", "whatsapp", "in_sync_website", "website", "email", "redefine", "smb_connect", "help_widget"];
    const normalizedSource = source.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!VALID_SOURCES.includes(normalizedSource)) {
      console.warn(`Unknown source "${source}", defaulting to help_widget`);
    }
    const validSource = VALID_SOURCES.includes(normalizedSource) ? normalizedSource : "help_widget";

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enforce length limits
    if (subject.length > 200 || description.length > 5000 || name.length > 100) {
      return new Response(
        JSON.stringify({ error: "Input exceeds maximum length" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate attachments if provided
    let validatedAttachments: { name: string; data: string; type: "image" | "video"; size: number }[] = [];
    if (attachments && Array.isArray(attachments)) {
      let imageCount = 0;
      let videoCount = 0;

      for (const att of attachments) {
        if (!att.name || !att.data) continue;
        const fileType = getFileType(att.name);
        if (fileType === "unknown") {
          return new Response(
            JSON.stringify({ error: `Unsupported file type: ${att.name}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Decode base64 to check size
        const binaryData = Uint8Array.from(atob(att.data), (c) => c.charCodeAt(0));
        const fileSize = binaryData.length;

        if (fileType === "image") {
          imageCount++;
          if (imageCount > MAX_IMAGES) {
            return new Response(
              JSON.stringify({ error: `Maximum ${MAX_IMAGES} images allowed` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (fileSize > MAX_IMAGE_SIZE) {
            return new Response(
              JSON.stringify({ error: `Image ${att.name} exceeds 5 MB limit` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          videoCount++;
          if (videoCount > MAX_VIDEOS) {
            return new Response(
              JSON.stringify({ error: `Maximum ${MAX_VIDEOS} videos allowed` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (fileSize > MAX_VIDEO_SIZE) {
            return new Response(
              JSON.stringify({ error: `Video ${att.name} exceeds 10 MB limit` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        validatedAttachments.push({ name: att.name, data: att.data, type: fileType, size: fileSize });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Use the main org (ECR TIPL)
    const mainOrgId = "65e22e43-f23d-4c0a-9d84-2eba65ad0e12";

    // Get a system user for created_by
    const { data: systemUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("org_id", mainOrgId)
      .limit(1)
      .single();

    if (!systemUser) {
      return new Response(
        JSON.stringify({ error: "System configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine priority and calculate SLA due date based on working hours
    const ticketPriority = reqPriority || "medium";
    const slaHours = SLA_HOURS[ticketPriority] || SLA_HOURS.medium;
    const now = new Date();
    const dueAt = calculateDueDate(now, slaHours);

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .insert({
        org_id: mainOrgId,
        created_by: systemUser.id,
        subject: subject.trim(),
        description: description.trim(),
        category: category || "general",
        priority: ticketPriority,
        contact_name: name.trim(),
        contact_email: email.trim(),
        contact_phone: phone?.trim() || null,
        company_name: company_name?.trim() || null,
        source: validSource,
        ticket_number: "TEMP",
        due_at: dueAt.toISOString(),
      })
      .select("ticket_number, id")
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create ticket" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upload attachments to storage
    const uploadedAttachments: { name: string; url: string; type: string; size: number }[] = [];
    if (validatedAttachments.length > 0) {
      for (const att of validatedAttachments) {
        const binaryData = Uint8Array.from(atob(att.data), (c) => c.charCodeAt(0));
        const filePath = `${mainOrgId}/${ticket.id}/${Date.now()}_${att.name}`;
        const mimeType = getMimeType(att.name);

        const { error: uploadError } = await supabase.storage
          .from("ticket-attachments")
          .upload(filePath, binaryData, { contentType: mimeType, upsert: false });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("ticket-attachments")
          .getPublicUrl(filePath);

        uploadedAttachments.push({
          name: att.name,
          url: urlData.publicUrl,
          type: att.type,
          size: att.size,
        });
      }

      // Update ticket with attachments
      if (uploadedAttachments.length > 0) {
        await supabase
          .from("support_tickets")
          .update({ attachments: uploadedAttachments })
          .eq("id", ticket.id);
      }
    }

    // Send confirmation email with ticket number, SLA info, and reply instructions
    try {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) {
        console.error("[submit-help-ticket] RESEND_API_KEY not configured, skipping email");
      } else {
        // Fetch org email settings to get verified sending domain
        const { data: emailSettings } = await supabase
          .from("email_settings")
          .select("sending_domain, verification_status, is_active")
          .eq("org_id", mainOrgId)
          .eq("is_active", true)
          .maybeSingle();

        const sendingDomain = emailSettings?.sending_domain && emailSettings.verification_status === "verified"
          ? emailSettings.sending_domain
          : "in-sync.app";
        const fromEmail = `noreply@${sendingDomain}`;
        const replyToEmail = `support+${ticket.ticket_number}@${sendingDomain}`;

        const dueDateFormatted = formatDueDate(dueAt);
        const createdDateFormatted = now.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        const priorityLabel = ticketPriority.charAt(0).toUpperCase() + ticketPriority.slice(1);
        const slaText = slaHours < WORK_HOURS_PER_DAY
          ? `${slaHours} working hours`
          : `${Math.ceil(slaHours / WORK_HOURS_PER_DAY)} working day(s)`;

        const emailSubject = `[${ticket.ticket_number}] Support Ticket Received - ${subject.trim()}`;
        const emailHtml = `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333;">
            <div style="background:#6366f1;padding:20px 24px;border-radius:12px 12px 0 0;">
              <h1 style="margin:0;font-size:20px;color:#fff;">Support Ticket Received</h1>
            </div>
            <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
              <p style="font-size:15px;margin-top:0;">Dear ${name.trim()},</p>
              <p style="font-size:15px;">Thank you for reaching out to <strong>In-Sync</strong>. Your support ticket has been successfully created. Our team has been notified and will attend to your request during working hours.</p>

              <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
                <tr style="background:#f3f4f6;">
                  <td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;width:40%;">Ticket Number</td>
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:700;color:#6366f1;">${ticket.ticket_number}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Subject</td>
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;">${subject.trim()}</td>
                </tr>
                <tr style="background:#f3f4f6;">
                  <td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Priority</td>
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;">${priorityLabel}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Raised On</td>
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;">${createdDateFormatted}</td>
                </tr>
                <tr style="background:#f3f4f6;">
                  <td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Expected Resolution By</td>
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;color:#059669;">${dueDateFormatted}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">SLA</td>
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;">${slaText}</td>
                </tr>
              </table>

              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:20px 0;">
                <p style="margin:0 0 8px;font-weight:600;font-size:14px;color:#1e40af;">How to follow up on this ticket</p>
                <p style="margin:0;font-size:13px;color:#1e40af;">Simply <strong>reply to this email</strong> to add additional information or ask questions about your ticket. Please keep the ticket number <strong>${ticket.ticket_number}</strong> in the subject line.</p>
              </div>

              <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:20px 0;">
                <p style="margin:0;font-size:13px;color:#92400e;"><strong>Working Hours:</strong> Monday to Friday, 9:00 AM to 6:00 PM IST. Resolution time is calculated based on working hours only.</p>
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
            to: [email.trim()],
            reply_to: replyToEmail,
            subject: emailSubject,
            html: emailHtml,
          }),
        });

        if (resendResponse.ok) {
          console.log("[submit-help-ticket] Confirmation email sent successfully");
          // Mark ticket as notified
          await supabase
            .from("support_tickets")
            .update({ client_notified: true, client_notified_at: new Date().toISOString() })
            .eq("id", ticket.id);

          // Log notification for audit trail
          await supabase.from("support_ticket_notifications").insert({
            ticket_id: ticket.id,
            org_id: mainOrgId,
            channel: "email",
            recipient: email.trim(),
            subject: emailSubject,
            message_preview: `Ticket ${ticket.ticket_number} received confirmation`,
            status: "sent",
          });
        } else {
          const resendError = await resendResponse.text();
          console.error("[submit-help-ticket] Resend API error:", resendResponse.status, resendError);
          // Log failed notification
          await supabase.from("support_ticket_notifications").insert({
            ticket_id: ticket.id,
            org_id: mainOrgId,
            channel: "email",
            recipient: email.trim(),
            subject: emailSubject,
            status: "failed",
            error_message: resendError,
          });
        }
      }
    } catch (emailErr) {
      console.error("[submit-help-ticket] Email notification error:", emailErr);
      // best-effort — don't fail ticket creation
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticket_number: ticket.ticket_number,
        due_at: dueAt.toISOString(),
        due_at_formatted: formatDueDate(dueAt),
        message: "Your ticket has been submitted successfully!"
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
