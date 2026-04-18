import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState } from "@/components/common/LoadingState";
import { Megaphone, Globe } from "lucide-react";

const STEP1_TARGET = 1000;

interface CampaignStat {
  campaign_id: string;
  name: string;
  product_key: string;
  status: string;
  sequence_priority: number | null;
  step1_sent: number;
  step1_failed: number;
  total_enrollments: number;
  active_enrollments: number;
  total_opens: number;
  total_clicks: number;
  total_replies: number;
}

interface Ga4Row {
  product_key: string;
  sessions: number;
  active_users: number;
  engaged_sessions: number;
}

function pct(num: number, den: number) {
  if (!den) return "—";
  return `${((num / den) * 100).toFixed(1)}%`;
}

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

  // Sequence stats
  const { data: seqStats = [] } = useQuery<CampaignStat[]>({
    queryKey: ["mkt-campaign-stats", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase.rpc("mkt_campaign_stats", { p_org_id: effectiveOrgId });
      if (error) throw error;
      return (data as CampaignStat[]) || [];
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60_000,
  });

  // GA4 landing traffic — aggregate by product
  const { data: ga4Rows = [] } = useQuery<Ga4Row[]>({
    queryKey: ["mkt-ga4-traffic-agg", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_ga4_traffic")
        .select("product_key, sessions, active_users, engaged_sessions")
        .eq("org_id", effectiveOrgId)
        .gte("date", new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10));
      if (error) throw error;
      const agg: Record<string, Ga4Row> = {};
      for (const r of data || []) {
        if (!agg[r.product_key]) agg[r.product_key] = { product_key: r.product_key, sessions: 0, active_users: 0, engaged_sessions: 0 };
        agg[r.product_key].sessions        += r.sessions;
        agg[r.product_key].active_users    += r.active_users;
        agg[r.product_key].engaged_sessions += r.engaged_sessions;
      }
      return Object.values(agg).sort((a, b) => b.sessions - a.sessions);
    },
    enabled: !!effectiveOrgId,
  });

  // Build clicks lookup from seqStats (campaign_id → total_clicks)
  const clicksMap = new Map(seqStats.map((s) => [s.campaign_id, Number(s.total_clicks)]));

  return (
    <div className="space-y-4">
      {/* Existing campaign table */}
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
                <TableHead className="text-xs text-right">Clicks</TableHead>
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
                  <TableCell className="text-xs capitalize">{campaign.type}</TableCell>
                  <TableCell className="text-xs text-center">{statusBadge(campaign.status)}</TableCell>
                  <TableCell className="text-xs text-right">{(campaign.leads ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-right">{(campaign.enrollments ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-right">{(campaign.actions ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-right">{(clicksMap.get(campaign.id) ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-right">{formatRupees(campaign.budget)}</TableCell>
                  <TableCell className="text-xs text-right">{formatRupees(campaign.spent)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Step-1 sequence progress */}
      {seqStats.length > 0 && (
        <Card className="p-3">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="text-sm">Step-1 Sequence Progress</CardTitle>
            <CardDescription className="text-[10px]">First email per contact · quota 1,000 per campaign</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Campaign</TableHead>
                  <TableHead className="text-xs">Progress</TableHead>
                  <TableHead className="text-xs text-right">Failed</TableHead>
                  <TableHead className="text-xs text-right">Open %</TableHead>
                  <TableHead className="text-xs text-right">Click %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seqStats.map((s) => {
                  const sent = Number(s.step1_sent);
                  const progress = Math.min(100, (sent / STEP1_TARGET) * 100);
                  return (
                    <TableRow key={s.campaign_id}>
                      <TableCell className="text-xs">
                        <div className="font-medium truncate max-w-[160px]">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground">{s.product_key}</div>
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="flex-1 h-1.5" />
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {sent.toLocaleString()} / {STEP1_TARGET.toLocaleString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className={`text-xs text-right ${Number(s.step1_failed) > 0 ? "text-red-500" : ""}`}>
                        {Number(s.step1_failed).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-right">{pct(Number(s.total_opens), sent)}</TableCell>
                      <TableCell className="text-xs text-right">{pct(Number(s.total_clicks), sent)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* GA4 landing traffic */}
      <Card className="p-3">
        <CardHeader className="p-0 pb-3">
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <CardTitle className="text-sm">Landing Page Traffic</CardTitle>
          </div>
          <CardDescription className="text-[10px]">utm_source=insync_engine · synced daily from GA4</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {ga4Rows.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-4 text-center">
              No traffic data yet — syncs daily at 4 AM UTC after emails generate visits.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs text-right">Sessions</TableHead>
                  <TableHead className="text-xs text-right">Users</TableHead>
                  <TableHead className="text-xs text-right">Engaged</TableHead>
                  <TableHead className="text-xs text-right">Eng. %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ga4Rows.map((r) => (
                  <TableRow key={r.product_key}>
                    <TableCell className="text-xs font-medium">{r.product_key}</TableCell>
                    <TableCell className="text-xs text-right">{r.sessions.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{r.active_users.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{r.engaged_sessions.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{pct(r.engaged_sessions, r.sessions)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
