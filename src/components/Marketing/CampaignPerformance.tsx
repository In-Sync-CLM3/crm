import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, MessageCircle, Globe, Users, Zap } from "lucide-react";
import { CampaignHeatmap } from "./CampaignHeatmap";

// ─── Constants ─────────────────────────────────────────────────────────────

const STEP1_QUOTA = 1000;

// ─── Types ──────────────────────────────────────────────────────────────────

interface CampaignStat {
  campaign_id: string;
  name: string;
  product_key: string;
  status: string;
  sequence_priority: number | null;
  total_enrollments: number;
  active_enrollments: number;
  step1_sent: number;
  step1_failed: number;
  total_opens: number;
  total_clicks: number;
  total_replies: number;
}

interface ChannelStat {
  campaign_id: string;
  channel: string;
  sent: number;
  failed: number;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
}

interface Ga4Row {
  product_key: string;
  sessions: number;
  active_users: number;
}

interface BudgetRow {
  id: string;
  budget: number;
  budget_spent: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ratePct(num: number, den: number): string {
  if (!den) return "—";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function formatINR(paise: number): string {
  const r = Math.round((paise ?? 0) / 100);
  if (r >= 100_000) return `₹${(r / 100_000).toFixed(2)}L`;
  return `₹${r.toLocaleString("en-IN")}`;
}

// ─── Shared sub-components ──────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] h-5 px-2">Active</Badge>;
  if (status === "paused")
    return <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] h-5 px-2">Paused</Badge>;
  if (status === "completed")
    return <Badge className="bg-blue-500 hover:bg-blue-500 text-white text-[10px] h-5 px-2">Completed</Badge>;
  return <Badge variant="secondary" className="text-[10px] h-5 px-2 capitalize">{status}</Badge>;
}

function MetricBar({
  label,
  value,
  max,
  right,
  color,
}: {
  label: string;
  value: number;
  max: number;
  right: string;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono w-14 text-right flex-shrink-0 tabular-nums">{right}</span>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </Card>
  );
}

// ─── Campaign card ───────────────────────────────────────────────────────────

