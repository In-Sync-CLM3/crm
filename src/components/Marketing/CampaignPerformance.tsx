import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Box } from "lucide-react";

import { EngineHeartbeat } from "./shared/EngineHeartbeat";
import { HotLeads } from "./shared/HotLeads";
import { StrategyGrid } from "./views/StrategyGrid";
import { JourneyLanes } from "./views/JourneyLanes";
import type { ProductChannelRow } from "./views/StrategyGrid";
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

// ─── Tab bar ────────────────────────────────────────────────────────────────

type TabKey = "grid" | "lanes" | "three";

const TABS: Array<{ key: TabKey; label: string; sub: string }> = [
  { key: "grid",  label: "Strategy Grid",  sub: "Product × Channel" },
  { key: "lanes", label: "Journey Lanes",  sub: "Awareness → Conversion" },
  { key: "three", label: "3D View",        sub: "Immersive analytics" },
];

function TabBar({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
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

  const { data: activeCampaigns = 0 } = useQuery<number>({
    queryKey: ["mkt-active-campaign-count", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return 0;
      const { count, error } = await supabase
        .from("mkt_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("org_id", effectiveOrgId)
        .eq("status", "active");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!effectiveOrgId,
  });

  const { data: ga4Visits = 0 } = useQuery<number>({
    queryKey: ["mkt-ga4-visits-total", effectiveOrgId, days],
    queryFn: async () => {
      if (!effectiveOrgId) return 0;
      const { data, error } = await supabase
        .from("mkt_ga4_traffic")
        .select("sessions")
        .eq("org_id", effectiveOrgId)
        .gte("date", new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10));
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.sessions), 0);
    },
    enabled: !!effectiveOrgId,
  });

  // ── Derived totals for EngineHeartbeat ─────────────────────────────────────

  const totalEmail = engineRows
    .filter(r => r.channel === "email")
    .reduce((s, r) => s + Number(r.sent), 0);

  const totalWa = engineRows
    .filter(r => r.channel === "whatsapp")
    .reduce((s, r) => s + Number(r.sent), 0);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (engineLoading || summaryLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-xl" />
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

      {/* ── Tab navigation ───────────────────────────────────────────────── */}
      <TabBar active={tab} onChange={setTab} />

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div>
        {tab === "grid" && (
          <StrategyGrid rows={channelSummary} />
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
