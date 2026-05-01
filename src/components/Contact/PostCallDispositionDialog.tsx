import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { updateCallLogDispositionOffline } from "@/services/sync/callLogsSync";
import { useActivityMutations } from "@/hooks/useActivitiesOffline";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotification } from "@/hooks/useNotification";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { format } from "date-fns";
import { updateContactStageToContacted } from "@/utils/pipelineStageUtils";

interface CallDisposition {
  id: string;
  name: string;
  category: string;
}

interface CallSubDisposition {
  id: string;
  disposition_id: string;
  name: string;
}

interface PostCallDispositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callLogId: string;
  contactId: string | null;
  callDuration: number;
  onDispositionSaved?: () => void;
}

export function PostCallDispositionDialog({
  open,
  onOpenChange,
  callLogId,
  contactId,
  callDuration,
  onDispositionSaved,
}: PostCallDispositionDialogProps) {
  const notify = useNotification();
  const { createActivity: createActivityOffline } = useActivityMutations();
  const [loading, setLoading] = useState(false);
  const [dispositions, setDispositions] = useState<CallDisposition[]>([]);
  const [subDispositions, setSubDispositions] = useState<CallSubDisposition[]>([]);
  const [filteredSubDispositions, setFilteredSubDispositions] = useState<CallSubDisposition[]>([]);

  const [formData, setFormData] = useState({
    disposition_id: "",
    sub_disposition_id: "",
    notes: "",
  });
  const [callbackDateTime, setCallbackDateTime] = useState<Date | null>(null);
  const [selectedDispositionCategory, setSelectedDispositionCategory] = useState<string>("");


  useEffect(() => {
    if (formData.disposition_id) {
      const filtered = subDispositions.filter(
        sub => sub.disposition_id === formData.disposition_id
      );
      setFilteredSubDispositions(filtered);
    } else {
      setFilteredSubDispositions([]);
    }
  }, [formData.disposition_id, subDispositions]);

  const { data: dispositionsData } = useQuery({
    queryKey: ['call-dispositions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_dispositions")
        .select("id, name, category")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: subDispositionsData } = useQuery({
    queryKey: ['call-sub-dispositions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_sub_dispositions")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (dispositionsData) setDispositions(dispositionsData);
    if (subDispositionsData) setSubDispositions(subDispositionsData);
  }, [dispositionsData, subDispositionsData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.disposition_id) {
      notify.error("Disposition required", new Error("Please select a call disposition"));
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (!profile?.org_id) throw new Error("Organization not found");

      const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

      // Queue / write the call-log disposition update through the offline
      // helper. Online: this also fires the Supabase update immediately.
      await updateCallLogDispositionOffline({
        callLogId,
        dispositionId: formData.disposition_id,
        subDispositionId: formData.sub_disposition_id || null,
        notes: formData.notes || null,
      });

      // Create the contact activity through the offline-aware mutation so
      // it queues if we're offline.
      if (contactId) {
        const activityResult = await createActivityOffline.mutateAsync({
          contact_id: contactId,
          activity_type: "call",
          subject: "Call completed",
          description:
            formData.notes ||
            `Call duration: ${Math.floor(callDuration / 60)}m ${callDuration % 60}s`,
          completed_at: new Date().toISOString(),
          next_action_date: callbackDateTime?.toISOString() || null,
          next_action_notes: callbackDateTime
            ? `Callback scheduled for ${format(callbackDateTime, "PPP 'at' p")}`
            : null,
        });

        // Server-side fields and pipeline stage update need network — defer
        // these when offline.
        if (
          isOnline &&
          activityResult.id &&
          !activityResult.id.startsWith("local_")
        ) {
          // Persist call disposition columns the activity hook doesn't model.
          await supabase
            .from("contact_activities")
            .update({
              call_disposition_id: formData.disposition_id,
              call_sub_disposition_id: formData.sub_disposition_id || null,
              call_duration: callDuration,
            })
            .eq("id", activityResult.id);

          // Link the new activity to the call log.
          await supabase
            .from("call_logs")
            .update({ activity_id: activityResult.id })
            .eq("id", callLogId);

          // Move pipeline stage from New → Contacted.
          await updateContactStageToContacted(contactId);
        }
      }

      notify.success(
        "Disposition saved",
        isOnline
          ? "Call disposition has been recorded successfully"
          : "Saved offline. Disposition and follow-up will sync when online."
      );

      resetForm();
      onOpenChange(false);
      if (onDispositionSaved) onDispositionSaved();
    } catch (error: any) {
      notify.error("Error", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      disposition_id: "",
      sub_disposition_id: "",
      notes: "",
    });
    setCallbackDateTime(null);
    setSelectedDispositionCategory("");
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Call Disposition</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Call duration: {formatDuration(callDuration)}
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="disposition">Call Disposition *</Label>
            <Select
              value={formData.disposition_id}
              onValueChange={(value) => {
                const disp = dispositions.find(d => d.id === value);
                setSelectedDispositionCategory(disp?.category || "");
                setFormData({ ...formData, disposition_id: value, sub_disposition_id: "" });
                setCallbackDateTime(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select disposition" />
              </SelectTrigger>
              <SelectContent>
                {dispositions.map((disp) => (
                  <SelectItem key={disp.id} value={disp.id}>
                    {disp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredSubDispositions.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="sub_disposition">Sub-Disposition</Label>
              <Select
                value={formData.sub_disposition_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, sub_disposition_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sub-disposition" />
                </SelectTrigger>
                <SelectContent>
                  {filteredSubDispositions.map((subDisp) => (
                    <SelectItem key={subDisp.id} value={subDisp.id}>
                      {subDisp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              placeholder="Add any notes about this call..."
            />
          </div>

          {selectedDispositionCategory === "follow_up" && 
           filteredSubDispositions.some(sd => sd.id === formData.sub_disposition_id && sd.name.toLowerCase().includes("specific time")) && (
            <div className="space-y-2">
              <Label htmlFor="callback-datetime">Callback Date & Time *</Label>
              <DateTimePicker
                value={callbackDateTime}
                onChange={setCallbackDateTime}
                minDate={new Date()}
                label="Select callback date and time"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              className="flex-1"
            >
              Skip
            </Button>
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={loading || 
                (selectedDispositionCategory === "follow_up" && 
                 filteredSubDispositions.some(sd => sd.id === formData.sub_disposition_id && sd.name.toLowerCase().includes("specific time")) && 
                 !callbackDateTime)}
            >
              {loading ? "Saving..." : "Save Disposition"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
