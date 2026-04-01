import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";

interface DueReminder {
  id: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  contact_company: string | null;
  next_action_date: string;
  next_action_notes: string | null;
  subject: string | null;
}

export function useCallbackReminders() {
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  const [dueReminders, setDueReminders] = useState<DueReminder[]>([]);
  const lastCheckedRef = useRef<string | null>(null);

  // Fetch activities with next_action_date within the next 5 minutes or already past
  const { data: activities, refetch } = useQuery({
    queryKey: ["callback-reminders", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Get current time and 5 minutes from now
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
      
      console.log('[useCallbackReminders] Checking for due reminders...');
      console.log('[useCallbackReminders] Now:', now.toISOString());
      console.log('[useCallbackReminders] Window end:', fiveMinutesFromNow.toISOString());

      // Fetch activities with next_action_date that are due or upcoming
      const { data, error } = await supabase
        .from("contact_activities")
        .select(`
          id,
          contact_id,
          next_action_date,
          next_action_notes,
          subject,
          reminder_sent,
          contacts!inner (
            id,
            first_name,
            last_name,
            phone,
            email,
            company
          )
        `)
        .eq("org_id", effectiveOrgId)
        .eq("created_by", user.id)
        .not("next_action_date", "is", null)
        .lte("next_action_date", fiveMinutesFromNow.toISOString())
        .gte("next_action_date", new Date(now.getTime() - 30 * 60 * 1000).toISOString()) // Include up to 30 min past due
        .or("reminder_sent.is.null,reminder_sent.eq.false")
        .order("next_action_date", { ascending: true })
        .limit(10);

      if (error) {
        console.error("[useCallbackReminders] Error fetching reminders:", error);
        return [];
      }

      console.log('[useCallbackReminders] Found activities:', data?.length || 0);

      if (!data || data.length === 0) return [];

      return data.map((activity: any) => ({
        id: activity.id,
        contact_id: activity.contact_id,
        contact_name: `${activity.contacts.first_name || ''} ${activity.contacts.last_name || ''}`.trim() || 'Unknown',
        contact_phone: activity.contacts.phone,
        contact_email: activity.contacts.email,
        contact_company: activity.contacts.company,
        next_action_date: activity.next_action_date,
        next_action_notes: activity.next_action_notes,
        subject: activity.subject,
      }));
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 120000, // Poll every 2 minutes
    staleTime: 60000,
  });

  // Update due reminders when activities change
  useEffect(() => {
    if (activities && activities.length > 0) {
      const now = new Date();
      const due = activities.filter((a: DueReminder) => {
        const actionDate = new Date(a.next_action_date);
        // Show reminder if it's within 2 minutes of now or past due
        return actionDate <= new Date(now.getTime() + 2 * 60 * 1000);
      });
      
      if (due.length > 0) {
        console.log('[useCallbackReminders] Due reminders:', due.length);
        setDueReminders(due);
      }
    }
  }, [activities]);

  // Mark a reminder as shown (update reminder_sent flag)
  const markReminderShown = useCallback(async (activityId: string) => {
    try {
      await supabase
        .from("contact_activities")
        .update({ reminder_sent: true })
        .eq("id", activityId);
      
      // Refetch to get updated data
      queryClient.invalidateQueries({ queryKey: ["callback-reminders"] });
    } catch (error) {
      console.error("[useCallbackReminders] Error marking reminder shown:", error);
    }
  }, [queryClient]);

  // Trigger a manual check for reminders
  const checkReminders = useCallback(async () => {
    console.log('[useCallbackReminders] Manual check triggered');
    await refetch();
  }, [refetch]);

  // Trigger the edge function to create notifications
  const triggerEdgeFunctionCheck = useCallback(async () => {
    if (!effectiveOrgId) return;
    
    try {
      console.log('[useCallbackReminders] Triggering edge function check...');
      const { error } = await supabase.functions.invoke('check-next-actions', {
        body: { org_id: effectiveOrgId },
      });
      
      if (error) {
        console.error('[useCallbackReminders] Edge function error:', error);
      } else {
        console.log('[useCallbackReminders] Edge function completed successfully');
        // Invalidate notifications to pick up any new ones
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
    } catch (error) {
      console.error('[useCallbackReminders] Error calling edge function:', error);
    }
  }, [effectiveOrgId, queryClient]);

  return {
    dueReminders,
    checkReminders,
    markReminderShown,
    triggerEdgeFunctionCheck,
  };
}
