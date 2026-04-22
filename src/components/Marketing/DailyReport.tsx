import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Mail, MessageCircle, Pause, CheckCircle2, Clock } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CampaignRow {
  id: string;
  name: string;
  product_key: string;
  status: string;
}

interface ActionRow {
  channel: string;
  status: string;
  campaign_id: string;
}

interface ChannelCounts {
  sent: number;      // sent + delivered (total outbound)
  delivered: number; // delivered only
}

interface CampaignSend {
  campaign_id: string;
  name: string;
  product_key: string;
  status: string;
  email: ChannelCounts;
  whatsapp: ChannelCounts;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CountCell({ counts, color }: { counts: ChannelCounts; color: string }) {
  if (counts.sent === 0) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = counts.sent > 0 ? Math.round((counts.delivered / counts.sent) * 100) : 0;
  return (
    <div className="text-right">
      <div className={`tabular-nums text-xs font-semibold ${color}`}>
        {counts.sent.toLocaleString()}
      </div>
      <div className="tabular-nums text-[10px] text-muted-foreground">
        {counts.delivered.toLocaleString()} dlvd
        {counts.sent > 0 && <span className="ml-1 opacity-70">({pct}%)</span>}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DailyReport() {
  const { effectiveOrgId } = useOrgContext();
  const today = new Date().toISOString().slice(0, 10);

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

  const { data: actions = [], isLoading: actionsLoading } = useQuery<ActionRow[]>({
    queryKey: ["daily-report-actions", effectiveOrgId, today],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_sequence_actions")
        .select("channel, status, mkt_sequence_enrollments!inner(campaign_id, mkt_campaigns!inner(org_id))")
        .eq("mkt_sequence_enrollments.mkt_campaigns.org_id", effectiveOrgId)
        .in("status", ["sent", "delivered"])
        .in("channel", ["email", "whatsapp"])
        .gte("created_at", `${today}T00:00:00Z`);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        channel: r.channel,
        status: r.status,
        campaign_id: r.mkt_sequence_enrollments?.campaign_id,
      }));
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60_000,
  });

  const isLoading = campLoading || actionsLoading;

  // Aggregate by campaign + channel + status
  const countsByCampaign = new Map<string, { email: ChannelCounts; whatsapp: ChannelCounts }>();
  for (const a of actions) {
    if (!a.campaign_id) continue;
    const existing = countsByCampaign.get(a.campaign_id) ?? {
      email:    { sent: 0, delivered: 0 },
      whatsapp: { sent: 0, delivered: 0 },
    };
    const ch = a.channel as "email" | "whatsapp";
    if (ch !== "email" && ch !== "whatsapp") continue;
    existing[ch].sent++;
    if (a.status === "delivered") existing[ch].delivered++;
    countsByCampaign.set(a.campaign_id, existing);
  }

  const rows: CampaignSend[] = campaigns.map((c) => {
    const counts = countsByCampaign.get(c.id) ?? {
      email:    { sent: 0, delivered: 0 },
      whatsapp: { sent: 0, delivered: 0 },
    };
    return { campaign_id: c.id, name: c.name, product_key: c.product_key, status: c.status, ...counts };
  });

  // Summary totals
  const totEmail = { sent: 0, delivered: 0 };
  const totWa    = { sent: 0, delivered: 0 };
  for (const r of rows) {
    totEmail.sent      += r.email.sent;
    totEmail.delivered += r.email.delivered;
    totWa.sent         += r.whatsapp.sent;
    totWa.delivered    += r.whatsapp.delivered;
  }
  const grandSent      = totEmail.sent + totWa.sent;
  const grandDelivered = totEmail.delivered + totWa.delivered;
  const deliveryPct    = grandSent > 0 ? Math.round((grandDelivered / grandSent) * 100) : 0;

