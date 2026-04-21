import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Mail, MessageCircle, Phone, Search, BarChart2,
  Linkedin, FileText, Share2, CheckCircle, Clock, Pause, MinusCircle, TrendingUp,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProductChannelRow {
  product_key: string;
  channel: string;
  plan_status: string;
  planned_start_date: string | null;
  actual_start_date: string | null;
  sent: number;
  failed: number;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
  last_active_date: string | null;
  daily_7d_avg: number;
}

export interface Ga4ProductData {
  sessions: number;
  active_users: number;
  engaged_sessions: number;
}

// ─── Channel config ─────────────────────────────────────────────────────────

const CHANNELS: Array<{
  key: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
  darkBg: string;
  lightBg: string;
}> = [
  {
    key: "email",
    label: "Email",
    shortLabel: "Email",
    icon: <Mail className="h-3.5 w-3.5" />,
    color: "#3b82f6",
    darkBg: "bg-blue-600",
    lightBg: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    shortLabel: "WA",
    icon: <MessageCircle className="h-3.5 w-3.5" />,
    color: "#10b981",
    darkBg: "bg-emerald-600",
    lightBg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    key: "calling",
    label: "Calling",
    shortLabel: "Call",
    icon: <Phone className="h-3.5 w-3.5" />,
    color: "#8b5cf6",
    darkBg: "bg-violet-600",
    lightBg: "bg-violet-50 dark:bg-violet-950/30",
  },
  {
    key: "google_ads",
    label: "Google Ads",
    shortLabel: "GAds",
    icon: <Search className="h-3.5 w-3.5" />,
    color: "#f59e0b",
    darkBg: "bg-amber-500",
    lightBg: "bg-amber-50 dark:bg-amber-950/30",
  },
  {
    key: "meta_ads",
    label: "Meta Ads",
    shortLabel: "Meta",
    icon: <BarChart2 className="h-3.5 w-3.5" />,
    color: "#6366f1",
    darkBg: "bg-indigo-600",
    lightBg: "bg-indigo-50 dark:bg-indigo-950/30",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    shortLabel: "LI",
    icon: <Linkedin className="h-3.5 w-3.5" />,
    color: "#0077b5",
    darkBg: "bg-sky-700",
    lightBg: "bg-sky-50 dark:bg-sky-950/30",
  },
  {
    key: "blog",
    label: "Blog / SEO",
    shortLabel: "Blog",
    icon: <FileText className="h-3.5 w-3.5" />,
    color: "#06b6d4",
    darkBg: "bg-cyan-600",
    lightBg: "bg-cyan-50 dark:bg-cyan-950/30",
  },
  {
    key: "social",
    label: "Social",
    shortLabel: "Social",
    icon: <Share2 className="h-3.5 w-3.5" />,
    color: "#ec4899",
    darkBg: "bg-pink-600",
    lightBg: "bg-pink-50 dark:bg-pink-950/30",
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function ratePct(num: number, den: number): string {
  if (!den) return "—";
  return `${((num / den) * 100).toFixed(0)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function keyMetric(row: ProductChannelRow, ga4?: Ga4ProductData): { value: string; label: string } {
  const sent = Number(row.sent);
  const delivered = Number(row.delivered);
  const sessions = ga4?.sessions ?? 0;
  if (row.channel === "email" || row.channel === "whatsapp") {
    // GA4 sessions = real browser visits (bots can't execute JS). True click metric.
    if (sessions > 0 && sent > 0) return { value: ratePct(sessions, sent), label: "visit rate" };
    // Fallback before GA4 data arrives
    if (row.channel === "whatsapp") return { value: ratePct(delivered, sent), label: "delivered" };
    if (sent > 0) return { value: sent.toLocaleString(), label: "sent" };
    return { value: "—", label: "sent" };
  }
  if (sent > 0) return { value: sent.toLocaleString(), label: "sent" };
  return { value: "—", label: "sent" };
}

// ─── Cell components ─────────────────────────────────────────────────────────

function ActiveCell({
  row,
  ch,
  ga4,
}: {
  row: ProductChannelRow;
  ch: typeof CHANNELS[0];
  ga4?: Ga4ProductData;
}) {
  const { value, label } = keyMetric(row, ga4);
  const avg = Number(row.daily_7d_avg);
  const sessions = ga4?.sessions ?? 0;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`h-full rounded-lg ${ch.lightBg} border p-1.5 flex flex-col gap-1 cursor-default overflow-hidden`}
            style={{ borderColor: `${ch.color}55` }}
          >
            {/* ── STRATEGY tier: icon + start date + live pulse ── */}
            <div className="flex items-center justify-between">
              <span style={{ color: ch.color }}>{ch.icon}</span>
              <div className="flex items-center gap-1">
                {row.actual_start_date && (
                  <span className="text-[8px] text-muted-foreground leading-none">
                    {fmtDate(row.actual_start_date)}
                  </span>
                )}
                <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                    style={{ backgroundColor: ch.color }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-1.5 w-1.5"
                    style={{ backgroundColor: ch.color }}
                  />
                </span>
              </div>
            </div>

            {/* ── EXECUTION tier: key metric + 7d avg bar ── */}
            <div className="flex-1">
              <div className="text-sm font-bold tabular-nums leading-tight" style={{ color: ch.color }}>
                {value}
              </div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide leading-tight">{label}</div>
              {avg > 0 && (
                <div className="mt-0.5">
                  <div className="h-0.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (avg / 50) * 100)}%`,
                        backgroundColor: ch.color,
                        opacity: 0.6,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── OUTCOME tier: GA4 landing page sessions ── */}
            <div className="border-t pt-0.5" style={{ borderColor: `${ch.color}20` }}>
              {sessions > 0 ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
                    <TrendingUp className="h-2 w-2" />
                    <span>visits</span>
                  </div>
                  <span className="text-[10px] font-semibold tabular-nums" style={{ color: ch.color }}>
                    {sessions >= 1000 ? `${(sessions / 1000).toFixed(1)}k` : sessions}
                  </span>
                </div>
              ) : (
                <div className="text-[8px] text-muted-foreground/40 text-center">no visits</div>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          <div className="space-y-1">
            <div className="font-semibold">{ch.label}</div>
            <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Execution</div>
            <div>Sent: {Number(row.sent).toLocaleString()}</div>
            {row.channel === "email" && <div>Opens: {Number(row.opens).toLocaleString()} · Replies: {Number(row.replies).toLocaleString()}</div>}
            {row.channel === "whatsapp" && <div>Delivered: {Number(row.delivered).toLocaleString()} · Replies: {Number(row.replies).toLocaleString()}</div>}
            {avg > 0 && <div>{avg}/day 7-day avg</div>}
            {ga4 && (
              <>
                <div className="text-muted-foreground text-[10px] uppercase tracking-wide pt-0.5">Outcome (GA4)</div>
                <div>Sessions: {ga4.sessions.toLocaleString()} · Users: {ga4.active_users.toLocaleString()} · Engaged: {ga4.engaged_sessions.toLocaleString()}</div>
              </>
            )}
            {row.actual_start_date && (
              <div className="text-muted-foreground">Since {fmtDate(row.actual_start_date)}</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PlannedCell({ row, ch }: { row: ProductChannelRow; ch: typeof CHANNELS[0] }) {
  return (
    <div className="h-full rounded-lg bg-muted/20 border border-dashed border-muted-foreground/20 p-2 flex flex-col justify-between">
      <span className="text-muted-foreground/40">{ch.icon}</span>
      <div>
        <div className="flex items-center gap-1 mb-0.5">
          <Clock className="h-2.5 w-2.5 text-muted-foreground/50" />
          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Planned</span>
        </div>
        {row.planned_start_date ? (
          <div className="text-[9px] text-muted-foreground">{fmtDate(row.planned_start_date)}</div>
        ) : (
          <div className="text-[9px] text-muted-foreground/40">—</div>
        )}
      </div>
    </div>
  );
}

function PausedCell({ row, ch }: { row: ProductChannelRow; ch: typeof CHANNELS[0] }) {
  return (
    <div className="h-full rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 p-2 flex flex-col justify-between">
      <span className="text-amber-400/60">{ch.icon}</span>
      <div>
        <div className="flex items-center gap-1 mb-0.5">
          <Pause className="h-2.5 w-2.5 text-amber-500" />
          <span className="text-[9px] text-amber-600 uppercase tracking-wide">Paused</span>
        </div>
        <div className="text-[9px] text-muted-foreground">{Number(row.sent).toLocaleString()} sent</div>
      </div>
    </div>
  );
}

function NACell({ ch }: { ch: typeof CHANNELS[0] }) {
  return (
    <div className="h-full rounded-lg bg-muted/10 p-2 flex items-center justify-center">
      <MinusCircle className="h-3.5 w-3.5 text-muted-foreground/20" />
    </div>
  );
}

function Cell({
  row,
  ch,
  ga4,
}: {
  row: ProductChannelRow | undefined;
  ch: typeof CHANNELS[0];
  ga4?: Ga4ProductData;
}) {
  if (!row) return <NACell ch={ch} />;
  if (row.plan_status === "active") return <ActiveCell row={row} ch={ch} ga4={ga4} />;
  if (row.plan_status === "paused") return <PausedCell row={row} ch={ch} />;
  if (row.plan_status === "not_applicable") return <NACell ch={ch} />;
  return <PlannedCell row={row} ch={ch} />;
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-950/40 border border-blue-300/60" />
        <span>Active</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded bg-muted/20 border border-dashed border-muted-foreground/20" />
        <span>Planned</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60" />
        <span>Paused</span>
      </div>
      <div className="flex items-center gap-1.5">
        <MinusCircle className="h-3 w-3 text-muted-foreground/30" />
        <span>N/A</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StrategyGrid({
  rows,
  ga4Data,
}: {
  rows: ProductChannelRow[];
  ga4Data?: Map<string, Ga4ProductData>;
}) {
  // Group by product_key
  const productMap = new Map<string, Map<string, ProductChannelRow>>();
  for (const row of rows) {
    if (!productMap.has(row.product_key)) productMap.set(row.product_key, new Map());
    productMap.get(row.product_key)!.set(row.channel, row);
  }
  const products = [...productMap.keys()].sort();

  if (!products.length) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No channel plan data yet.
      </div>
    );
  }

  // Count status totals for header badge
  const activeCount = rows.filter(r => r.plan_status === "active").length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold">Channel Strategy Grid</span>
          <Badge className="bg-emerald-500 text-white text-[9px] h-4 px-1.5">{activeCount} active</Badge>
        </div>
        <Legend />
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[780px]">
          <thead>
            <tr className="border-b bg-muted/20">
              <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 py-2.5 w-28">
                Product
              </th>
              {CHANNELS.map(ch => (
                <th key={ch.key} className="text-center text-[10px] font-semibold px-2 py-2.5 min-w-[88px]">
                  <div className="flex flex-col items-center gap-1">
                    <span style={{ color: ch.color }}>{ch.icon}</span>
                    <span className="text-muted-foreground">{ch.shortLabel}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map((productKey) => {
              const channelData = productMap.get(productKey)!;
              const activeChannels = [...channelData.values()].filter(r => r.plan_status === "active").length;
              return (
                <tr key={productKey} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-2">
                    <div>
                      <div className="font-medium text-xs font-mono">{productKey}</div>
                      {activeChannels > 0 && (
                        <div className="text-[9px] text-muted-foreground mt-0.5">{activeChannels} channel{activeChannels !== 1 ? "s" : ""} live</div>
                      )}
                    </div>
                  </td>
                  {CHANNELS.map(ch => (
                    <td key={ch.key} className="px-2 py-2">
                      <div className="h-[96px]">
                        <Cell row={channelData.get(ch.key)} ch={ch} ga4={ga4Data?.get(productKey)} />
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
