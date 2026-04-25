import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Pause, CheckCircle2, Clock, ChevronLeft, ChevronRight, UserPlus, RotateCcw, Mail, MessageCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CampaignRow {
  id: string;
  name: string;
  product_key: string;
  status: string;
}

interface StatRow {
  campaign_id: string;
  channel: string;
  outreach_type: "cold_outreach" | "followup";
  sent: number;
  delivered: number;
}

interface PipelineRow {
  campaign_id: string;
  queued: number;
  delivered_today: number;
  in_flight_today: number;
}

interface ChannelPair { sent: number; dlvd: number; }

interface CampaignStats {
  id: string;
  name: string;
  product_key: string;
  status: string;
  new_email: ChannelPair;
  new_wa:    ChannelPair;
  fu_email:  ChannelPair;
  fu_wa:     ChannelPair;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DailyReport() {
  const { effectiveOrgId } = useOrgContext();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  function shiftDay(delta: number) {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (next <= todayStr) setSelectedDate(next);
  }

  const { data: campaigns = [], isLoading: campLoading } = useQuery<CampaignRow[]>({
    queryKey: ["daily-report-campaigns", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_campaigns")
        .select("id, name, product_key, status")
        .eq("org_id", effectiveOrgId)
        .order("sequence_priority", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60_000,
  });

  // Aggregate sent + delivered by outreach_type across all channels
  const { data: stats = [], isLoading: statsLoading } = useQuery<StatRow[]>({
    queryKey: ["daily-report-stats", effectiveOrgId, selectedDate],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase.rpc("mkt_daily_campaign_stats", {
        p_org_id: effectiveOrgId,
        p_date: selectedDate,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        campaign_id:   r.campaign_id,
        channel:       r.channel,
        outreach_type: r.outreach_type ?? "followup",
        sent:          Number(r.sent)      || 0,
        delivered:     Number(r.delivered) || 0,
      }));
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60_000,
  });

  // Pipeline: queued + today's cap progress for all campaigns (incl. paused)
  const { data: pipeline = [] } = useQuery<PipelineRow[]>({
    queryKey: ["daily-report-pipeline", effectiveOrgId, selectedDate],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase.rpc("mkt_step1_pipeline", {
        p_org_id: effectiveOrgId,
        p_date: selectedDate,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        campaign_id:     r.campaign_id,
        queued:          Number(r.queued)          || 0,
        delivered_today: Number(r.delivered_today) || 0,
        in_flight_today: Number(r.in_flight_today) || 0,
      }));
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60_000,
  });

  const isLoading = campLoading || statsLoading;

  // Build per-campaign stats map keyed by campaign_id
  const zero = (): ChannelPair => ({ sent: 0, dlvd: 0 });
  const statsMap = new Map<string, { new_email: ChannelPair; new_wa: ChannelPair; fu_email: ChannelPair; fu_wa: ChannelPair }>();
  for (const s of stats) {
    const existing = statsMap.get(s.campaign_id) ?? { new_email: zero(), new_wa: zero(), fu_email: zero(), fu_wa: zero() };
    const isNew = s.outreach_type === "cold_outreach";
    const bucket = isNew
      ? (s.channel === "email" ? existing.new_email : existing.new_wa)
      : (s.channel === "email" ? existing.fu_email  : existing.fu_wa);
    bucket.sent += s.sent;
    bucket.dlvd += s.delivered;
    statsMap.set(s.campaign_id, existing);
  }

  const pipelineMap = new Map<string, PipelineRow>(pipeline.map((p) => [p.campaign_id, p]));

  const rows: CampaignStats[] = campaigns.map((c) => {
    const s = statsMap.get(c.id) ?? { new_email: zero(), new_wa: zero(), fu_email: zero(), fu_wa: zero() };
    return { id: c.id, name: c.name, product_key: c.product_key, status: c.status, ...s };
  });

  // Totals
  let totNewSent = 0, totNewDlvd = 0, totFuSent = 0, totFuDlvd = 0;
  for (const r of rows) {
    totNewSent += r.new_email.sent + r.new_wa.sent;
    totNewDlvd += r.new_email.dlvd + r.new_wa.dlvd;
    totFuSent  += r.fu_email.sent  + r.fu_wa.sent;
    totFuDlvd  += r.fu_email.dlvd  + r.fu_wa.dlvd;
  }
  const grandSent = totNewSent + totFuSent;
  const grandDlvd = totNewDlvd + totFuDlvd;
  const dlvdPct   = grandSent > 0 ? Math.round((grandDlvd / grandSent) * 100) : 0;

  const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
  const isToday = selectedDate === todayStr;

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">

      {/* Date picker */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => shiftDay(-1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <input
          type="date"
          value={selectedDate}
          max={todayStr}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          className="h-7 rounded-md border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => shiftDay(1)} disabled={isToday}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        {!isToday && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedDate(todayStr)}>
            Today
          </Button>
        )}
      </div>

      {/* Summary bar */}
      <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-2">
        <p className="text-xs text-muted-foreground">{isToday ? "Today" : "Date"} — {dateLabel}</p>
        <p className="text-lg font-bold tabular-nums">
          {grandSent.toLocaleString()} sent
          <span className="text-sm font-normal text-muted-foreground ml-2">
            · {grandDlvd.toLocaleString()} delivered ({dlvdPct}%)
          </span>
        </p>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 px-3 py-1.5">
            <UserPlus className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-violet-600 dark:text-violet-400 font-medium uppercase tracking-wide">New contacts</p>
              <p className="text-sm font-bold tabular-nums">
                {totNewSent.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground ml-1">sent · {totNewDlvd.toLocaleString()} dlvd</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-1.5">
            <RotateCcw className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wide">Follow-ups</p>
              <p className="text-sm font-bold tabular-nums">
                {totFuSent.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground ml-1">sent · {totFuDlvd.toLocaleString()} dlvd</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Table — one row per campaign, channels split within New and Follow-ups */}
      <div className="rounded-xl border overflow-hidden overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground" rowSpan={2}>Campaign</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell" rowSpan={2}>Product</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground" rowSpan={2}>Status</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground border-l" rowSpan={2}>Pipeline</th>
              <th className="text-center px-3 py-1 font-medium text-violet-600 dark:text-violet-400 border-l" colSpan={4}>
                <UserPlus className="h-3 w-3 inline mr-1" />New outreach
              </th>
              <th className="text-center px-3 py-1 font-medium text-amber-600 dark:text-amber-400 border-l" colSpan={4}>
                <RotateCcw className="h-3 w-3 inline mr-1" />Follow-ups
              </th>
            </tr>
            <tr className="border-b bg-muted/30">
              <th className="text-right px-2 py-1 font-medium text-muted-foreground border-l">
                <Mail className="h-2.5 w-2.5 inline" /> S
              </th>
              <th className="text-right px-2 py-1 font-medium text-muted-foreground">D</th>
              <th className="text-right px-2 py-1 font-medium text-muted-foreground border-l">
                <MessageCircle className="h-2.5 w-2.5 inline" /> S
              </th>
              <th className="text-right px-2 py-1 font-medium text-muted-foreground">D</th>
              <th className="text-right px-2 py-1 font-medium text-muted-foreground border-l">
                <Mail className="h-2.5 w-2.5 inline" /> S
              </th>
              <th className="text-right px-2 py-1 font-medium text-muted-foreground">D</th>
              <th className="text-right px-2 py-1 font-medium text-muted-foreground border-l">
                <MessageCircle className="h-2.5 w-2.5 inline" /> S
              </th>
              <th className="text-right px-2 py-1 font-medium text-muted-foreground">D</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isActive = row.status === "active";
              const isPaused = row.status === "paused";
              const hasSends = row.new_email.sent + row.new_wa.sent + row.fu_email.sent + row.fu_wa.sent > 0;
              const pipe = pipelineMap.get(row.id);
              const capFill = pipe ? Math.min(100, Math.round(((pipe.delivered_today + pipe.in_flight_today) / 100) * 100)) : 0;

              const N = (v: number, color: string) => v > 0
                ? <span className={`tabular-nums ${color}`}>{v.toLocaleString()}</span>
                : <span className="text-muted-foreground">—</span>;

              return (
                <tr key={row.id} className={`border-b last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/10"} ${!isActive ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {isActive && hasSends ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                        : isActive ? <Clock className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                        : <Pause className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                      <span className="font-medium">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell">
                    <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{row.product_key}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {isPaused
                      ? <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] h-5 px-1.5">paused</Badge>
                      : <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] h-5 px-1.5">active</Badge>}
                  </td>
                  <td className="px-3 py-2 border-l">
                    {pipe ? (
                      <div className="min-w-[80px]">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${capFill >= 100 ? "bg-emerald-500" : "bg-violet-400"}`} style={{ width: `${capFill}%` }} />
                          </div>
                          <span className="text-[10px] tabular-nums text-muted-foreground whitespace-nowrap">{pipe.delivered_today}/100</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground tabular-nums">{pipe.queued.toLocaleString()} queued</p>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  {/* New: Email */}
                  <td className="px-2 py-2 text-right border-l">{N(row.new_email.sent, "font-medium text-violet-600 dark:text-violet-400")}</td>
                  <td className="px-2 py-2 text-right">{N(row.new_email.dlvd, "text-violet-500 dark:text-violet-300")}</td>
                  {/* New: WA */}
                  <td className="px-2 py-2 text-right border-l">{N(row.new_wa.sent, "font-medium text-violet-600 dark:text-violet-400")}</td>
                  <td className="px-2 py-2 text-right">{N(row.new_wa.dlvd, "text-violet-500 dark:text-violet-300")}</td>
                  {/* FU: Email */}
                  <td className="px-2 py-2 text-right border-l">{N(row.fu_email.sent, "font-medium text-amber-600 dark:text-amber-400")}</td>
                  <td className="px-2 py-2 text-right">{N(row.fu_email.dlvd, "text-amber-500 dark:text-amber-300")}</td>
                  {/* FU: WA */}
                  <td className="px-2 py-2 text-right border-l">{N(row.fu_wa.sent, "font-medium text-amber-600 dark:text-amber-400")}</td>
                  <td className="px-2 py-2 text-right">{N(row.fu_wa.dlvd, "text-amber-500 dark:text-amber-300")}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 border-t font-semibold">
              <td className="px-4 py-2" colSpan={4}>Total</td>
              <td className="px-2 py-2 text-right tabular-nums text-violet-600 dark:text-violet-400 border-l">
                {rows.reduce((a, r) => a + r.new_email.sent, 0).toLocaleString()}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-violet-500 dark:text-violet-300">
                {rows.reduce((a, r) => a + r.new_email.dlvd, 0).toLocaleString()}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-violet-600 dark:text-violet-400 border-l">
                {rows.reduce((a, r) => a + r.new_wa.sent, 0).toLocaleString()}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-violet-500 dark:text-violet-300">
                {rows.reduce((a, r) => a + r.new_wa.dlvd, 0).toLocaleString()}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-amber-600 dark:text-amber-400 border-l">
                {rows.reduce((a, r) => a + r.fu_email.sent, 0).toLocaleString()}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-amber-500 dark:text-amber-300">
                {rows.reduce((a, r) => a + r.fu_email.dlvd, 0).toLocaleString()}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-amber-600 dark:text-amber-400 border-l">
                {rows.reduce((a, r) => a + r.fu_wa.sent, 0).toLocaleString()}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-amber-500 dark:text-amber-300">
                {rows.reduce((a, r) => a + r.fu_wa.dlvd, 0).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground text-right">
        <RefreshCw className="h-2.5 w-2.5 inline mr-1" />
        Auto-refreshes every 60 s · New outreach cap: 100/day per campaign · Follow-ups uncapped
      </p>
    </div>
  );
}
