import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useOrgContext } from "@/hooks/useOrgContext";
import { toast } from "sonner";

// Working hours constants: Mon-Fri 9AM-6PM IST
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const WORK_HOURS_PER_DAY = WORK_END_HOUR - WORK_START_HOUR;
const IST_OFFSET = 5.5 * 60 * 60 * 1000;

const SLA_HOURS: Record<string, number> = {
  critical: 4,
  high: 9,
  medium: 18,
  low: 27,
};

function moveToNextWorkingDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  d.setUTCHours(WORK_START_HOUR, 0, 0, 0);
  return d;
}

function moveToNextWorkingTime(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getUTCDay();
  const hour = d.getUTCHours();
  if (dayOfWeek === 0) { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(WORK_START_HOUR, 0, 0, 0); return d; }
  if (dayOfWeek === 6) { d.setUTCDate(d.getUTCDate() + 2); d.setUTCHours(WORK_START_HOUR, 0, 0, 0); return d; }
  if (hour < WORK_START_HOUR) { d.setUTCHours(WORK_START_HOUR, 0, 0, 0); return d; }
  if (hour >= WORK_END_HOUR) return moveToNextWorkingDay(d);
  return d;
}

function calculateDueDate(startDate: Date, workingHours: number): Date {
  const istTime = new Date(startDate.getTime() + IST_OFFSET);
  let remainingMinutes = workingHours * 60;
  let current = moveToNextWorkingTime(new Date(istTime));

  while (remainingMinutes > 0) {
    const dayOfWeek = current.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) { current = moveToNextWorkingDay(current); continue; }
    const currentMinutesInDay = current.getUTCHours() * 60 + current.getUTCMinutes();
    const minutesLeftToday = WORK_END_HOUR * 60 - currentMinutesInDay;
    if (minutesLeftToday <= 0) { current = moveToNextWorkingDay(current); continue; }
    if (remainingMinutes <= minutesLeftToday) {
      current = new Date(current.getTime() + remainingMinutes * 60 * 1000);
      remainingMinutes = 0;
    } else {
      remainingMinutes -= minutesLeftToday;
      current = moveToNextWorkingDay(current);
    }
  }
  return new Date(current.getTime() - IST_OFFSET);
}

export interface SupportTicket {
  id: string;
  org_id: string;
  created_by: string;
  assigned_to: string | null;
  ticket_number: string;
  subject: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  company_name: string | null;
  source: string;
  due_at: string | null;
  attachments: { name: string; url: string; type: string; size: number }[] | null;
  client_notified: boolean;
  client_notified_at: string | null;
  created_at: string;
  updated_at: string;
  creator?: { first_name: string; last_name: string; email?: string };
  assignee?: { first_name: string; last_name: string } | null;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  org_id: string;
  user_id: string;
  comment: string;
  is_internal: boolean;
  created_at: string;
  user?: { first_name: string; last_name: string };
}

interface CreateTicketInput {
  subject: string;
  description: string;
  category: string;
  priority: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  company_name?: string;
  attachments?: File[];
}

async function uploadTicketAttachments(orgId: string, ticketId: string, files: File[]) {
  const uploaded: { name: string; url: string; type: string; size: number }[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
    const fileType = isImage ? "image" : "video";
    const filePath = `${orgId}/${ticketId}/${Date.now()}_${file.name}`;

    const { error } = await supabase.storage
      .from("ticket-attachments")
      .upload(filePath, file, { contentType: file.type, upsert: false });

    if (error) {
      console.error("Upload error:", error);
      continue;
    }

    const { data: urlData } = supabase.storage
      .from("ticket-attachments")
      .getPublicUrl(filePath);

    uploaded.push({ name: file.name, url: urlData.publicUrl, type: fileType, size: file.size });
  }
  return uploaded;
}

