import {
  Mail, MessageCircle, Phone, Search, BarChart2,
  Linkedin, FileText, Share2, ArrowRight, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProductChannelRow } from "./StrategyGrid";

// ─── Stage definitions ───────────────────────────────────────────────────────

interface Stage {
  key: string;
  label: string;
  subtitle: string;
  channels: string[];
  color: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}

const STAGES: Stage[] = [
  {
    key: "awareness",
    label: "Awareness",
    subtitle: "Reach & discovery",
    channels: ["google_ads", "meta_ads", "linkedin", "blog", "social"],
    color: "#6366f1",
    bgClass: "bg-indigo-50 dark:bg-indigo-950/30",
    borderClass: "border-indigo-200 dark:border-indigo-800/50",
    textClass: "text-indigo-600 dark:text-indigo-400",
  },
  {
    key: "outreach",
    label: "Outreach",
    subtitle: "Direct engagement",
    channels: ["email", "whatsapp"],
    color: "#10b981",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/30",
    borderClass: "border-emerald-200 dark:border-emerald-800/50",
    textClass: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "conversion",
    label: "Conversion",
    subtitle: "High-touch close",
    channels: ["calling"],
    color: "#8b5cf6",
    bgClass: "bg-violet-50 dark:bg-violet-950/30",
    borderClass: "border-violet-200 dark:border-violet-800/50",
    textClass: "text-violet-600 dark:text-violet-400",
  },
];

// ─── Channel icon + label ────────────────────────────────────────────────────

