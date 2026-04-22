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
  campaign_id: string;
}

interface CampaignSend {
  campaign_id: string;
  name: string;
  product_key: string;
  status: string;
  email: number;
  whatsapp: number;
  total: number;
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
        .select("channel, enrollment_id, mkt_sequence_enrollments!inner(campaign_id, mkt_campaigns!inner(org_id))")
        .eq("mkt_sequence_enrollments.mkt_campaigns.org_id", effectiveOrgId)
        .in("status", ["sent", "delivered"])
        .in("channel", ["email", "whatsapp"])
        .gte("created_at", `${today}T00:00:00Z`);
      if (error) throw error;
      // Flatten: extract campaign_id from nested join
      return (data ?? []).map((r: any) => ({
        channel: r.channel,
        campaign_id: r.mkt_sequence_enrollments?.campaign_id,
      }));
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60_000,
  });

  const isLoading = campLoading || actionsLoading;

  // Aggregate sends by campaign
  const sendsByCampaign = new Map<string, { email: number; whatsapp: number }>();
  for (const a of actions) {
    if (!a.campaign_id) continue;
    const existing = sendsByCampaign.get(a.campaign_id) ?? { email: 0, whatsapp: 0 };
    if (a.channel === "email") existing.email++;
    else if (a.channel === "whatsapp") existing.whatsapp++;
    sendsByCampaign.set(a.campaign_id, existing);
  }

  const rows: CampaignSend[] = campaigns.map((c) => {
    const counts = sendsByCampaign.get(c.id) ?? { email: 0, whatsapp: 0 };
    return {
      campaign_id: c.id,
      name: c.name,
      product_key: c.product_key,
      status: c.status,
      email: counts.email,
      whatsapp: counts.whatsapp,
      total: counts.email + counts.whatsapp,
    };
  });

  const totalEmail = rows.reduce((s, r) => s + r.email, 0);
  const totalWa    = rows.reduce((s, r) => s + r.whatsapp, 0);

  const dateLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Today — {dateLabel}</p>
          <p className="text-lg font-bold tabular-nums mt-0.5">
            {(totalEmail + totalWa).toLocaleString()} total sends
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Mail className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold tabular-nums">{totalEmail.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">emails</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold tabular-nums">{totalWa.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">WhatsApp</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Campaign</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Product</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> Email</span>
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> WA</span>
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isActive = row.status === "active";
              const isPaused = row.status === "paused";
              const hasSends = row.total > 0;
              return (
                <tr
                  key={row.campaign_id}
                  className={`border-b last:border-0 transition-colors ${
                    i % 2 === 0 ? "bg-background" : "bg-muted/10"
                  } ${!isActive ? "opacity-60" : ""}`}
                >
                  {/* Name */}
                  <td className="px-4 py-3">
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

                  {/* Product key */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {row.product_key}
                    </span>
                  </td>

                  {/* Status badge */}
                  <td className="px-4 py-3 text-center">
                    {isPaused ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] h-5 px-1.5">
                        paused
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] h-5 px-1.5">
                        active
                      </Badge>
                    )}
                  </td>

                  {/* Email */}
                  <td className="px-4 py-3 text-right">
                    <span className={`tabular-nums text-xs font-medium ${row.email > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                      {row.email > 0 ? row.email.toLocaleString() : "—"}
                    </span>
                  </td>

                  {/* WhatsApp */}
                  <td className="px-4 py-3 text-right">
                    <span className={`tabular-nums text-xs font-medium ${row.whatsapp > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      {row.whatsapp > 0 ? row.whatsapp.toLocaleString() : "—"}
                    </span>
                  </td>

                  {/* Total */}
                  <td className="px-4 py-3 text-right">
                    <span className={`tabular-nums text-xs font-bold ${row.total > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                      {row.total > 0 ? row.total.toLocaleString() : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Totals footer */}
          <tfoot>
            <tr className="bg-muted/40 border-t">
              <td className="px-4 py-2.5 text-xs font-semibold" colSpan={3}>Total</td>
              <td className="px-4 py-2.5 text-right text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {totalEmail.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {totalWa.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 text-right text-xs font-bold tabular-nums">
                {(totalEmail + totalWa).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground text-right">
        <RefreshCw className="h-2.5 w-2.5 inline mr-1" />
        Auto-refreshes every 60 s
      </p>
    </div>
  );
}
