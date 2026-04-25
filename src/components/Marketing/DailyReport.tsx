import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Mail, MessageCircle, Pause, CheckCircle2, Clock, ChevronLeft, ChevronRight, UserPlus, RotateCcw } from "lucide-react";

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
  opens: number;
  clicks: number;
}

interface ChannelCounts {
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
}

interface OutreachTypeCounts {
  email: ChannelCounts;
  whatsapp: ChannelCounts;
}

interface CampaignSend {
  campaign_id: string;
  name: string;
  product_key: string;
  status: string;
  cold_outreach: OutreachTypeCounts;
  followup: OutreachTypeCounts;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Dash() {
  return <span className="text-muted-foreground text-xs">—</span>;
}

function NumCell({
  value,
  total,
  color,
  showPct = false,
}: {
  value: number;
  total: number;
  color: string;
  showPct?: boolean;
}) {
  if (total === 0) return <Dash />;
  return (
    <div className="text-right">
      <span className={`tabular-nums text-xs font-medium ${value > 0 ? color : "text-muted-foreground"}`}>
        {value > 0 ? value.toLocaleString() : "0"}
      </span>
      {showPct && total > 0 && (
        <div className="text-[9px] text-muted-foreground tabular-nums">
          {Math.round((value / total) * 100)}%
        </div>
      )}
    </div>
  );
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

  // Use server-side aggregation RPC to avoid the 1000-row client limit
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
        campaign_id: r.campaign_id,
        channel: r.channel,
        outreach_type: r.outreach_type ?? "followup",
        sent: Number(r.sent) || 0,
        delivered: Number(r.delivered) || 0,
        opens: Number(r.opens) || 0,
        clicks: Number(r.clicks) || 0,
      }));
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60_000,
  });

  const isLoading = campLoading || statsLoading;

  // Pivot RPC results into Map<campaign_id, { cold_outreach, followup } × { email, whatsapp }>
  const zeroCounts = (): ChannelCounts => ({ sent: 0, delivered: 0, opens: 0, clicks: 0 });
  const zeroType   = (): OutreachTypeCounts => ({ email: zeroCounts(), whatsapp: zeroCounts() });

  const countsByCampaign = new Map<string, { cold_outreach: OutreachTypeCounts; followup: OutreachTypeCounts }>();
  for (const s of stats) {
    const existing = countsByCampaign.get(s.campaign_id) ?? { cold_outreach: zeroType(), followup: zeroType() };
    const bucket   = s.outreach_type === "cold_outreach" ? existing.cold_outreach : existing.followup;
    if (s.channel === "email" || s.channel === "whatsapp") {
      bucket[s.channel] = { sent: s.sent, delivered: s.delivered, opens: s.opens, clicks: s.clicks };
    }
    countsByCampaign.set(s.campaign_id, existing);
  }

  const rows: CampaignSend[] = campaigns.map((c) => {
    const counts = countsByCampaign.get(c.id) ?? { cold_outreach: zeroType(), followup: zeroType() };
    return { campaign_id: c.id, name: c.name, product_key: c.product_key, status: c.status, ...counts };
  });

  // Summary totals split by outreach type
  const totOutreach = { sent: 0, delivered: 0 };
  const totFollowup = { sent: 0, delivered: 0 };
  const totEmail    = { sent: 0, delivered: 0, opens: 0, clicks: 0 };
  const totWa       = { sent: 0, delivered: 0, opens: 0, clicks: 0 };

  for (const r of rows) {
    // Cold outreach totals
    totOutreach.sent      += r.cold_outreach.email.sent + r.cold_outreach.whatsapp.sent;
    totOutreach.delivered += r.cold_outreach.email.delivered + r.cold_outreach.whatsapp.delivered;
    // Follow-up totals
    totFollowup.sent      += r.followup.email.sent + r.followup.whatsapp.sent;
    totFollowup.delivered += r.followup.email.delivered + r.followup.whatsapp.delivered;
    // Channel totals (across both types)
    totEmail.sent      += r.cold_outreach.email.sent      + r.followup.email.sent;
    totEmail.delivered += r.cold_outreach.email.delivered + r.followup.email.delivered;
    totEmail.opens     += r.cold_outreach.email.opens     + r.followup.email.opens;
    totEmail.clicks    += r.cold_outreach.email.clicks    + r.followup.email.clicks;
    totWa.sent         += r.cold_outreach.whatsapp.sent      + r.followup.whatsapp.sent;
    totWa.delivered    += r.cold_outreach.whatsapp.delivered + r.followup.whatsapp.delivered;
  }
  const grandSent      = totEmail.sent + totWa.sent;
  const grandDelivered = totEmail.delivered + totWa.delivered;
  const deliveryPct    = grandSent > 0 ? Math.round((grandDelivered / grandSent) * 100) : 0;

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
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => shiftDay(1)}
          disabled={isToday}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        {!isToday && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedDate(todayStr)}>
            Today
          </Button>
        )}
      </div>

      {/* Summary bar */}
      <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-2.5">
        <p className="text-xs text-muted-foreground">{isToday ? "Today" : "Date"} — {dateLabel}</p>

        {/* Top line: overall */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-lg font-bold tabular-nums">
            {grandSent.toLocaleString()} sent
          </p>
          <span className="text-sm text-muted-foreground tabular-nums">
            {grandDelivered.toLocaleString()} delivered ({deliveryPct}%)
          </span>
        </div>

        {/* Cold outreach vs follow-up */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 px-3 py-1.5">
            <UserPlus className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide">New contacts reached</p>
              <p className="text-sm font-bold tabular-nums text-violet-700 dark:text-violet-300">
                {totOutreach.delivered.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground ml-1">/ {totOutreach.sent.toLocaleString()} sent</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-1.5">
            <RotateCcw className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Follow-ups sent</p>
              <p className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
                {totFollowup.sent.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground ml-1">{totFollowup.delivered.toLocaleString()} dlvd</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            {/* Email summary */}
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Mail className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-medium text-muted-foreground">Email</span>
              </div>
              <p className="text-sm font-bold tabular-nums">{totEmail.sent.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">
                {totEmail.delivered.toLocaleString()} dlvd
                {totEmail.opens > 0 && (
                  <span className="ml-1">
                    · {totEmail.opens.toLocaleString()} open
                    · {totEmail.clicks.toLocaleString()} click
                  </span>
                )}
              </p>
            </div>
            {/* WhatsApp summary */}
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-muted-foreground">WhatsApp</span>
              </div>
              <p className="text-sm font-bold tabular-nums">{totWa.sent.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">
                {totWa.delivered.toLocaleString()} dlvd
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground" rowSpan={2}>Campaign</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground" rowSpan={2}>Type</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell" rowSpan={2}>Product</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground" rowSpan={2}>Status</th>
              <th className="text-center px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border-l" colSpan={4}>
                <Mail className="h-3 w-3 inline mr-1" />Email
              </th>
              <th className="text-center px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border-l" colSpan={2}>
                <MessageCircle className="h-3 w-3 inline mr-1" />WhatsApp
              </th>
            </tr>
            <tr className="border-b bg-muted/30">
              <th className="text-right px-3 py-1 text-[10px] font-medium text-muted-foreground border-l">Sent</th>
              <th className="text-right px-3 py-1 text-[10px] font-medium text-muted-foreground">Dlvd</th>
              <th className="text-right px-3 py-1 text-[10px] font-medium text-muted-foreground">Opens</th>
              <th className="text-right px-3 py-1 text-[10px] font-medium text-muted-foreground">Clicks</th>
              <th className="text-right px-3 py-1 text-[10px] font-medium text-muted-foreground border-l">Sent</th>
              <th className="text-right px-3 py-1 text-[10px] font-medium text-muted-foreground">Dlvd</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isActive = row.status === "active";
              const isPaused = row.status === "paused";
              const bg = i % 2 === 0 ? "bg-background" : "bg-muted/10";
              const opacity = !isActive ? "opacity-60" : "";

              const types: Array<{ key: "cold_outreach" | "followup"; label: string; icon: React.ReactNode }> = [
                {
                  key: "cold_outreach",
                  label: "New outreach",
                  icon: <UserPlus className="h-3 w-3 text-violet-500 flex-shrink-0" />,
                },
                {
                  key: "followup",
                  label: "Follow-ups",
                  icon: <RotateCcw className="h-3 w-3 text-amber-500 flex-shrink-0" />,
                },
              ];

              return types.map((t, ti) => {
                const ch = row[t.key];
                const isFirst = ti === 0;
                return (
                  <tr
                    key={`${row.campaign_id}-${t.key}`}
                    className={`${isFirst ? "border-t" : ""} border-b last:border-0 ${bg} ${opacity}`}
                  >
                    {/* Campaign name — only on first sub-row, spans 1 row visually via border trick */}
                    <td className={`px-4 ${isFirst ? "pt-2.5 pb-1" : "pt-1 pb-2.5"}`}>
                      {isFirst && (
                        <div className="flex items-center gap-2">
                          {isActive && (row.cold_outreach.email.sent + row.cold_outreach.whatsapp.sent + row.followup.email.sent + row.followup.whatsapp.sent) > 0 ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                          ) : isActive ? (
                            <Clock className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                          ) : (
                            <Pause className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="font-medium text-xs leading-tight">{row.name}</span>
                        </div>
                      )}
                    </td>
                    {/* Sub-row type label */}
                    <td className={`px-3 ${isFirst ? "pt-2.5 pb-1" : "pt-1 pb-2.5"}`}>
                      <div className="flex items-center gap-1">
                        {t.icon}
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{t.label}</span>
                      </div>
                    </td>
                    {/* Product — only on first sub-row */}
                    <td className={`px-4 hidden sm:table-cell ${isFirst ? "pt-2.5 pb-1" : "pt-1 pb-2.5"}`}>
                      {isFirst && (
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {row.product_key}
                        </span>
                      )}
                    </td>
                    {/* Status — only on first sub-row */}
                    <td className={`px-4 text-center ${isFirst ? "pt-2.5 pb-1" : "pt-1 pb-2.5"}`}>
                      {isFirst && (isPaused ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] h-5 px-1.5">paused</Badge>
                      ) : (
                        <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] h-5 px-1.5">active</Badge>
                      ))}
                    </td>
                    {/* Email columns */}
                    <td className={`px-3 text-right border-l ${isFirst ? "pt-2.5 pb-1" : "pt-1 pb-2.5"}`}>
                      <NumCell value={ch.email.sent} total={ch.email.sent} color="text-blue-600 dark:text-blue-400" />
                    </td>
                    <td className={`px-3 text-right ${isFirst ? "pt-2.5 pb-1" : "pt-1 pb-2.5"}`}>
                      <NumCell value={ch.email.delivered} total={ch.email.sent} color="text-blue-500 dark:text-blue-300" showPct />
                    </td>
                    <td className={`px-3 text-right ${isFirst ? "pt-2.5 pb-1" : "pt-1 pb-2.5"}`}>
                      <NumCell value={ch.email.opens} total={ch.email.delivered} color="text-violet-600 dark:text-violet-400" showPct />
                    </td>
                    <td className={`px-3 text-right ${isFirst ? "pt-2.5 pb-1" : "pt-1 pb-2.5"}`}>
                      <NumCell value={ch.email.clicks} total={ch.email.delivered} color="text-orange-600 dark:text-orange-400" showPct />
                    </td>
                    {/* WhatsApp columns */}
                    <td className={`px-3 text-right border-l ${isFirst ? "pt-2.5 pb-1" : "pt-1 pb-2.5"}`}>
                      <NumCell value={ch.whatsapp.sent} total={ch.whatsapp.sent} color="text-emerald-600 dark:text-emerald-400" />
                    </td>
                    <td className={`px-3 text-right ${isFirst ? "pt-2.5 pb-1" : "pt-1 pb-2.5"}`}>
                      <NumCell value={ch.whatsapp.delivered} total={ch.whatsapp.sent} color="text-emerald-500 dark:text-emerald-300" showPct />
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 border-t">
              <td className="px-4 py-2 text-xs font-semibold" colSpan={4}>Total</td>
              <td className="px-3 py-2 text-right text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums border-l">
                {totEmail.sent.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right text-xs font-bold text-blue-500 dark:text-blue-300 tabular-nums">
                {totEmail.delivered.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right text-xs font-bold text-violet-600 dark:text-violet-400 tabular-nums">
                {totEmail.opens.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right text-xs font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                {totEmail.clicks.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums border-l">
                {totWa.sent.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right text-xs font-bold text-emerald-500 dark:text-emerald-300 tabular-nums">
                {totWa.delivered.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground text-right">
        <RefreshCw className="h-2.5 w-2.5 inline mr-1" />
        Auto-refreshes every 60 s · New outreach cap: 100 delivered/day/product · Follow-ups uncapped
      </p>
    </div>
  );
}