  const dateLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

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

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-muted/30 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Today — {dateLabel}</p>
          <p className="text-lg font-bold tabular-nums mt-0.5">
            {grandSent.toLocaleString()} sent
            <span className="text-sm font-normal text-muted-foreground ml-2">
              · {grandDelivered.toLocaleString()} delivered ({deliveryPct}%)
            </span>
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Mail className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs font-medium text-muted-foreground">Email</span>
            </div>
            <p className="text-sm font-bold tabular-nums">{totEmail.sent.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {totEmail.delivered.toLocaleString()} delivered
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-muted-foreground">WhatsApp</span>
            </div>
            <p className="text-sm font-bold tabular-nums">{totWa.sent.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {totWa.delivered.toLocaleString()} delivered
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground" rowSpan={2}>Campaign</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell" rowSpan={2}>Product</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground" rowSpan={2}>Status</th>
              <th className="text-center px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border-l" colSpan={2}>
                <Mail className="h-3 w-3 inline mr-1" />Email
              </th>
              <th className="text-center px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border-l" colSpan={2}>
                <MessageCircle className="h-3 w-3 inline mr-1" />WhatsApp
              </th>
            </tr>
            <tr className="border-b bg-muted/30">
              <th className="text-right px-3 py-1 text-[10px] font-medium text-muted-foreground border-l">Sent</th>
              <th className="text-right px-3 py-1 text-[10px] font-medium text-muted-foreground">Delivered</th>
              <th className="text-right px-3 py-1 text-[10px] font-medium text-muted-foreground border-l">Sent</th>
              <th className="text-right px-3 py-1 text-[10px] font-medium text-muted-foreground">Delivered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isActive = row.status === "active";
              const isPaused = row.status === "paused";
              const hasSends = row.email.sent + row.whatsapp.sent > 0;
              return (
                <tr
                  key={row.campaign_id}
                  className={`border-b last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/10"} ${!isActive ? "opacity-60" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {isActive && hasSends ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      ) : isActive ? (
                        <Clock className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                      ) : (
                        <Pause className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="font-medium text-xs leading-tight">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {row.product_key}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {isPaused ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] h-5 px-1.5">paused</Badge>
                    ) : (
                      <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] h-5 px-1.5">active</Badge>
                    )}
                  </td>
                  {/* Email sent */}
                  <td className="px-3 py-2.5 text-right border-l">
                    <span className={`tabular-nums text-xs font-medium ${row.email.sent > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                      {row.email.sent > 0 ? row.email.sent.toLocaleString() : "—"}
                    </span>
                  </td>
                  {/* Email delivered */}
                  <td className="px-3 py-2.5 text-right">
                    <span className={`tabular-nums text-xs font-medium ${row.email.delivered > 0 ? "text-blue-500 dark:text-blue-300" : "text-muted-foreground"}`}>
                      {row.email.sent > 0 ? row.email.delivered.toLocaleString() : "—"}
                    </span>
                    {row.email.sent > 0 && (
                      <div className="text-[9px] text-muted-foreground tabular-nums">
                        {Math.round((row.email.delivered / row.email.sent) * 100)}%
                      </div>
                    )}
                  </td>
                  {/* WA sent */}
                  <td className="px-3 py-2.5 text-right border-l">
                    <span className={`tabular-nums text-xs font-medium ${row.whatsapp.sent > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      {row.whatsapp.sent > 0 ? row.whatsapp.sent.toLocaleString() : "—"}
                    </span>
                  </td>
                  {/* WA delivered */}
                  <td className="px-3 py-2.5 text-right">
                    <span className={`tabular-nums text-xs font-medium ${row.whatsapp.delivered > 0 ? "text-emerald-500 dark:text-emerald-300" : "text-muted-foreground"}`}>
                      {row.whatsapp.sent > 0 ? row.whatsapp.delivered.toLocaleString() : "—"}
                    </span>
                    {row.whatsapp.sent > 0 && (
                      <div className="text-[9px] text-muted-foreground tabular-nums">
                        {Math.round((row.whatsapp.delivered / row.whatsapp.sent) * 100)}%
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 border-t">
              <td className="px-4 py-2 text-xs font-semibold" colSpan={3}>Total</td>
              <td className="px-3 py-2 text-right text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums border-l">
                {totEmail.sent.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right text-xs font-bold text-blue-500 dark:text-blue-300 tabular-nums">
                {totEmail.delivered.toLocaleString()}
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
        Auto-refreshes every 60 s · Daily cap tracked on delivered count
      </p>
    </div>
  );
}