function CampaignCard({
  stat,
  channels,
  ga4,
  budget,
  isLive,
}: {
  stat: CampaignStat;
  channels: Record<string, ChannelStat>;
  ga4: Ga4Row | null;
  budget: BudgetRow | null;
  isLive: boolean;
}) {
  const email = channels["email"];
  const wa    = channels["whatsapp"];

  const emailSent      = Number(email?.sent      ?? 0);
  const emailFailed    = Number(email?.failed    ?? 0);
  const emailOpens     = Number(email?.opens     ?? 0);
  const emailClicks    = Number(email?.clicks    ?? 0);
  const emailReplies   = Number(email?.replies   ?? 0);

  const waSent         = Number(wa?.sent      ?? 0);
  const waDelivered    = Number(wa?.delivered ?? 0);
  const waReplies      = Number(wa?.replies   ?? 0);

  const totalEnrolled  = Number(stat.total_enrollments);
  const activeEnrolled = Number(stat.active_enrollments);
  const hasAnyChannel  = email || wa;

  return (
    <Card className={`overflow-hidden flex flex-col border ${isLive ? "ring-1 ring-emerald-400/60" : ""}`}>
      {/* ── Header ── */}
      <div className={`px-4 py-3 border-b ${isLive ? "bg-emerald-50/40 dark:bg-emerald-950/20" : "bg-muted/20"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {isLive && (
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
              <span className="font-semibold text-sm leading-tight truncate">{stat.name}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-mono text-muted-foreground">{stat.product_key ?? "—"}</span>
              {stat.sequence_priority != null && (
                <span className="text-[9px] bg-muted text-muted-foreground px-1 rounded">
                  P{stat.sequence_priority}
                </span>
              )}
            </div>
          </div>
          <StatusBadge status={stat.status} />
        </div>

        {/* Enrollment summary */}
        <div className="flex items-center gap-4 mt-2.5">
          <div className="text-center">
            <div className="text-base font-bold tabular-nums">{totalEnrolled.toLocaleString()}</div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Enrolled</div>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="text-center">
            <div className="text-base font-bold tabular-nums text-emerald-600">{activeEnrolled.toLocaleString()}</div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Active</div>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="text-center">
            <div className="text-base font-bold tabular-nums text-muted-foreground">
              {(totalEnrolled - activeEnrolled).toLocaleString()}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Completed</div>
          </div>
        </div>
      </div>

      {/* ── Channel sections ── */}
      <CardContent className="p-4 flex-1 space-y-4">

        {/* Email */}
        {email && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-blue-600">Email</span>
              </div>
              {emailFailed > 0 && (
                <span className="text-[9px] text-red-500 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">
                  {emailFailed.toLocaleString()} failed
                </span>
              )}
            </div>
            <div className="space-y-2">
              <MetricBar
                label="Sent"
                value={emailSent}
                max={STEP1_QUOTA}
                right={`${emailSent.toLocaleString()} / ${STEP1_QUOTA.toLocaleString()}`}
                color="#3b82f6"
              />
              <MetricBar
                label="Opened"
                value={emailOpens}
                max={emailSent}
                right={ratePct(emailOpens, emailSent)}
                color="#60a5fa"
              />
              <MetricBar
                label="Clicked"
                value={emailClicks}
                max={emailSent}
                right={ratePct(emailClicks, emailSent)}
                color="#93c5fd"
              />
              {emailReplies > 0 && (
                <MetricBar
                  label="Replied"
                  value={emailReplies}
                  max={emailSent}
                  right={ratePct(emailReplies, emailSent)}
                  color="#bfdbfe"
                />
              )}
            </div>
          </div>
        )}

        {/* WhatsApp */}
        {wa && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">WhatsApp</span>
            </div>
            <div className="space-y-2">
              <MetricBar
                label="Sent"
                value={waSent}
                max={totalEnrolled || waSent}
                right={waSent.toLocaleString()}
                color="#10b981"
              />
              <MetricBar
                label="Delivered"
                value={waDelivered}
                max={waSent}
                right={ratePct(waDelivered, waSent)}
                color="#34d399"
              />
              {waReplies > 0 && (
                <MetricBar
                  label="Replied"
                  value={waReplies}
                  max={waSent}
                  right={ratePct(waReplies, waSent)}
                  color="#6ee7b7"
                />
              )}
            </div>
          </div>
        )}

        {!hasAnyChannel && (
          <p className="text-[11px] text-muted-foreground text-center py-3">
            No messages dispatched yet
          </p>
        )}
      </CardContent>

      {/* ── Footer ── */}
      <div className="px-4 py-2.5 border-t bg-muted/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {ga4 ? (
            <>
              <Globe className="h-3 w-3 text-orange-400" />
              <span className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">{ga4.sessions.toLocaleString()}</span> landing visits
              </span>
            </>
          ) : (
            <>
              <Globe className="h-3 w-3 text-muted-foreground/30" />
              <span className="text-[10px] text-muted-foreground/50">No landing data</span>
            </>
          )}
        </div>
        {budget && budget.budget > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {formatINR(budget.budget_spent)}{" "}
            <span className="text-muted-foreground/50">/ {formatINR(budget.budget)}</span>
          </span>
        )}
      </div>
    </Card>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CampaignPerformance({ days }: { days: number }) {
  const { effectiveOrgId } = useOrgContext();

  // ALL hooks before any early returns ─ fixes React rules-of-hooks crash

  const { data: campaigns = [], isLoading } = useQuery<CampaignStat[]>({
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

  const { data: channelRows = [] } = useQuery<ChannelStat[]>({
    queryKey: ["mkt-campaign-channel-stats", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase.rpc("mkt_campaign_channel_stats", { p_org_id: effectiveOrgId });
      if (error) throw error;
      return (data as ChannelStat[]) || [];
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60_000,
  });

  const { data: ga4Rows = [] } = useQuery<Ga4Row[]>({
    queryKey: ["mkt-ga4-traffic-agg", effectiveOrgId, days],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_ga4_traffic")
        .select("product_key, sessions, active_users")
        .eq("org_id", effectiveOrgId)
        .gte("date", new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10));
      if (error) throw error;
      return (data as Ga4Row[]) || [];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: budgetRows = [] } = useQuery<BudgetRow[]>({
    queryKey: ["mkt-campaign-budgets", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_campaigns")
        .select("id, budget, budget_spent")
        .eq("org_id", effectiveOrgId);
      if (error) throw error;
      return (data as BudgetRow[]) || [];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: liveLog } = useQuery({
    queryKey: ["mkt-live-campaign", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return null;
      const { data } = await supabase
        .from("mkt_engine_logs")
        .select("details")
        .eq("function_name", "mkt-sequence-executor")
        .eq("action", "executor-start")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // ─── Derived lookups (safe — all hooks already called above) ──────────────

  // channel map: campaign_id → { email: ChannelStat, whatsapp: ChannelStat, ... }
  const channelMap = new Map<string, Record<string, ChannelStat>>();
  for (const row of channelRows) {
    if (!channelMap.has(row.campaign_id)) channelMap.set(row.campaign_id, {});
    channelMap.get(row.campaign_id)![row.channel] = row;
  }

  // GA4 aggregated by product_key
  const ga4Map = new Map<string, Ga4Row>();
  for (const r of ga4Rows) {
    const key = r.product_key;
    const prev = ga4Map.get(key) ?? { product_key: key, sessions: 0, active_users: 0 };
    ga4Map.set(key, {
      product_key: key,
      sessions: prev.sessions + r.sessions,
      active_users: prev.active_users + r.active_users,
    });
  }

  const budgetMap = new Map(budgetRows.map((b) => [b.id, b]));
  const liveCampaignId = (liveLog?.details as Record<string, unknown> | null)?.active_campaign as string | undefined;

  // KPI totals
  const totalEnrolled  = campaigns.reduce((s, c) => s + Number(c.total_enrollments), 0);
  const totalEmailSent = channelRows.filter((r) => r.channel === "email").reduce((s, r) => s + Number(r.sent), 0);
  const totalWaSent    = channelRows.filter((r) => r.channel === "whatsapp").reduce((s, r) => s + Number(r.sent), 0);
  const totalGa4       = [...ga4Map.values()].reduce((s, v) => s + v.sessions, 0);

  // ─── Loading skeleton ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* KPI summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<Users className="h-4 w-4 text-violet-500" />}
          label="Contacts Reached"
          value={totalEnrolled.toLocaleString()}
          sub="enrolled across all campaigns"
        />
        <KpiCard
          icon={<Mail className="h-4 w-4 text-blue-500" />}
          label="Emails Sent"
          value={totalEmailSent.toLocaleString()}
          sub="step-1 sends across all campaigns"
        />
        <KpiCard
          icon={<MessageCircle className="h-4 w-4 text-emerald-500" />}
          label="WhatsApp Sent"
          value={totalWaSent.toLocaleString()}
          sub="step-1 sends across all campaigns"
        />
        <KpiCard
          icon={<Globe className="h-4 w-4 text-orange-500" />}
          label="Landing Visits"
          value={totalGa4 ? totalGa4.toLocaleString() : "—"}
          sub={`via utm_source=insync_engine · last ${days}d`}
        />
      </div>

      {/* Campaign cards */}
      {campaigns.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="text-sm font-medium">No campaigns yet</p>
          <p className="text-xs mt-1">Campaigns will appear once created in the marketing engine.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaigns.map((c) => (
            <CampaignCard
              key={c.campaign_id}
              stat={c}
              channels={channelMap.get(c.campaign_id) ?? {}}
              ga4={ga4Map.get(c.product_key) ?? null}
              budget={budgetMap.get(c.campaign_id) ?? null}
              isLive={c.campaign_id === liveCampaignId}
            />
          ))}
        </div>
      )}

      {/* Daily activity heatmap */}
      <CampaignHeatmap />

    </div>
  );
}
