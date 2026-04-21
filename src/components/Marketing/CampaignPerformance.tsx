import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Box, Users, Send, Pause, Zap } from "lucide-react";

import { EngineHeartbeat } from "./shared/EngineHeartbeat";
import { HotLeads } from "./shared/HotLeads";
import { StrategyGrid } from "./views/StrategyGrid";
import { JourneyLanes } from "./views/JourneyLanes";
import type { ProductChannelRow, Ga4ProductData } from "./views/StrategyGrid";
import type { HotLead } from "./views/ThreeDView";

// Lazy-load the 3D view to keep initial bundle lean
const ThreeDView = lazy(() =>
  import("./views/ThreeDView").then(m => ({ default: m.ThreeDView }))
);

// ─── Types ──────────────────────────────────────────────────────────────────

interface EngineDailyRow {
  date: string;
  channel: string;
  sent: number;
}

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

// ─── Campaign strip ──────────────────────────────────────────────────────────

function CampaignStrip({ campaigns }: { campaigns: CampaignStat[] }) {
  if (!campaigns.length) return null;

  // Sort: active first, then paused, then others
  const sorted = [...campaigns].sort((a, b) => {
    const order = (s: string) => s === "active" ? 0 : s === "paused" ? 1 : 2;
    return order(a.status) - order(b.status);
  });

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-2 min-w-max">
        {sorted.map(c => {
          const isActive = c.status === "active";
          const isPaused = c.status === "paused";
          const sent = Number(c.step1_sent);
          const enrolled = Number(c.total_enrollments);
          const clicks = Number(c.total_clicks);

          return (
            <div
              key={c.campaign_id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 min-w-[200px] max-w-[260px] ${
                isActive
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
                  : isPaused
                  ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40"
                  : "bg-muted/20 border-border"
              }`}
            >
              {/* Status indicator */}
              <div className="flex-shrink-0">
                {isActive ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                ) : isPaused ? (
                  <Pause className="h-3 w-3 text-amber-500" />
                ) : (
                  <Zap className="h-3 w-3 text-muted-foreground/40" />
                )}
              </div>

              {/* Campaign info */}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold leading-tight truncate">
                  {c.name}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] font-mono text-muted-foreground">{c.product_key}</span>
                  {c.sequence_priority != null && (
                    <span className="text-[8px] bg-muted text-muted-foreground px-1 rounded">
                      P{c.sequence_priority}
                    </span>
                  )}
                </div>
                {/* Metrics row */}
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                    <Users className="h-2.5 w-2.5" />
                    {enrolled.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                    <Send className="h-2.5 w-2.5" />
                    {sent.toLocaleString()}
                  </span>
                  {clicks > 0 && (
                    <span className="text-[9px] font-medium text-blue-600 tabular-nums">
                      {sent > 0 ? `${((clicks / sent) * 100).toFixed(0)}% CTR` : `${clicks} clicks`}
                    </span>
                  )}
                  {sent === 0 && isActive && (
                    <span className="text-[9px] text-amber-600">queued</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab bar ────────────────────────────────────────────────────────────────

type TabKey = "grid" | "lanes" | "three";

const TABS: Array<{ key: TabKey; label: string; sub: string }> = [
  { key: "grid",  label: "Strategy Grid",  sub: "Product × Channel" },
  { key: "lanes", label: "Journey Lanes",  sub: "Awareness → Conversion" },
  { key: "three", label: "3D View",        sub: "Immersive analytics" },
];

function TabBar({ active, onChange, activeCampaigns, pausedCampaigns }: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  activeCampaigns: number;
  pausedCampaigns: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 flex-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex-1 flex flex-col items-center gap-0 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              active === tab.key
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[9px] font-normal ${active === tab.key ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
              {tab.sub}
            </span>
          </button>
        ))}
      </div>
      {/* Campaign status summary badges */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {activeCampaigns > 0 && (
          <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] h-6 px-2 gap-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
            </span>
            {activeCampaigns} active
          </Badge>
        )}
        {pausedCampaigns > 0 && (
          <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] h-6 px-2">
            {pausedCampaigns} paused
          </Badge>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CampaignPerformance({ days }: { days: number }) {
  const { effectiveOrgId } = useOrgContext();
  const [tab, setTab] = useState<TabKey>("grid");

  // ── All hooks before any early returns ─────────────────────────────────────

  const { data: engineRows = [], isLoading: engineLoading } = useQuery<EngineDailyRow[]>({
    queryKey: ["mkt-engine-daily-stats", effectiveOrgId, days],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase.rpc("mkt_engine_daily_stats", {
        p_org_id: effectiveOrgId,
        p_days: days,
      });
      if (error) throw error;
      return (data as EngineDailyRow[]) || [];
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60_000,
  });

  const { data: channelSummary = [], isLoading: summaryLoading } = useQuery<ProductChannelRow[]>({
    queryKey: ["mkt-product-channel-summary", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase.rpc("mkt_product_channel_summary", {
        p_org_id: effectiveOrgId,
      });
      if (error) throw error;
      return (data as ProductChannelRow[]) || [];
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 120_000,
  });

  const { data: hotLeads = [], isLoading: leadsLoading } = useQuery<HotLead[]>({
    queryKey: ["mkt-hot-leads", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase.rpc("mkt_hot_leads", {
        p_org_id: effectiveOrgId,
        p_limit: 20,
      });
      if (error) throw error;
      return (data as HotLead[]) || [];
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 120_000,
  });

  const { data: campaigns = [] } = useQuery<CampaignStat[]>({
    queryKey: ["mkt-campaign-stats", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase.rpc("mkt_campaign_stats", {
        p_org_id: effectiveOrgId,
      });
      if (error) throw error;
      return (data as CampaignStat[]) || [];
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60_000,
  });

  const { data: ga4ByProduct = new Map<string, Ga4ProductData>() } = useQuery<Map<string, Ga4ProductData>>({
    queryKey: ["mkt-ga4-by-product", effectiveOrgId, days],
    queryFn: async () => {
      if (!effectiveOrgId) return new Map();
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("mkt_ga4_traffic")
        .select("product_key, sessions, active_users, engaged_sessions")
        .eq("org_id", effectiveOrgId)
        .gte("date", cutoff);
      if (error) throw error;
      const map = new Map<string, Ga4ProductData>();
      for (const r of data ?? []) {
        const pk = r.product_key as string;
        const existing = map.get(pk) ?? { sessions: 0, active_users: 0, engaged_sessions: 0 };
        map.set(pk, {
          sessions:         existing.sessions         + Number(r.sessions),
          active_users:     existing.active_users     + Number(r.active_users),
          engaged_sessions: existing.engaged_sessions + Number(r.engaged_sessions),
        });
      }
      return map;
    },
    enabled: !!effectiveOrgId,
  });

  // ── Derived values ─────────────────────────────────────────────────────────

  const totalEmail = engineRows
    .filter(r => r.channel === "email")
    .reduce((s, r) => s + Number(r.sent), 0);

  const totalWa = engineRows
    .filter(r => r.channel === "whatsapp")
    .reduce((s, r) => s + Number(r.sent), 0);

  const ga4Visits = [...ga4ByProduct.values()].reduce((s, r) => s + r.sessions, 0);

  const activeCampaigns = campaigns.filter(c => c.status === "active").length;
  const pausedCampaigns = campaigns.filter(c => c.status === "paused").length;

  // ── Loading state ──────────────────────────────────────────────────────────

  if (engineLoading || summaryLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-xl" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-52 rounded-xl flex-shrink-0" />)}
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 flex-1 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Engine heartbeat ─────────────────────────────────────────────── */}
      <EngineHeartbeat
        rows={engineRows}
        days={days}
        totalEmail={totalEmail}
        totalWa={totalWa}
        totalVisits={ga4Visits}
        activeCampaigns={activeCampaigns}
      />

      {/* ── Campaign strip (all campaigns, scrollable) ────────────────────── */}
      <CampaignStrip campaigns={campaigns} />

      {/* ── Tab navigation ───────────────────────────────────────────────── */}
      <TabBar
        active={tab}
        onChange={setTab}
        activeCampaigns={activeCampaigns}
        pausedCampaigns={pausedCampaigns}
      />

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div>
        {tab === "grid" && (
          <StrategyGrid rows={channelSummary} ga4Data={ga4ByProduct} />
        )}

        {tab === "lanes" && (
          <JourneyLanes rows={channelSummary} />
        )}

        {tab === "three" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
                <Box className="h-5 w-5 animate-pulse" />
                <span className="text-sm">Loading 3D engine…</span>
              </div>
            }
          >
            <ThreeDView channelRows={channelSummary} hotLeads={hotLeads} />
          </Suspense>
        )}
      </div>

      {/* ── Hot leads ────────────────────────────────────────────────────── */}
      {!leadsLoading && hotLeads.length > 0 && (
        <HotLeads leads={hotLeads} />
      )}

    </div>
  );
}
