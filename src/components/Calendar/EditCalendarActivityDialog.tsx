import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { useActivityMutations } from "@/hooks/useActivitiesOffline";
import { useTaskMutations } from "@/hooks/useTaskMutations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { CalendarEvent, CalendarEventType } from "@/types/calendar";
import { Loader2, AlertTriangle, Flag, Minus } from "lucide-react";

// IST timezone
const IST_TIMEZONE = "Asia/Kolkata";

type ActivityPriority = 'urgent' | 'important' | 'normal';

const priorityOptions: { value: ActivityPriority; label: string; icon: React.ElementType; className: string }[] = [
  { value: "urgent", label: "Urgent", icon: AlertTriangle, className: "text-destructive" },
  { value: "important", label: "Important", icon: Flag, className: "text-amber-500" },
  { value: "normal", label: "Normal", icon: Minus, className: "text-muted-foreground" },
];

interface EditCalendarActivityDialogProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const activityTypes: { value: CalendarEventType; label: string }[] = [
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "follow_up", label: "Follow-up" },
  { value: "visit", label: "Visit" },
  { value: "note", label: "Note" },
  { value: "task", label: "Task" },
];

export function EditCalendarActivityDialog({
  event,
  open,
  onOpenChange,
}: EditCalendarActivityDialogProps) {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();
  const { updateActivity: updateActivityOffline } = useActivityMutations();
  const { updateTask: updateTaskOffline } = useTaskMutations();

  const [activityType, setActivityType] = useState<CalendarEventType>("meeting");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [duration, setDuration] = useState("30");
  const [contactId, setContactId] = useState<string>("");
  const [meetingLink, setMeetingLink] = useState("");
  const [priority, setPriority] = useState<ActivityPriority>("normal");

  // Pre-fill form when event changes
  // The dateTime is already in IST from the hook
  useEffect(() => {
    if (event) {
      setActivityType(event.type);
      setSubject(event.title);
      setDescription(event.description || "");
      // event.dateTime is already in IST from useCalendarActivities
      setScheduledDate(format(event.dateTime, "yyyy-MM-dd"));
      setScheduledTime(format(event.dateTime, "HH:mm"));
      setDuration(String(event.duration || 30));
      setContactId(event.contactId || "");
      setMeetingLink(event.meetingLink || "");
      setPriority((event.priority as ActivityPriority) || "normal");
    }
  }, [event]);

  // Fetch contacts for selection
  const { data: contacts = [] } = useQuery({
    queryKey: ["calendar-contacts", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company")
        .eq("org_id", effectiveOrgId)
        .order("first_name")
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId && open,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!event) throw new Error("No event to update");

      // Parse scheduled datetime in IST and convert to UTC for storage
      const localISTDate = new Date(`${scheduledDate}T${scheduledTime}`);
      const scheduledAtUTC = fromZonedTime(localISTDate, IST_TIMEZONE);

      if (event.source === "task") {
        await new Promise<void>((resolve, reject) => {
          updateTaskOffline(
            {
              id: event.id,
              data: {
                title: subject,
                description,
                due_date: scheduledAtUTC.toISOString(),
                priority:
                  priority === "urgent"
                    ? "high"
                    : priority === "important"
                      ? "medium"
                      : "low",
              },
            },
            {
              onSuccess: () => resolve(),
              onError: (err: any) => reject(err),
            }
          );
        });
      } else {
        await updateActivityOffline.mutateAsync({
          id: event.id,
          data: {
            activity_type: activityType,
            subject,
            description,
            scheduled_at: scheduledAtUTC.toISOString(),
            duration_minutes: parseInt(duration) || 30,
            meeting_link: meetingLink || null,
            contact_id: contactId || null,
            priority,
          },
        });
      }
    },
    onSuccess: () => {
      notify.success("Updated", "Activity has been updated");
      queryClient.invalidateQueries({ queryKey: ["calendar-activities"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-tasks"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      notify.error("Error", error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      notify.error("Error", "Subject is required");
      return;
    }
    updateMutation.mutate();
  };

  const isTask = event?.source === "task";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {isTask ? "Task" : "Activity"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isTask && (
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={activityType} onValueChange={(v) => setActivityType(v as CalendarEventType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activityTypes.filter(t => t.value !== "task").map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Priority Selector */}
          <div className="space-y-2">
            <Label>Priority</Label>
            <div className="flex gap-2">
              {priorityOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPriority(option.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                      priority === option.value
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-muted/50 border-border hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${priority === option.value ? "" : option.className}`} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{isTask ? "Title" : "Subject"} *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={isTask ? "Task title" : "Activity subject"}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Time</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
            {!isTask && (
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  min="5"
                  step="5"
                />
              </div>
            )}
          </div>

          {!isTask && (
            <div className="space-y-2">
              <Label>Contact <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={contactId} onValueChange={(v) => setContactId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a contact (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No contact</SelectItem>
                  {contacts.map((contact: any) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.first_name} {contact.last_name}
                      {contact.company && ` (${contact.company})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {activityType === "meeting" && !isTask && (
            <div className="space-y-2">
              <Label>Meeting Link</Label>
              <Input
                type="url"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/..."
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes or details..."
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
