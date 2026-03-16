import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketStatusBadge, TicketPriorityBadge } from "./TicketStatusBadge";
import { useTicketComments, type SupportTicket } from "@/hooks/useSupportTickets";
import { useTicketHistory } from "@/hooks/useTicketHistory";
import { useTicketNotifications } from "@/hooks/useTicketNotifications";
import { useTicketEscalations } from "@/hooks/useTicketEscalations";
import { useOrgContext } from "@/hooks/useOrgContext";
import { format, isPast, differenceInMinutes, isWeekend, nextMonday, setHours, setMinutes, setSeconds } from "date-fns";
import { MessageSquare, Clock, User, Phone, Mail, Building2, AlertTriangle, History, Paperclip, Image, Video, Trash2, Bell, CheckCircle, XCircle, ArrowUpRight, Upload, X, Timer } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TicketDetailDialogProps {
  ticket: SupportTicket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (id: string, status: string, resolution_notes?: string) => void;
  onAssign?: (id: string, userId: string | null) => void;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
  isAdmin?: boolean;
  teamMembers?: { id: string; first_name: string; last_name: string }[];
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * Calculate remaining working hours until due date.
 * Working hours: Mon-Fri 9AM-6PM IST (UTC+5:30)
 */
function getWorkingHoursRemaining(dueAt: string): { hours: number; label: string; isOverdue: boolean } {
  const now = new Date();
  const due = new Date(dueAt);

  if (now >= due) {
    // Calculate overdue working hours
    const overdue = calculateWorkingMinutesBetween(due, now);
    const hours = Math.floor(overdue / 60);
    const mins = overdue % 60;
    return { hours: -hours, label: `${hours}h ${mins}m overdue`, isOverdue: true };
  }

  const remaining = calculateWorkingMinutesBetween(now, due);
  const hours = Math.floor(remaining / 60);
  const mins = remaining % 60;
  return { hours, label: `${hours}h ${mins}m remaining`, isOverdue: false };
}

function calculateWorkingMinutesBetween(start: Date, end: Date): number {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  let current = new Date(start.getTime() + IST_OFFSET);
  const target = new Date(end.getTime() + IST_OFFSET);
  let totalMinutes = 0;

  while (current < target) {
    const day = current.getUTCDay();
    if (day === 0 || day === 6) {
      // Skip weekend
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(9, 0, 0, 0);
      continue;
    }

    const hour = current.getUTCHours();
    const minute = current.getUTCMinutes();

    if (hour < 9) {
      current.setUTCHours(9, 0, 0, 0);
      continue;
    }
    if (hour >= 18) {
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(9, 0, 0, 0);
      continue;
    }

    // Within working hours
    const endOfDay = new Date(current);
    endOfDay.setUTCHours(18, 0, 0, 0);
    const effectiveEnd = target < endOfDay ? target : endOfDay;
    const diff = Math.floor((effectiveEnd.getTime() - current.getTime()) / 60000);
    totalMinutes += Math.max(0, diff);

    current = new Date(endOfDay);
    if (current < target) {
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(9, 0, 0, 0);
    }
  }

  return totalMinutes;
}

export function TicketDetailDialog({ ticket, open, onOpenChange, onUpdateStatus, onAssign, onDelete, isDeleting, isAdmin, teamMembers }: TicketDetailDialogProps) {
  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEscalateForm, setShowEscalateForm] = useState(false);
  const [escalateTo, setEscalateTo] = useState("");
  const [escalateRemarks, setEscalateRemarks] = useState("");
  const [escalateFiles, setEscalateFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { commentsQuery, addComment } = useTicketComments(ticket?.id || null);
  const historyQuery = useTicketHistory(ticket?.id || null);
  const notificationsQuery = useTicketNotifications(ticket?.id || null);
  const { escalationsQuery, createEscalation } = useTicketEscalations(ticket?.id || null);
  const { userOrgId } = useOrgContext();

  if (!ticket) return null;

  const isOverdue = ticket.due_at && isPast(new Date(ticket.due_at)) && !["resolved", "closed"].includes(ticket.status);
  const attachments = ticket.attachments as { name: string; url: string; type: string; size: number }[] | null;
  const canEscalate = !["resolved", "closed"].includes(ticket.status);

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    addComment.mutate({ comment: newComment, is_internal: isInternal });
    setNewComment("");
  };

  const handleStatusChange = () => {
    if (!newStatus) return;
    onUpdateStatus(ticket.id, newStatus, newStatus === "resolved" ? resolutionNotes : undefined);
    setNewStatus("");
    setResolutionNotes("");
  };

  const handleEscalateSubmit = () => {
    if (!escalateTo || !escalateRemarks.trim() || !userOrgId) return;
    createEscalation.mutate(
      { ticketId: ticket.id, orgId: userOrgId, escalatedTo: escalateTo, remarks: escalateRemarks, files: escalateFiles },
      {
        onSuccess: () => {
          setShowEscalateForm(false);
          setEscalateTo("");
          setEscalateRemarks("");
          setEscalateFiles([]);
        },
      }
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => f.size <= 5 * 1024 * 1024);
    if (valid.length !== selected.length) {
      // Some files too large - silently skip
    }
    setEscalateFiles((prev) => [...prev, ...valid].slice(0, 4));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setEscalateFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const actionLabel = (action: string) => {
    const map: Record<string, string> = {
      status_changed: "Status changed to",
      assigned: "Assigned to",
      comment_added: "Comment added",
      internal_note_added: "Internal note added",
      escalated: "Escalated",
    };
    return map[action] || action;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-sm">{ticket.ticket_number}</span>
            <span>{ticket.subject}</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-4">
            {/* Ticket info */}
            <div className="flex flex-wrap gap-3 items-center text-sm">
              <TicketStatusBadge status={ticket.status} />
              <TicketPriorityBadge priority={ticket.priority} />
              <span className="text-muted-foreground capitalize">{ticket.category.replace("_", " ")}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 capitalize">
                {(ticket.source || "crm").replace(/_/g, " ")}
              </span>
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock size={14} />
                {format(new Date(ticket.created_at), "MMM d, yyyy h:mm a")}
              </span>
            </div>

            {/* SLA Deadline with Working Hours */}
            {ticket.due_at && (
              <div className="space-y-1">
                <div className={`flex items-center gap-1 text-sm ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {isOverdue && <AlertTriangle size={14} />}
                  <Clock size={14} />
                  Due: {format(new Date(ticket.due_at), "MMM d, yyyy h:mm a")}
                  {isOverdue && " (OVERDUE)"}
                </div>
                {!["resolved", "closed"].includes(ticket.status) && (() => {
                  const wh = getWorkingHoursRemaining(ticket.due_at);
                  return (
                    <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md w-fit ${wh.isOverdue ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                      <Timer size={12} />
                      <span>{wh.label} (working hours: Mon-Fri, 9AM-6PM IST)</span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Contact Details */}
            {(ticket.contact_name || ticket.contact_phone || ticket.contact_email || ticket.company_name) && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <p className="text-xs font-medium text-muted-foreground mb-2">Client Contact</p>
                {ticket.contact_name && (
                  <p className="flex items-center gap-2"><User size={14} className="text-muted-foreground" /> {ticket.contact_name}</p>
                )}
                {ticket.company_name && (
                  <p className="flex items-center gap-2"><Building2 size={14} className="text-muted-foreground" /> {ticket.company_name}</p>
                )}
                {ticket.contact_phone && (
                  <p className="flex items-center gap-2"><Phone size={14} className="text-muted-foreground" /> {ticket.contact_phone}</p>
                )}
                {ticket.contact_email && (
                  <p className="flex items-center gap-2"><Mail size={14} className="text-muted-foreground" /> {ticket.contact_email}</p>
                )}
              </div>
            )}

            {ticket.creator && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <User size={14} />
                Created by {ticket.creator.first_name} {ticket.creator.last_name}
              </div>
            )}

            {ticket.assignee && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <User size={14} />
                Assigned to {ticket.assignee.first_name} {ticket.assignee.last_name}
              </div>
            )}

            {ticket.description && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
              </div>
            )}

            {/* Attachments */}
            {attachments && attachments.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-1"><Paperclip size={14} /> Attachments ({attachments.length})</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {attachments.map((att, i) => (
                    <div key={i} className="border rounded-lg overflow-hidden bg-muted/30">
                      {att.type === "image" ? (
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={att.url} alt={att.name} className="w-full h-28 object-cover hover:opacity-80 transition-opacity" />
                        </a>
                      ) : (
                        <video src={att.url} controls className="w-full h-28 object-cover bg-black" />
                      )}
                      <div className="px-2 py-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        {att.type === "image" ? <Image size={12} /> : <Video size={12} />}
                        <span className="truncate flex-1">{att.name}</span>
                        <span>{formatFileSize(att.size)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ticket.resolution_notes && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-xs font-medium text-primary mb-1">Resolution Notes</p>
                <p className="text-sm">{ticket.resolution_notes}</p>
              </div>
            )}

            {/* Escalate to Senior Button */}
            {canEscalate && teamMembers && teamMembers.length > 0 && (
              <>
                <Separator />
                {!showEscalateForm ? (
                  <Button variant="outline" size="sm" onClick={() => setShowEscalateForm(true)} className="flex items-center gap-1">
                    <ArrowUpRight size={14} /> Escalate to Senior
                  </Button>
                ) : (
                  <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-1"><ArrowUpRight size={14} /> Escalate to Senior</Label>
                      <Button variant="ghost" size="sm" onClick={() => { setShowEscalateForm(false); setEscalateTo(""); setEscalateRemarks(""); setEscalateFiles([]); }}>
                        <X size={14} />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Assign to Senior</Label>
                      <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                        <Select value={escalateTo} onValueChange={setEscalateTo}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Select senior member" /></SelectTrigger>
                          <SelectContent onPointerDownOutside={(e) => e.stopPropagation()} onCloseAutoFocus={(e) => e.preventDefault()}>
                            {teamMembers.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.first_name} {m.last_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Remarks</Label>
                      <Textarea value={escalateRemarks} onChange={(e) => setEscalateRemarks(e.target.value)} placeholder="Why is this being escalated..." rows={3} />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Attach Images (max 4, 5MB each)</Label>
                      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={escalateFiles.length >= 4}>
                        <Upload size={14} className="mr-1" /> Add Images
                      </Button>
                      {escalateFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {escalateFiles.map((file, i) => (
                            <div key={i} className="relative border rounded-md overflow-hidden w-20 h-20">
                              <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                              <button onClick={() => removeFile(i)} className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5">
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => { setShowEscalateForm(false); setEscalateTo(""); setEscalateRemarks(""); setEscalateFiles([]); }}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleEscalateSubmit} disabled={!escalateTo || !escalateRemarks.trim() || createEscalation.isPending}>
                        {createEscalation.isPending ? "Escalating..." : "Submit Escalation"}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Admin actions */}
            {isAdmin && ticket.status !== "closed" && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Update Status</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="Change status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="awaiting_client">Awaiting Client</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={handleStatusChange} disabled={!newStatus}>Update</Button>
                  </div>
                  {newStatus === "resolved" && (
                    <Textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} placeholder="Resolution notes..." rows={2} />
                  )}

                  {/* Assignment */}
                  {teamMembers && teamMembers.length > 0 && onAssign && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Assign To</Label>
                      <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                        <Select
                          value={ticket.assigned_to || ""}
                          onValueChange={(val) => onAssign(ticket.id, val || null)}
                        >
                          <SelectTrigger className="w-52"><SelectValue placeholder="Select team member" /></SelectTrigger>
                          <SelectContent onPointerDownOutside={(e) => e.stopPropagation()} onCloseAutoFocus={(e) => e.preventDefault()}>
                            {teamMembers.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.first_name} {m.last_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Tabs: Comments, Notifications, Escalations, History */}
            <Separator />
            <Tabs defaultValue="comments">
              <TabsList className="flex-wrap">
                <TabsTrigger value="comments" className="flex items-center gap-1"><MessageSquare size={14} /> Comments</TabsTrigger>
                <TabsTrigger value="notifications" className="flex items-center gap-1"><Bell size={14} /> Notifications</TabsTrigger>
                <TabsTrigger value="escalations" className="flex items-center gap-1"><ArrowUpRight size={14} /> Escalations</TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-1"><History size={14} /> History</TabsTrigger>
              </TabsList>

              <TabsContent value="comments" className="space-y-3 mt-3">
                {commentsQuery.data?.map((comment) => (
                  <div key={comment.id} className={`rounded-lg p-3 text-sm ${comment.is_internal ? "bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800" : "bg-muted/50"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{comment.user?.first_name} {comment.user?.last_name}</span>
                      <span className="text-xs text-muted-foreground">{format(new Date(comment.created_at), "MMM d, h:mm a")}</span>
                      {comment.is_internal && <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-1.5 rounded">Internal</span>}
                    </div>
                    <p className="whitespace-pre-wrap">{comment.comment}</p>
                  </div>
                ))}

                {(!commentsQuery.data || commentsQuery.data.length === 0) && (
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                )}

                <div className="space-y-2">
                  <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment..." rows={2} />
                  <div className="flex items-center justify-between">
                    {isAdmin && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded" />
                        Internal note
                      </label>
                    )}
                    <Button size="sm" onClick={handleAddComment} disabled={!newComment.trim() || addComment.isPending}>
                      Add Comment
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="notifications" className="space-y-2 mt-3">
                {notificationsQuery.data?.map((notif) => (
                  <div key={notif.id} className="flex items-start gap-3 text-sm border rounded-lg p-3 bg-muted/30">
                    <div className="mt-0.5">
                      {notif.channel === "email" ? <Mail size={16} className="text-primary" /> : <Phone size={16} className="text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium capitalize">{notif.channel}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-muted-foreground truncate">{notif.recipient}</span>
                        <span className="ml-auto flex items-center gap-1">
                          {notif.status === "sent" ? (
                            <CheckCircle size={14} className="text-green-600" />
                          ) : (
                            <XCircle size={14} className="text-destructive" />
                          )}
                          <span className={`text-xs ${notif.status === "sent" ? "text-green-600" : "text-destructive"}`}>
                            {notif.status === "sent" ? "Sent" : "Failed"}
                          </span>
                        </span>
                      </div>
                      {notif.subject && (
                        <p className="text-xs text-muted-foreground truncate">Subject: {notif.subject}</p>
                      )}
                      {notif.error_message && (
                        <p className="text-xs text-destructive">{notif.error_message}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{format(new Date(notif.sent_at), "MMM d, yyyy h:mm a")}</p>
                    </div>
                  </div>
                ))}
                {(!notificationsQuery.data || notificationsQuery.data.length === 0) && (
                  <p className="text-sm text-muted-foreground">No notifications sent yet.</p>
                )}
              </TabsContent>

              <TabsContent value="escalations" className="space-y-3 mt-3">
                {escalationsQuery.data?.map((esc) => (
                  <div key={esc.id} className="border rounded-lg p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center gap-2 text-sm">
                      <ArrowUpRight size={14} className="text-primary" />
                      <span className="font-medium">
                        {esc.escalated_by_profile?.first_name} {esc.escalated_by_profile?.last_name}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">
                        {esc.escalated_to_profile?.first_name} {esc.escalated_to_profile?.last_name}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {format(new Date(esc.created_at), "MMM d, yyyy h:mm a")}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{esc.remarks}</p>
                    {esc.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {esc.attachments.map((att, i) => (
                          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={att.url} alt={att.name} className="w-20 h-20 object-cover rounded border hover:opacity-80 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {(!escalationsQuery.data || escalationsQuery.data.length === 0) && (
                  <p className="text-sm text-muted-foreground">No escalations yet.</p>
                )}
              </TabsContent>

              <TabsContent value="history" className="space-y-2 mt-3">
                {historyQuery.data?.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 text-sm border-l-2 border-muted pl-3 py-1">
                    <div>
                      <span className="text-muted-foreground">{format(new Date(entry.created_at), "MMM d, h:mm a")}</span>
                      {" — "}
                      <span className="font-medium">{entry.user?.first_name} {entry.user?.last_name}</span>
                      {" "}
                      <span>{actionLabel(entry.action)}</span>
                      {entry.new_value && <span className="font-medium"> {entry.new_value}</span>}
                    </div>
                  </div>
                ))}
                {(!historyQuery.data || historyQuery.data.length === 0) && (
                  <p className="text-sm text-muted-foreground">No history recorded yet.</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>

        {/* Delete button for admins */}
        {isAdmin && onDelete && (
          <div className="flex justify-end pt-2 border-t">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete Ticket
            </Button>
          </div>
        )}
      </DialogContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ticket {ticket.ticket_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this ticket along with all its comments and history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete!(ticket.id);
                setShowDeleteConfirm(false);
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
