import { useState, useMemo } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, addMonths, addYears } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { CalendarEventType } from "@/types/calendar";
import { Loader2, Repeat, Info, AlertTriangle, Flag, Minus } from "lucide-react";
import { generateRecurrenceInstances, countRecurrenceInstances, dayLabels } from "@/utils/recurrenceGenerator";

// IST timezone
const IST_TIMEZONE = "Asia/Kolkata";

type ActivityPriority = 'urgent' | 'important' | 'normal';

const priorityOptions: { value: ActivityPriority; label: string; icon: React.ElementType; className: string }[] = [
  { value: "urgent", label: "Urgent", icon: AlertTriangle, className: "text-destructive" },
  { value: "important", label: "Important", icon: Flag, className: "text-amber-500" },
  { value: "normal", label: "Normal", icon: Minus, className: "text-muted-foreground" },
];

interface CreateCalendarActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date;
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

export function CreateCalendarActivityDialog({
  open,
  onOpenChange,
  selectedDate,
}: CreateCalendarActivityDialogProps) {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();
  const { createActivity: createActivityOffline } = useActivityMutations();
  const { createTask: createTaskOffline } = useTaskMutations();

  const [activityType, setActivityType] = useState<CalendarEventType>("meeting");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [duration, setDuration] = useState("30");
  const [contactId, setContactId] = useState<string>("");
  const [meetingLink, setMeetingLink] = useState("");
  
  // Priority state
  const [priority, setPriority] = useState<ActivityPriority>("normal");
  
  // Recurrence state
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [durationValue, setDurationValue] = useState("3");
  const [durationType, setDurationType] = useState<'months' | 'years'>('months');

  // Calculate recurrence preview
  const recurrencePreview = useMemo(() => {
    if (!isRecurring || selectedDays.length === 0 || parseInt(durationValue) <= 0) {
      return null;
    }
    
    const count = countRecurrenceInstances({
      startDate: selectedDate,
      daysOfWeek: selectedDays,
      durationType,
      durationValue: parseInt(durationValue),
    });

    const endDate = durationType === 'months'
      ? addMonths(selectedDate, parseInt(durationValue))
      : addYears(selectedDate, parseInt(durationValue));

    return {
      count,
      endDate,
    };
  }, [isRecurring, selectedDays, durationValue, durationType, selectedDate]);

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

  const toggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const createActivityMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !effectiveOrgId) throw new Error("Not authenticated");

      // Parse scheduled time and convert from IST to UTC for storage
      const [hours, minutes] = scheduledTime.split(":").map(Number);
      const localISTDate = new Date(selectedDate);
      localISTDate.setHours(hours, minutes, 0, 0);
      // Convert IST time to UTC for database storage
      const scheduledAtUTC = fromZonedTime(localISTDate, IST_TIMEZONE);

      if (isRecurring && selectedDays.length > 0) {
        // Create recurring pattern first
        const endDate = durationType === 'months'
          ? addMonths(selectedDate, parseInt(durationValue))
          : addYears(selectedDate, parseInt(durationValue));

        const { data: pattern, error: patternError } = await supabase
          .from("recurring_activity_patterns")
          .insert({
            org_id: effectiveOrgId,
            created_by: user.id,
            activity_type: activityType,
            subject,
            description,
            scheduled_time: scheduledTime,
            duration_minutes: parseInt(duration) || 30,
            days_of_week: selectedDays,
            start_date: format(selectedDate, 'yyyy-MM-dd'),
            end_date: format(endDate, 'yyyy-MM-dd'),
            contact_id: contactId || null,
            meeting_link: meetingLink || null,
            is_task: activityType === "task",
            assigned_to: activityType === "task" ? user.id : null,
            priority: activityType === "task" ? "medium" : null,
          })
          .select()
          .single();

        if (patternError) throw patternError;

        // Generate all instances
        const instances = generateRecurrenceInstances({
          startDate: selectedDate,
          daysOfWeek: selectedDays,
          durationType,
          durationValue: parseInt(durationValue),
          scheduledTime,
        });

        if (activityType === "task") {
          // Bulk insert tasks
          const tasksToInsert = instances.map(instance => ({
            org_id: effectiveOrgId,
            title: subject,
            description,
            due_date: instance.scheduledAt.toISOString(),
            assigned_by: user.id,
            assigned_to: user.id,
            status: "pending",
            priority: "medium",
            recurring_pattern_id: pattern.id,
          }));

          const { error } = await supabase.from("tasks").insert(tasksToInsert);
          if (error) throw error;
        } else {
          // Bulk insert activities
          const activitiesToInsert = instances.map(instance => ({
            org_id: effectiveOrgId,
            contact_id: contactId || null,
            activity_type: activityType,
            subject,
            description,
            scheduled_at: instance.scheduledAt.toISOString(),
            duration_minutes: parseInt(duration) || 30,
            meeting_link: meetingLink || null,
            created_by: user.id,
            recurring_pattern_id: pattern.id,
            priority,
          }));

          const { error } = await supabase.from("contact_activities").insert(activitiesToInsert);
          if (error) throw error;
        }
      } else {
        // Single activity/task creation — route through offline-aware hooks
        // so writes queue and sync if currently offline.
        if (activityType === "task") {
          await new Promise<void>((resolve, reject) => {
            createTaskOffline(
              {
                title: subject,
                description: description || undefined,
                assigned_to: user.id,
                due_date: scheduledAtUTC.toISOString(),
                priority: "medium",
              },
              {
                onSuccess: () => resolve(),
                onError: (err: any) => reject(err),
              }
            );
          });
        } else {
          await createActivityOffline.mutateAsync({
            contact_id: contactId || null,
            activity_type: activityType,
            subject,
            description,
            scheduled_at: scheduledAtUTC.toISOString(),
            duration_minutes: parseInt(duration) || 30,
            meeting_link: meetingLink || null,
            priority,
          });
        }
      }
    },
    onSuccess: () => {
      const message = isRecurring && recurrencePreview
        ? `Created ${recurrencePreview.count} recurring activities`
        : "Activity added to calendar";
      notify.success("Created", message);
      queryClient.invalidateQueries({ queryKey: ["calendar-activities"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-tasks"] });
      handleClose();
    },
    onError: (error: any) => {
      notify.error("Error", error.message);
    },
  });

  const handleClose = () => {
    setSubject("");
    setDescription("");
    setScheduledTime("09:00");
    setDuration("30");
    setContactId("");
    setMeetingLink("");
    setActivityType("meeting");
    setPriority("normal");
    setIsRecurring(false);
    setSelectedDays([]);
    setDurationValue("3");
    setDurationType("months");
    onOpenChange(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      notify.error("Error", "Subject is required");
      return;
    }
    if (isRecurring && selectedDays.length === 0) {
      notify.error("Error", "Please select at least one day for recurring activity");
      return;
    }
    createActivityMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Create Activity - {format(selectedDate, "MMMM d, yyyy")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={activityType} onValueChange={(v) => setActivityType(v as CalendarEventType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activityTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority Selector - only for non-task activities */}
          {activityType !== "task" && (
            <div className="space-y-2">
              <Label>Category</Label>
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
          )}

          <div className="space-y-2">
            <Label>Subject *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Activity subject"
              required
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
          </div>

          {activityType !== "task" && (
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

          {activityType === "meeting" && (
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

          {/* Recurring Activity Section */}
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="recurring-toggle" className="cursor-pointer">
                  Repeat this activity
                </Label>
              </div>
              <Switch
                id="recurring-toggle"
                checked={isRecurring}
                onCheckedChange={setIsRecurring}
              />
            </div>

            {isRecurring && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">Repeat on</Label>
                  <div className="flex gap-1">
                    {dayLabels.map((label, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => toggleDay(index)}
                        className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                          selectedDays.includes(index)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80 text-muted-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">For duration of</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={durationValue}
                      onChange={(e) => setDurationValue(e.target.value)}
                      min="1"
                      max="24"
                      className="w-20"
                    />
                    <Select value={durationType} onValueChange={(v) => setDurationType(v as 'months' | 'years')}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="months">Months</SelectItem>
                        <SelectItem value="years">Years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {recurrencePreview && (
                  <div className="flex items-start gap-2 p-3 bg-background rounded-md text-sm">
                    <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">
                      Creates <span className="font-medium text-foreground">{recurrencePreview.count}</span> activities until{" "}
                      <span className="font-medium text-foreground">
                        {format(recurrencePreview.endDate, "MMM d, yyyy")}
                      </span>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createActivityMutation.isPending}>
              {createActivityMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {isRecurring && recurrencePreview ? `Create ${recurrencePreview.count}` : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
