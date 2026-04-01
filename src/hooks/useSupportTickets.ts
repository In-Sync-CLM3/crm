import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useOrgContext } from "@/hooks/useOrgContext";
import { toast } from "sonner";

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
  due_at: string | null;
  attachments: { name: string; url: string; type: string; size: number }[] | null;
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

export function useSupportTickets(filters?: { status?: string; priority?: string; category?: string; search?: string }) {
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
      if (filters?.search) {
        query = query.or(`ticket_number.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`);
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;
      return data as unknown as SupportTicket[];
    },
    enabled: !!orgId,
  });

  const createTicket = useMutation({
    mutationFn: async (ticket: CreateTicketInput) => {
      const filesToUpload = ticket.attachments || [];

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
          ticket_number: "TEMP",
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
          const emailSubject = `Your Support Ticket ${ticketNum} Has Been Received`;
          try {
            await supabase.functions.invoke("send-email", {
              body: {
                to: ticket.contact_email,
                subject: emailSubject,
                html: `
                  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333;">
                    <p style="font-size:15px;">Dear ${clientName},</p>
                    <p style="font-size:15px;">Thank you for reaching out to <strong>In-Sync</strong>.</p>
                    <p style="font-size:15px;">This is to confirm that your support ticket has been successfully created. Our team has been notified and will attend to your request at the earliest.</p>
                    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
                      <tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Ticket Number</td><td style="padding:10px 14px;border:1px solid #e5e7eb;">${ticketNum}</td></tr>
                      <tr><td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Subject</td><td style="padding:10px 14px;border:1px solid #e5e7eb;">${ticket.subject}</td></tr>
                      <tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Priority</td><td style="padding:10px 14px;border:1px solid #e5e7eb;">${priority}</td></tr>
                      <tr><td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Status</td><td style="padding:10px 14px;border:1px solid #e5e7eb;">${ticket.status || "Open"}</td></tr>
                      <tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;border:1px solid #e5e7eb;">Raised On</td><td style="padding:10px 14px;border:1px solid #e5e7eb;">${createdDate}</td></tr>
                    </table>
                    <p style="font-size:15px;">You will receive a notification as soon as your ticket is assigned to a team member.</p>
                    ${slaNote}
                    <p style="font-size:15px;margin-top:24px;">Thank you<br/><strong>Team In-Sync</strong></p>
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

      // Notify client on every status change
      if (updates.status) {
        const { data: ticket } = await supabase
          .from("support_tickets")
          .select("contact_email, contact_phone, contact_name, ticket_number, subject, resolution_notes")
          .eq("id", id)
          .single();
        if (ticket) {
          const t = ticket as any;
          const clientName = t.contact_name || "Valued Client";
          let notified = false;

          // Build status-specific email content
          const statusEmailMap: Record<string, { subject: string; body: string }> = {
            assigned: {
              subject: `Your Support Ticket ${t.ticket_number} Has Been Assigned`,
              body: `
                <p style="font-size:15px;">Dear ${clientName},</p>
                <p style="font-size:15px;">Your support ticket <strong>${t.ticket_number}</strong> regarding <strong>${t.subject}</strong> has been assigned to a team member.</p>
                <p style="font-size:15px;">Our team will begin working on your request shortly. You will be notified when work begins.</p>
                <p style="font-size:15px;">This is an automated email and replies to this address are not monitored.</p>
                <p style="font-size:15px;margin-top:24px;">Best regards,<br/><strong>Team In-Sync</strong></p>
              `,
            },
            in_progress: {
              subject: `Your Support Ticket ${t.ticket_number} Is Now In Progress`,
              body: `
                <p style="font-size:15px;">Dear ${clientName},</p>
                <p style="font-size:15px;">We wanted to let you know that your support ticket <strong>${t.ticket_number}</strong> regarding <strong>${t.subject}</strong> is now being actively worked on by our team.</p>
                <p style="font-size:15px;">We will keep you updated on the progress and notify you once it is resolved.</p>
                <p style="font-size:15px;">This is an automated email and replies to this address are not monitored.</p>
                <p style="font-size:15px;margin-top:24px;">Best regards,<br/><strong>Team In-Sync</strong></p>
              `,
            },
            awaiting_client: {
              subject: `Action Required: Your Support Ticket ${t.ticket_number}`,
              body: `
                <p style="font-size:15px;">Dear ${clientName},</p>
                <p style="font-size:15px;">We need your input on support ticket <strong>${t.ticket_number}</strong> regarding <strong>${t.subject}</strong>.</p>
                <p style="font-size:15px;">Our team requires additional information or confirmation from you to proceed further. Please respond at the earliest to avoid delays.</p>
                <p style="font-size:15px;">This is an automated email and replies to this address are not monitored. Please use the Help section on your platform to provide the required information.</p>
                <p style="font-size:15px;margin-top:24px;">Best regards,<br/><strong>Team In-Sync</strong></p>
              `,
            },
            resolved: {
              subject: `Your Support Ticket ${t.ticket_number} Has Been Resolved`,
              body: `
                <p style="font-size:15px;">Dear ${clientName},</p>
                <p style="font-size:15px;">Your support ticket <strong>${t.ticket_number}</strong> regarding <strong>${t.subject}</strong> has been successfully resolved.</p>
                ${t.resolution_notes ? `<p style="font-size:15px;"><strong>Resolution:</strong> ${t.resolution_notes}</p>` : ""}
                <p style="font-size:15px;">Please confirm the closure of this ticket from your platform. If you are still facing any issues, please raise a new ticket through the Help section.</p>
                <p style="font-size:15px;">This is an automated email and replies to this address are not monitored.</p>
                <p style="font-size:15px;margin-top:24px;">Best regards,<br/><strong>Team In-Sync</strong></p>
              `,
            },
            closed: {
              subject: `Your Support Ticket ${t.ticket_number} Has Been Closed`,
              body: `
                <p style="font-size:15px;">Dear ${clientName},</p>
                <p style="font-size:15px;">Your support ticket <strong>${t.ticket_number}</strong> regarding <strong>${t.subject}</strong> has been closed.</p>
                <p style="font-size:15px;">If you need further assistance, please raise a new ticket through the Help section on your platform.</p>
                <p style="font-size:15px;">This is an automated email and replies to this address are not monitored.</p>
                <p style="font-size:15px;margin-top:24px;">Best regards,<br/><strong>Team In-Sync</strong></p>
              `,
            },
          };

          const statusContent = statusEmailMap[updates.status];
          if (statusContent && t.contact_email) {
            const emailHtml = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333;">${statusContent.body}</div>`;
            try {
              await supabase.functions.invoke("send-email", {
                body: {
                  to: t.contact_email,
                  subject: statusContent.subject,
                  html: emailHtml,
                },
              });
              notified = true;
              await supabase.from("support_ticket_notifications").insert({
                ticket_id: id, org_id: orgId!, channel: "email",
                recipient: t.contact_email, subject: statusContent.subject,
                message_preview: `Ticket ${t.ticket_number} status changed to ${updates.status}`, status: "sent",
              } as any);
            } catch (emailErr: any) {
              await supabase.from("support_ticket_notifications").insert({
                ticket_id: id, org_id: orgId!, channel: "email",
                recipient: t.contact_email, subject: statusContent.subject,
                status: "failed", error_message: emailErr?.message || "Unknown error",
              } as any);
            }
          }

          // WhatsApp notification for all status changes
          if (statusContent && t.contact_phone) {
            const statusLabels: Record<string, string> = {
              assigned: "assigned to a team member",
              in_progress: "now being worked on",
              awaiting_client: "awaiting your response",
              resolved: `resolved${t.resolution_notes ? `. Resolution: ${t.resolution_notes}` : ""}`,
              closed: "closed",
            };
            const waMsg = `Your ticket ${t.ticket_number} (${t.subject}) has been ${statusLabels[updates.status] || updates.status}.`;
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
