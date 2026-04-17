import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContextProvider as useOrgContext } from "@/contexts/OrgContextProvider";

export interface CampaignStat {
  id: string;
  name: string;
  channel: string;
  status: string;
  sequence_priority: number | null;
  isLive: boolean;
  enrolled: number;
  activeEnrollments: number;
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  converted: number;
  bounced: number;
  todaySent: number;
}

export interface PendingSuggestion {
  id: string;
  message: string;
  suggestion_payload: Record<string, unknown> | null;
  created_at: string;
}

export interface TechRequest {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
}

export function useArohanContext() {
  const { effectiveOrgId } = useOrgContext();
  const today = new Date().toISOString().split("T")[0];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["arohan-context", effectiveOrgId, today],
    queryFn: async () => {
      if (!effectiveOrgId) return null;

      const [
        campaignsRes,
        analyticsRes,
        todaySendsRes,
        contactsRes,
        pendingRes,
        techRequestsRes,
        liveLogRes,
      ] = await Promise.all([
        supabase
          .from("mkt_campaigns")
          .select("id, name, channel, status, sequence_priority")
          .eq("org_id", effectiveOrgId)
          .not("sequence_priority", "is", null)
          .order("sequence_priority", { ascending: true }),

        supabase.rpc("get_all_campaigns_analytics", { p_org_id: effectiveOrgId }),

        supabase
          .from("mkt_sequence_actions")
          .select("campaign_id, status")
          .eq("org_id", effectiveOrgId)
          .gte("created_at", `${today}T00:00:00Z`),

        supabase
          .from("contacts")
          .select("status")
          .eq("org_id", effectiveOrgId),

        supabase
          .from("mkt_arohan_conversations")
          .select("id, message, suggestion_payload, created_at")
          .eq("org_id", effectiveOrgId)
          .eq("role", "amit")
          .eq("is_suggestion", true)
          .eq("suggestion_applied", false)
          .order("created_at", { ascending: false })
          .limit(10),

        supabase
          .from("mkt_tech_requests")
          .select("id, title, description, priority, status, created_at")
          .eq("org_id", effectiveOrgId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(10),

        supabase
          .from("mkt_engine_logs")
          .select("details")
          .eq("function_name", "mkt-sequence-executor")
          .eq("action", "executor-start")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const liveCampaignId = (
        liveLogRes.data?.details as Record<string, unknown> | null
      )?.active_campaign as string | undefined;

      // Analytics map
      const analyticsMap = new Map<string, Record<string, unknown>>();
      for (const row of (analyticsRes.data ?? []) as Array<Record<string, unknown>>) {
        analyticsMap.set(row.campaign_id as string, row);
      }

      // Today's sends map
      const todayMap = new Map<string, number>();
      for (const row of (todaySendsRes.data ?? []) as Array<{ campaign_id: string; status: string }>) {
        if (["sent", "delivered", "pending"].includes(row.status)) {
          todayMap.set(row.campaign_id, (todayMap.get(row.campaign_id) ?? 0) + 1);
        }
      }

      const campaigns: CampaignStat[] = (campaignsRes.data ?? []).map((c) => {
        const a = analyticsMap.get(c.id) ?? {};
        return {
          id: c.id,
          name: c.name,
          channel: c.channel ?? "email",
          status: c.status,
          sequence_priority: c.sequence_priority,
          isLive: c.id === liveCampaignId,
          enrolled: (a.enrolled as number) ?? 0,
          activeEnrollments: (a.active_enrollments as number) ?? 0,
          sent: (a.sent as number) ?? 0,
          delivered: (a.delivered as number) ?? 0,
          opened: (a.opened as number) ?? 0,
          replied: (a.replied as number) ?? 0,
          converted: (a.converted as number) ?? 0,
          bounced: (a.bounced as number) ?? 0,
          todaySent: todayMap.get(c.id) ?? 0,
        };
      });

      // Contact funnel
      const funnel: Record<string, number> = {};
      for (const row of (contactsRes.data ?? []) as Array<{ status: string }>) {
        const s = row.status ?? "unknown";
        funnel[s] = (funnel[s] ?? 0) + 1;
      }

      const pending = (pendingRes.data ?? []) as PendingSuggestion[];
      const techRequests = (techRequestsRes.data ?? []) as TechRequest[];

      return { campaigns, funnel, pending, techRequests, liveCampaignId };
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 30_000,
  });

  return { context: data, isLoading, refetch };
}