export function useSupportTickets(filters?: { status?: string; priority?: string; category?: string; source?: string; search?: string }) {
  const { user } = useAuth();
  const { effectiveOrgId: orgId } = useOrgContext();
  const queryClient = useQueryClient();

  const ticketsQuery = useQuery({
    queryKey: ["support-tickets", orgId, filters],
    queryFn: async () => {
      let query = supabase
        .from("support_tickets")
        .select("*, creator:profiles!support_tickets_created_by_fkey(first_name, last_name), assignee:profiles!support_tickets_assigned_to_fkey(first_name, last_name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.priority && filters.priority !== "all") {
        query = query.eq("priority", filters.priority);
      }
      if (filters?.category && filters.category !== "all") {
        query = query.eq("category", filters.category);
      }
      if (filters?.source && filters.source !== "all") {
        query = query.eq("source", filters.source);
      }
      if (filters?.search) {
        query = query.or(`ticket_number.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as SupportTicket[];
    },
    enabled: !!orgId,
  });

  const createTicket = useMutation({
    mutationFn: async (ticket: CreateTicketInput) => {
      const filesToUpload = ticket.attachments || [];

      // Calculate due date based on working hours (Mon-Fri 9AM-6PM IST)
      const slaHours = SLA_HOURS[ticket.priority] || SLA_HOURS.medium;
      const dueAt = calculateDueDate(new Date(), slaHours);

      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          org_id: orgId!,
          created_by: user!.id,
          subject: ticket.subject,
          description: ticket.description,
          category: ticket.category,
          priority: ticket.priority,
          contact_name: ticket.contact_name || null,
          contact_phone: ticket.contact_phone || null,
          contact_email: ticket.contact_email || null,
          company_name: ticket.company_name || null,
          source: "crm",
          ticket_number: "TEMP",
          due_at: dueAt.toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      // Upload attachments and update ticket
      if (filesToUpload.length > 0) {
        const uploaded = await uploadTicketAttachments(orgId!, (data as any).id, filesToUpload);
        if (uploaded.length > 0) {
          await supabase
            .from("support_tickets")
            .update({ attachments: uploaded } as any)
            .eq("id", (data as any).id);
        }
      }

      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      const ticketNum = (data as any).ticket_number || "NEW";
      toast.success(`Ticket ${ticketNum} created successfully`);

      // Fire-and-forget notifications
      try {
        const ticket = data as any;
        let notified = false;
        if (ticket.contact_email) {
          const clientName = ticket.contact_name || "Valued Client";
          const createdDate = new Date(ticket.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
          const priority = ticket.priority || "Medium";
          const slaMap: Record<string, string> = { Critical: "4 hours", High: "24 hours", Medium: "48 hours", Low: "72 hours" };
          const slaNote = (priority === "Critical" || priority === "High")
            ? `<p style="margin:16px 0;color:#b45309;font-size:14px;">For <strong>${priority}</strong> priority tickets, we aim to respond within <strong>${slaMap[priority]}</strong>.</p>`
            : "";
          const emailSubject = `[${ticketNum}] Support Ticket Received - ${ticket.subject}`;
          const dueDate = ticket.due_at ? new Date(ticket.due_at).toLocaleDateString("en-IN", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "As per SLA";
          try {
            await supabase.functions.invoke("send-email", {
              body: {
                to: ticket.contact_email,
                subject: emailSubject,
                html: `
                  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333;">
                    <div style="background:#6366f1;padding:20px 24px;border-radius:12px 12px 0 0;">
                      <h1 style="margin:0;font-size:20px;color:#fff;">Support Ticket Received</h1>
                    </div>
                    <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
                      <p style="font-size:15px;margin-top:0;">Dear ${clientName},</p>
                      <p style="font-size:15px;">Thank you for reaching out to <strong>In-Sync</strong>. Your support ticket has been successfully created.</p>
                      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
                        <tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;width:40%;">Ticket Number</td><td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:700;color:#6366f1;">${ticketNum}</td></tr>
                        <tr><td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Subject</td><td style="padding:10px 14px;border:1px solid #e5e7eb;">${ticket.subject}</td></tr>
                        <tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Priority</td><td style="padding:10px 14px;border:1px solid #e5e7eb;">${priority}</td></tr>
                        <tr><td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Raised On</td><td style="padding:10px 14px;border:1px solid #e5e7eb;">${createdDate}</td></tr>
                        <tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Expected Resolution</td><td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;color:#059669;">${dueDate}</td></tr>
                      </table>
                      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:20px 0;">
                        <p style="margin:0 0 8px;font-weight:600;font-size:14px;color:#1e40af;">How to follow up</p>
                        <p style="margin:0;font-size:13px;color:#1e40af;">Simply <strong>reply to this email</strong> to add information or ask questions about your ticket. Please keep the ticket number <strong>${ticketNum}</strong> in the subject line.</p>
                      </div>
                      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:20px 0;">
                        <p style="margin:0;font-size:13px;color:#92400e;"><strong>Working Hours:</strong> Monday to Friday, 9:00 AM to 6:00 PM IST. Resolution time is calculated based on working hours only.</p>
                      </div>
                      ${slaNote}
                      <p style="font-size:15px;margin-top:24px;">Best regards,<br/><strong>Team In-Sync</strong></p>
                    </div>
                  </div>
                `,
              },
            });
            notified = true;
            // Log email notification
            await supabase.from("support_ticket_notifications").insert({
              ticket_id: ticket.id,
              org_id: orgId!,
              channel: "email",
              recipient: ticket.contact_email,
              subject: emailSubject,
              message_preview: `Ticket ${ticketNum} received confirmation`,
              status: "sent",
            } as any);
          } catch (emailErr: any) {
            await supabase.from("support_ticket_notifications").insert({
              ticket_id: ticket.id,
              org_id: orgId!,
              channel: "email",
              recipient: ticket.contact_email,
              subject: emailSubject,
              status: "failed",
              error_message: emailErr?.message || "Unknown error",
            } as any);
          }
        }
        if (ticket.contact_phone) {
          const waMessage = `Your support ticket ${ticketNum} has been created. Subject: ${ticket.subject}. Our team will get back to you soon.`;
          try {
            await supabase.functions.invoke("send-whatsapp-message", {
              body: { to: ticket.contact_phone, message: waMessage },
            });
            notified = true;
            await supabase.from("support_ticket_notifications").insert({
              ticket_id: ticket.id,
              org_id: orgId!,
              channel: "whatsapp",
              recipient: ticket.contact_phone,
              message_preview: waMessage.substring(0, 200),
              status: "sent",
            } as any);
          } catch (waErr: any) {
            await supabase.from("support_ticket_notifications").insert({
              ticket_id: ticket.id,
              org_id: orgId!,
              channel: "whatsapp",
              recipient: ticket.contact_phone,
              message_preview: waMessage.substring(0, 200),
              status: "failed",
              error_message: waErr?.message || "Unknown error",
            } as any);
          }
        }
        // Mark ticket as client_notified
        if (notified) {
          await supabase
            .from("support_tickets")
            .update({ client_notified: true, client_notified_at: new Date().toISOString() } as any)
            .eq("id", ticket.id);
          queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
        }
      } catch {
        // notifications are best-effort
      }
    },
    onError: (error: Error) => {
      toast.error("Failed to create ticket: " + error.message);
    },
  });

  const updateTicket = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: string; assigned_to?: string | null; resolution_notes?: string }) => {
      const updateData: Record<string, unknown> = { ...updates };
      if (updates.status === "resolved") {
        updateData.resolved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("support_tickets")
        .update(updateData)
        .eq("id", id);
      if (error) throw error;

      // Log history
      const actions: { action: string; old_value?: string; new_value?: string }[] = [];
      if (updates.status) actions.push({ action: "status_changed", new_value: updates.status });
      if (updates.assigned_to !== undefined) actions.push({ action: "assigned", new_value: updates.assigned_to || "unassigned" });

      for (const a of actions) {
        await supabase.from("support_ticket_history").insert({
          ticket_id: id,
          org_id: orgId!,
          user_id: user!.id,
          action: a.action,
          old_value: a.old_value || null,
          new_value: a.new_value || null,
        });
      }

      // Notify client on resolution
      if (updates.status === "resolved") {
        const { data: ticket } = await supabase
          .from("support_tickets")
          .select("contact_email, contact_phone, contact_name, ticket_number, subject, resolution_notes")
          .eq("id", id)
          .single();
        if (ticket) {
          const t = ticket as any;
          let notified = false;
          const resolvedEmailSubject = `Your Support Ticket ${t.ticket_number} Has Been Resolved`;
          if (t.contact_email) {
            const clientName = t.contact_name || "Valued Client";
            try {
              await supabase.functions.invoke("send-email", {
                body: {
                  to: t.contact_email,
                  subject: resolvedEmailSubject,
                  html: `
                    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333;">
                      <div style="background:#059669;padding:20px 24px;border-radius:12px 12px 0 0;">
                        <h1 style="margin:0;font-size:20px;color:#fff;">Ticket Resolved</h1>
                      </div>
                      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
                        <p style="font-size:15px;margin-top:0;">Dear ${clientName},</p>
                        <p style="font-size:15px;">Your support ticket <strong>${t.ticket_number}</strong> regarding <strong>${t.subject}</strong> has been successfully resolved.</p>
                        ${t.resolution_notes ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0;"><p style="margin:0 0 4px;font-weight:600;font-size:13px;color:#166534;">Resolution Notes:</p><p style="margin:0;font-size:14px;color:#333;">${t.resolution_notes}</p></div>` : ""}
                        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:16px 0;">
                          <p style="margin:0;font-size:13px;color:#1e40af;">If you are still facing issues, simply <strong>reply to this email</strong> with ticket number <strong>${t.ticket_number}</strong> in the subject and your ticket will be reopened automatically.</p>
                        </div>
                        <p style="font-size:15px;margin-top:24px;">Best regards,<br/><strong>Team In-Sync</strong></p>
                      </div>
                    </div>
                  `,
                },
              });
              notified = true;
              await supabase.from("support_ticket_notifications").insert({
                ticket_id: id, org_id: orgId!, channel: "email",
                recipient: t.contact_email, subject: resolvedEmailSubject,
                message_preview: `Ticket ${t.ticket_number} resolved notification`, status: "sent",
              } as any);
            } catch (emailErr: any) {
              await supabase.from("support_ticket_notifications").insert({
                ticket_id: id, org_id: orgId!, channel: "email",
                recipient: t.contact_email, subject: resolvedEmailSubject,
                status: "failed", error_message: emailErr?.message || "Unknown error",
              } as any);
            }
          }
          if (t.contact_phone) {
            const waMsg = `Your ticket ${t.ticket_number} (${t.subject}) has been resolved.${t.resolution_notes ? ` Resolution: ${t.resolution_notes}` : ""}`;
            try {
              await supabase.functions.invoke("send-whatsapp-message", {
                body: { to: t.contact_phone, message: waMsg },
              });
              notified = true;
              await supabase.from("support_ticket_notifications").insert({
                ticket_id: id, org_id: orgId!, channel: "whatsapp",
                recipient: t.contact_phone, message_preview: waMsg.substring(0, 200), status: "sent",
              } as any);
            } catch (waErr: any) {
              await supabase.from("support_ticket_notifications").insert({
                ticket_id: id, org_id: orgId!, channel: "whatsapp",
                recipient: t.contact_phone, message_preview: waMsg.substring(0, 200),
                status: "failed", error_message: waErr?.message || "Unknown error",
              } as any);
            }
          }
          if (notified) {
            await supabase
              .from("support_tickets")
              .update({ client_notified: true, client_notified_at: new Date().toISOString() } as any)
              .eq("id", id);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-history"] });
      toast.success("Ticket updated");
    },
    onError: (error: Error) => {
      toast.error("Failed to update ticket: " + error.message);
    },
  });

  const deleteTicket = useMutation({
    mutationFn: async (id: string) => {
      // Delete all related records first (order matters for FK constraints)
      const { error: notifErr } = await supabase.from("support_ticket_notifications").delete().eq("ticket_id", id);
      if (notifErr) console.warn("Failed to delete notifications:", notifErr);
      const { error: escalationErr } = await supabase.from("support_ticket_escalations").delete().eq("ticket_id", id);
      if (escalationErr) console.warn("Failed to delete escalations:", escalationErr);
      const { error: commentsErr } = await supabase.from("support_ticket_comments").delete().eq("ticket_id", id);
      if (commentsErr) console.warn("Failed to delete comments:", commentsErr);
      const { error: historyErr } = await supabase.from("support_ticket_history").delete().eq("ticket_id", id);
      if (historyErr) console.warn("Failed to delete history:", historyErr);
      const { error, data } = await supabase.from("support_tickets").delete().eq("id", id).select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Ticket could not be deleted. You may not have permission.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      toast.success("Ticket deleted successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete ticket: " + error.message);
    },
  });

  return { ticketsQuery, createTicket, updateTicket, deleteTicket };
}

export function useTicketComments(ticketId: string | null) {
  const { user } = useAuth();
  const { effectiveOrgId: orgId } = useOrgContext();
  const queryClient = useQueryClient();

  const commentsQuery = useQuery({
    queryKey: ["ticket-comments", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_comments")
        .select("*, user:profiles!support_ticket_comments_user_id_fkey(first_name, last_name)")
        .eq("ticket_id", ticketId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as TicketComment[];
    },
    enabled: !!ticketId,
  });

  const addComment = useMutation({
    mutationFn: async ({ comment, is_internal }: { comment: string; is_internal: boolean }) => {
      const { error } = await supabase
        .from("support_ticket_comments")
        .insert({
          ticket_id: ticketId!,
          org_id: orgId!,
          user_id: user!.id,
          comment,
          is_internal,
        });
      if (error) throw error;

      // Log history
      await supabase.from("support_ticket_history").insert({
        ticket_id: ticketId!,
        org_id: orgId!,
        user_id: user!.id,
        action: is_internal ? "internal_note_added" : "comment_added",
        new_value: comment,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
      toast.success("Comment added");
    },
    onError: (error: Error) => {
      toast.error("Failed to add comment: " + error.message);
    },
  });

  return { commentsQuery, addComment };
}