const CHANNEL_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  email:      { icon: <Mail className="h-3 w-3" />,        label: "Email",      color: "#3b82f6" },
  whatsapp:   { icon: <MessageCircle className="h-3 w-3" />, label: "WhatsApp", color: "#10b981" },
  calling:    { icon: <Phone className="h-3 w-3" />,        label: "Calling",   color: "#8b5cf6" },
  google_ads: { icon: <Search className="h-3 w-3" />,       label: "Google Ads",color: "#f59e0b" },
  meta_ads:   { icon: <BarChart2 className="h-3 w-3" />,    label: "Meta Ads",  color: "#6366f1" },
  linkedin:   { icon: <Linkedin className="h-3 w-3" />,     label: "LinkedIn",  color: "#0077b5" },
  blog:       { icon: <FileText className="h-3 w-3" />,     label: "Blog",      color: "#06b6d4" },
  social:     { icon: <Share2 className="h-3 w-3" />,       label: "Social",    color: "#ec4899" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ratePct(num: number, den: number): string {
  if (!den) return "—";
  return `${((num / den) * 100).toFixed(0)}%`;
}

function stageSummary(channelRows: ProductChannelRow[], stage: Stage): {
  activeChannels: ProductChannelRow[];
  plannedChannels: string[];
  totalSent: number;
  totalEngaged: number;
} {
  const active: ProductChannelRow[] = [];
  const planned: string[] = [];
  for (const ch of stage.channels) {
    const row = channelRows.find(r => r.channel === ch);
    if (row?.plan_status === "active") active.push(row);
    else if (row?.plan_status === "planned") planned.push(ch);
    else if (!row) planned.push(ch);
  }
  const totalSent = active.reduce((s, r) => s + Number(r.sent), 0);
  const totalEngaged = active.reduce((s, r) => {
    return s + Number(r.opens) + Number(r.clicks) + Number(r.replies) + Number(r.delivered);
  }, 0);
  return { activeChannels: active, plannedChannels: planned, totalSent, totalEngaged };
}

// ─── Channel pill ─────────────────────────────────────────────────────────────

function ChannelPill({ row }: { row: ProductChannelRow }) {
  const meta = CHANNEL_META[row.channel];
  if (!meta) return null;
  const sent = Number(row.sent);
  const metric = (() => {
    if (row.channel === "email") return ratePct(Number(row.opens), sent);
    if (row.channel === "whatsapp") return ratePct(Number(row.delivered), sent);
    if (sent > 0) return sent.toLocaleString();
    return null;
  })();

  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium border"
      style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}12` }}
    >
      {meta.icon}
      <span>{meta.label}</span>
      {metric && (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span className="tabular-nums font-bold">{metric}</span>
        </>
      )}
    </div>
  );
}

function PlannedPill({ channel }: { channel: string }) {
  const meta = CHANNEL_META[channel];
  if (!meta) return null;
  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] border border-dashed border-muted-foreground/25 text-muted-foreground/50"
    >
      {meta.icon}
      <span>{meta.label}</span>
    </div>
  );
}

// ─── Stage cell ──────────────────────────────────────────────────────────────

function StageCell({ productRows, stage }: { productRows: ProductChannelRow[]; stage: Stage }) {
  const { activeChannels, plannedChannels, totalSent } = stageSummary(productRows, stage);
  const hasActivity = activeChannels.length > 0;

  return (
    <div
      className={`rounded-xl p-3 border min-h-[100px] flex flex-col gap-2 ${
        hasActivity
          ? `${stage.bgClass} ${stage.borderClass}`
          : "bg-muted/10 border-muted/30"
      }`}
    >
      {/* Active channels */}
      {hasActivity ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {activeChannels.map(row => <ChannelPill key={row.channel} row={row} />)}
          </div>
          {totalSent > 0 && (
            <div className="text-[9px] text-muted-foreground mt-auto">
              {totalSent.toLocaleString()} total sent
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {plannedChannels.slice(0, 3).map(ch => <PlannedPill key={ch} channel={ch} />)}
            {plannedChannels.length > 3 && (
              <span className="text-[9px] text-muted-foreground self-center">
                +{plannedChannels.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Funnel progress bar ─────────────────────────────────────────────────────

function FunnelProgress({ productRows }: { productRows: ProductChannelRow[] }) {
  const stageActive = STAGES.map(stage =>
    stage.channels.some(ch => productRows.find(r => r.channel === ch)?.plan_status === "active")
  );
  const count = stageActive.filter(Boolean).length;

  return (
    <div className="flex items-center gap-1">
      {STAGES.map((stage, i) => (
        <div key={stage.key} className="flex items-center gap-1">
          <div
            className="h-1.5 w-8 rounded-full"
            style={{ backgroundColor: stageActive[i] ? stage.color : "#e5e7eb" }}
          />
          {i < STAGES.length - 1 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/30" />}
        </div>
      ))}
      <span className="text-[9px] text-muted-foreground ml-1">{count}/{STAGES.length} stages</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function JourneyLanes({ rows }: { rows: ProductChannelRow[] }) {
  // Group by product
  const productMap = new Map<string, ProductChannelRow[]>();
  for (const row of rows) {
    if (!productMap.has(row.product_key)) productMap.set(row.product_key, []);
    productMap.get(row.product_key)!.push(row);
  }
  const products = [...productMap.keys()].sort();

  if (!products.length) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No journey data yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stage header */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "160px 1fr" }}>
        <div /> {/* product label column spacer */}
        <div className="grid grid-cols-3 gap-3">
          {STAGES.map(stage => (
            <div key={stage.key} className="text-center">
              <div className={`text-xs font-bold ${stage.textClass}`}>{stage.label}</div>
              <div className="text-[9px] text-muted-foreground">{stage.subtitle}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Connector line */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "160px 1fr" }}>
        <div />
        <div className="relative">
          <div className="absolute inset-y-1/2 inset-x-0 h-px bg-gradient-to-r from-indigo-300 via-emerald-300 to-violet-300 opacity-40" />
          <div className="grid grid-cols-3 gap-3 relative">
            {STAGES.map(stage => (
              <div key={stage.key} className="flex justify-center">
                <div className="h-4 w-px" style={{ backgroundColor: stage.color, opacity: 0.4 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Product rows */}
      <div className="space-y-3">
        {products.map(productKey => {
          const productRows = productMap.get(productKey)!;
          return (
            <div key={productKey} className="grid gap-3 items-start" style={{ gridTemplateColumns: "160px 1fr" }}>
              {/* Product label */}
              <div className="flex flex-col gap-1 pt-3">
                <div className="font-mono text-xs font-semibold truncate">{productKey}</div>
                <FunnelProgress productRows={productRows} />
              </div>

              {/* Stage cells */}
              <div className="grid grid-cols-3 gap-3">
                {STAGES.map(stage => (
                  <StageCell key={stage.key} productRows={productRows} stage={stage} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-2 border-t">
        <Zap className="h-3 w-3 text-muted-foreground/50" />
        <span>Solid pills = active channels with live metrics · Dashed pills = planned / not yet started</span>
      </div>
    </div>
  );
}
