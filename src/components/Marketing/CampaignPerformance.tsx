import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState } from "@/components/common/LoadingState";
import { Megaphone, Radio } from "lucide-react";

interface CampaignPerformanceProps {
  days: number;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  leads: number;
  enrollments: number;
  actions: number;
  budget: number;
  spent: number;
  isLive?: boolean;
}

function formatRupees(paise: number): string {
  const r = Math.round((paise ?? 0) / 100);
  if (Math.abs(r) >= 100000) return `\u20B9${(r / 100000).toFixed(2)}L`;
  return `\u20B9${r.toLocaleString("en-IN")}`;
}

function statusBadge(status: string) {
  const lower = status.toLowerCase();
  if (lower === "active") {
    return (
      <Badge className="bg-green-500 hover:bg-green-600 text-white">
        Active
      </Badge>
    );
  }
  if (lower === "paused") {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600 text-white">
        Paused
      </Badge>
    );
  }
  return <Badge variant="secondary">{status}</Badge>;
}

export function CampaignPerformance({ days }: CampaignPerformanceProps) {
  const { effectiveOrgId } = useOrgContext();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["mkt-dashboard-campaigns", effectiveOrgId, days],
    queryFn: async () => {
      if (!effectiveOrgId) return [];

      const [analyticsRes, metaRes, liveLogRes] = await Promise.all([
        supabase.rpc("get_all_campaigns_analytics", { p_org_id: effectiveOrgId }),
        supabase
          .from("mkt_campaigns")
          .select("id, campaign_type, budget, budget_spent")
          .eq("org_id", effectiveOrgId),
        supabase
          .from("mkt_engine_logs")
          .select("details")
          .eq("function_name", "mkt-sequence-executor")
          .eq("action", "executor-start")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (analyticsRes.error) throw analyticsRes.error;

      const analytics = (analyticsRes.data ?? []) as Array<Record<string, unknown>>;
      const metaMap = new Map(
        ((metaRes.data ?? []) as Array<Record<string, unknown>>).map((c) => [c.id, c])
      );
      const liveCampaignId = (liveLogRes.data?.details as Record<string, unknown> | null)?.active_campaign as string | undefined;

      return analytics.map((row) => {
        const meta = metaMap.get(row.campaign_id as string) as Record<string, unknown> | undefined;
        return {
          id: row.campaign_id as string,
          name: row.campaign_name as string,
          type: (meta?.campaign_type as string) ?? "",
          status: row.campaign_status as string,
          budget: (meta?.budget as number) ?? 0,
          spent: (meta?.budget_spent as number) ?? 0,
          leads: (row.enrolled as number) ?? 0,
          enrollments: (row.active_enrollments as number) ?? 0,
          actions: ((row.sent as number) ?? 0) + ((row.failed as number) ?? 0),
          isLive: row.campaign_id === liveCampaignId,
        } as Campaign;
      });
    },
    enabled: !!effectiveOrgId,
  });

  if (isLoading) return <LoadingState message="Loading campaigns..." />;

  if (campaigns.length === 0) {
    return (
      <Card className="p-3">
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Megaphone className="h-10 w-10 mb-3 opacity-50" />
          <p className="text-sm">No campaigns found for this period.</p>
          <p className="text-xs mt-1">
            Campaigns will appear here once they are created in the marketing engine.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-3">
      <CardHeader className="p-0 pb-3">
        <CardTitle className="text-sm">Campaign Performance</CardTitle>
        <p className="text-[10px] text-muted-foreground">
          All campaigns in the last {days} days, sorted by newest first
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs text-center">Status</TableHead>
              <TableHead className="text-xs text-right">Leads</TableHead>
              <TableHead className="text-xs text-right">Enrollments</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
              <TableHead className="text-xs text-right">Budget</TableHead>
              <TableHead className="text-xs text-right">Spent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.id}>
                <TableCell className="text-xs font-medium max-w-[200px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {campaign.isLive && (
                      <span className="relative flex-shrink-0 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                    )}
                    <span className="truncate">{campaign.name}</span>
                    {campaign.isLive && (
                      <span className="flex-shrink-0 text-[9px] font-bold text-green-600 uppercase tracking-wide">Live</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs capitalize">
                  {campaign.type}
                </TableCell>
                <TableCell className="text-xs text-center">
                  {statusBadge(campaign.status)}
                </TableCell>
                <TableCell className="text-xs text-right">
                  {(campaign.leads ?? 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-right">
                  {(campaign.enrollments ?? 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-right">
                  {(campaign.actions ?? 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-right">
                  {formatRupees(campaign.budget)}
                </TableCell>
                <TableCell className="text-xs text-right">
                  {formatRupees(campaign.spent)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
