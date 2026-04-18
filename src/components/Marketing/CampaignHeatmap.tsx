import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface DailyRow {
  campaign_id: string;
  campaign_name: string;
  date: string;
  sent: number;
  failed: number;
  opens: number;
  clicks: number;
}

type Metric = "sent" | "opens" | "clicks" | "failed";

const METRICS: { key: Metric; label: string; rgb: [number, number, number] }[] = [
  { key: "sent",   label: "Sent",   rgb: [34, 197, 94]   },
  { key: "opens",  label: "Opens",  rgb: [59, 130, 246]  },
  { key: "clicks", label: "Clicks", rgb: [168, 85, 247]  },
  { key: "failed", label: "Failed", rgb: [239, 68, 68]   },
];

const CELL = 18;  // px
const GAP  = 2;   // px
const LABEL_W = 148; // px — campaign name column

function cellBg(val: number, maxVal: number, rgb: [number, number, number]) {
  if (!val) return "rgba(0,0,0,0.05)";
  const alpha = 0.15 + Math.min(1, val / maxVal) * 0.82;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function buildDateRange(days: number): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

export function CampaignHeatmap() {
  const { effectiveOrgId } = useOrgContext();
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<Metric>("sent");

  const { data: rows = [], isLoading } = useQuery<DailyRow[]>({
    queryKey: ["mkt-campaign-daily-stats", effectiveOrgId, days],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase.rpc("mkt_campaign_daily_stats", {
        p_org_id: effectiveOrgId,
        p_days: days,
      });
      if (error) throw error;
      return (data as DailyRow[]) || [];
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 120_000,
  });

  const dates = buildDateRange(days);

  // Unique campaigns preserving the order returned by the RPC
  const campaigns = [...new Map(rows.map((r) => [r.campaign_id, r.campaign_name])).entries()];

  // cell lookup: "campaign_id|date" → metric value
  const lookup = new Map<string, number>(
    rows.map((r) => [`${r.campaign_id}|${r.date}`, Number(r[metric])])
  );

  const maxVal = Math.max(1, ...rows.map((r) => Number(r[metric])));
  const activeMetric = METRICS.find((m) => m.key === metric)!;

  return (
    <Card className="p-3">
      <CardHeader className="p-0 pb-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm">Daily Campaign Heatmap</CardTitle>
            <CardDescription className="text-[10px]">
              Email actions per campaign per day
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Metric buttons */}
            <div className="flex gap-1">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    metric === m.key
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/60"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Day-range selector */}
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-background"
            >
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : campaigns.length === 0 ? (
          <p className="text-[10px] text-muted-foreground py-6 text-center">
            No email actions found in the last {days} days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-block">
              {/* Date header row */}
              <div className="flex" style={{ paddingLeft: LABEL_W + 8 }}>
                {dates.map((d, i) => {
                  const dd = new Date(d + "T00:00:00");
                  // Show label on the 1st of each month or every 7th day
                  const isMonthStart = dd.getDate() === 1;
                  const isWeekMark   = i % 7 === 0;
                  const showLabel    = isMonthStart || (i === 0) || (days <= 14 ? i % 2 === 0 : isWeekMark);
                  const label = showLabel
                    ? dd.toLocaleDateString("en-IN", { month: "short", day: "numeric" })
                    : "";
                  return (
                    <div
                      key={d}
                      style={{ width: CELL + GAP, flexShrink: 0 }}
                      className="text-[8px] text-muted-foreground overflow-hidden"
                    >
                      {label}
                    </div>
                  );
                })}
              </div>

              {/* Campaign rows */}
              {campaigns.map(([cid, cname]) => (
                <div
                  key={cid}
                  className="flex items-center"
                  style={{ marginBottom: GAP }}
                >
                  {/* Campaign label */}
                  <div
                    title={cname}
                    style={{ width: LABEL_W, flexShrink: 0, paddingRight: 8 }}
                    className="text-[10px] text-muted-foreground truncate text-right"
                  >
                    {cname}
                  </div>

                  {/* Cells */}
                  {dates.map((d) => {
                    const val = lookup.get(`${cid}|${d}`) ?? 0;
                    return (
                      <div
                        key={d}
                        title={`${cname} · ${d}\n${activeMetric.label}: ${val.toLocaleString()}`}
                        style={{
                          width: CELL,
                          height: CELL,
                          marginRight: GAP,
                          flexShrink: 0,
                          borderRadius: 3,
                          backgroundColor: cellBg(val, maxVal, activeMetric.rgb),
                        }}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Legend */}
              <div
                className="flex items-center gap-1 mt-3"
                style={{ paddingLeft: LABEL_W + 8 }}
              >
                <span className="text-[9px] text-muted-foreground mr-1">Low</span>
                {[0.1, 0.28, 0.46, 0.64, 0.82, 1.0].map((t) => (
                  <div
                    key={t}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      backgroundColor: `rgba(${activeMetric.rgb[0]},${activeMetric.rgb[1]},${activeMetric.rgb[2]},${0.15 + t * 0.82})`,
                    }}
                  />
                ))}
                <span className="text-[9px] text-muted-foreground ml-1">High</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
