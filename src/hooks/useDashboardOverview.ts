import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";

export interface RevenueMonth {
  month: string;
  invoiced: number;
  received: number;
  google_spend: number;
}

export interface OrganicChannel {
  channel: string;
  posts: number;
  reach: number;
  engagement: number;
  followers: number;
  follower_change: number;
}

export interface DashboardOverview {
  revenue_months: RevenueMonth[];
  organic: OrganicChannel[];
  paid: {
    google?: {
      spend: number; impressions: number; clicks: number; conversions: number;
      daily_budget: number | null; last_synced: string | null;
    };
    /** Null figures mean the funding ad account is unreadable, not that nothing was spent. */
    meta?: {
      spend: number | null; impressions: number | null; reach: number | null;
      clicks: number | null; results: number | null;
      accounts: number; last_synced: string | null;
    };
    meta_attempted?: {
      budget: number; blocked: number; failed: number; last_attempt: string | null;
    };
  };
  bd: {
    sourced: number; graded_a: number; graded_b: number; researched: number;
    contactable: number; drafted: number; pending_review: number;
    approved: number; rejected: number; last_reviewed_at: string | null;
    sequences_live: number; sequences_stopped: number; excluded: number;
    sent_unique_companies: number;
  };
  tickets: {
    raised_30d: number;
    open: number;
    overdue: number;
    monthly: { month: string; raised: number }[] | null;
  };
  /** Amit's personal job-application matching engine, not In-Sync hiring. */
  job_applications: {
    applied: number;
    evaluated: number;
  };
}

export interface RecentLead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  source: string | null;
  product: string | null;
  created_at: string;
}

/** One round trip for the five in-database panels. */
export function useDashboardOverview(months = 12) {
  const { effectiveOrgId } = useOrgContext();

  return useQuery({
    queryKey: ["dashboard-overview", effectiveOrgId, months],
    queryFn: async (): Promise<DashboardOverview> => {
      if (!effectiveOrgId) throw new Error("No organization context");
      const { data, error } = await supabase.rpc("get_dashboard_overview", {
        _org_id: effectiveOrgId,
        _months: months,
      });
      if (error) throw error;
      return data as unknown as DashboardOverview;
    },
    enabled: !!effectiveOrgId,
    staleTime: 60000,
  });
}

/**
 * Leads are not in this database — they land in globalcrm through
 * web-lead-intake, so the dashboard-leads function reads across for them.
 */
export function useRecentLeads() {
  const { effectiveOrgId } = useOrgContext();

  return useQuery({
    queryKey: ["dashboard-recent-leads", effectiveOrgId],
    queryFn: async (): Promise<RecentLead[]> => {
      const { data, error } = await supabase.functions.invoke("dashboard-leads", { body: {} });
      if (error) throw error;
      return (data?.leads || []) as RecentLead[];
    },
    enabled: !!effectiveOrgId,
    staleTime: 60000,
  });
}
