import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState } from "@/components/common/LoadingState";
import { IndianRupee, TrendingUp, Target, BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";

function formatRupees(paise: number): string {
  const r = Math.round(paise / 100);
  if (Math.abs(r) >= 100000) return `\u20B9${(r / 100000).toFixed(2)}L`;
  return `\u20B9${r.toLocaleString("en-IN")}`;
}

function formatPct(value: number): string {
  return `${(value / 100).toFixed(1)}%`;
}

type HealthLevel = "green" | "amber" | "red";

function getHealthBadge(level: HealthLevel) {
  const variants: Record<HealthLevel, { variant: "default" | "secondary" | "destructive"; label: string }> = {
    green: { variant: "default", label: "Healthy" },
    amber: { variant: "secondary", label: "Warning" },
    red: { variant: "destructive", label: "Critical" },
  };
  const cfg = variants[level];
  return (
    <Badge
      variant={cfg.variant}
      className={
        level === "green"
          ? "bg-green-500 hover:bg-green-600 text-white"
          : level === "amber"
          ? "bg-amber-500 hover:bg-amber-600 text-white"
          : ""
      }
    >
      {cfg.label}
    </Badge>
  );
}

function mrrHealth(value: number, target: number): HealthLevel {
  if (target === 0) return "green";
  const ratio = value / target;
  if (ratio >= 0.9) return "green";
  if (ratio >= 0.7) return "amber";
  return "red";
}

function grossMarginHealth(pct: number): HealthLevel {
  const v = pct / 100;
  if (v >= 65) return "green";
  if (v >= 50) return "amber";
  return "red";
}

function cacHealth(paise: number): HealthLevel {
  const rupees = paise / 100;
  if (rupees <= 5000) return "green";
  if (rupees <= 8000) return "amber";
  return "red";
}

function ltvCacHealth(ratio: number): HealthLevel {
  if (ratio >= 12) return "green";
  if (ratio >= 8) return "amber";
  return "red";
}

interface MetricRow {
  id: string;
  period_end: string;
  period_type: string;
  mrr_total: number | null;
  mrr_target: number | null;
  gross_margin_pct: number | null;
  cac_blended: number | null;
  cac_organic: number | null;
  cac_paid: number | null;
  ltv_cac_ratio: number | null;
  ltv_india_single: number | null;
  ltv_india_cross: number | null;
  ltv_intl_single: number | null;
  ltv_intl_cross: number | null;
  payback_organic_months: number | null;
  payback_paid_months: number | null;
  cost_infrastructure: number | null;
  cost_variable: number | null;
  cost_ads: number | null;
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "11px",
};

export function FinancialIntelligence() {
  const { data: metricsRaw = [], isLoading } = useQuery({
    queryKey: ["mkt-engine-metrics-weekly"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mkt_engine_metrics")
        .select("*")
        .eq("period_type", "weekly")
        .order("period_end", { ascending: false })
        .limit(12);

      if (error) {
        console.error("Failed to fetch metrics:", error);
        return [];
      }
      return (data ?? []) as MetricRow[];
    },
  });

  if (isLoading) return <LoadingState message="Loading financial data..." />;

  // Most recent week for top-level cards
  const latest = metricsRaw[0] ?? null;

  // Sorted oldest-first for trend charts
  const metrics = [...metricsRaw].reverse();

  const mrr = latest?.mrr_total ?? 0;
  const mrrTarget = latest?.mrr_target ?? 0;
  const grossMarginPct = latest?.gross_margin_pct ?? 0;
  const blendedCac = latest?.cac_blended ?? 0;
  const ltvCacRatio = latest?.ltv_cac_ratio ?? 0;

  // CAC by channel chart data
  const cacChannelData = metrics.map((m) => ({
    week: m.period_end?.slice(5) ?? "",
    Organic: (m.cac_organic ?? 0) / 100,
    Paid: (m.cac_paid ?? 0) / 100,
  }));

  // Payback period data
  const paybackData = [
    { channel: "Organic", months: latest?.payback_organic_months ?? 0 },
    { channel: "Paid", months: latest?.payback_paid_months ?? 0 },
  ];

  // LTV by segment table data
  const ltvSegments = [
    { segment: "India Single", ltv: latest?.ltv_india_single ?? 0 },
    { segment: "India Cross", ltv: latest?.ltv_india_cross ?? 0 },
    { segment: "Intl Single", ltv: latest?.ltv_intl_single ?? 0 },
    { segment: "Intl Cross", ltv: latest?.ltv_intl_cross ?? 0 },
  ];

  // Waterfall data
  const infra = (latest?.cost_infrastructure ?? 0) / 100;
  const variable = (latest?.cost_variable ?? 0) / 100;
  const ads = (latest?.cost_ads ?? 0) / 100;
  const mrrRupees = mrr / 100;
  const netMargin = mrrRupees - infra - variable - ads;

  const waterfallData = [
    {
      category: "MRR",
      amount: mrrRupees,
      pct: 100,
    },
    {
      category: "Infrastructure",
      amount: -infra,
      pct: mrrRupees > 0 ? (infra / mrrRupees) * 100 : 0,
    },
    {
      category: "Variable",
      amount: -variable,
      pct: mrrRupees > 0 ? (variable / mrrRupees) * 100 : 0,
    },
    {
      category: "Google Ads",
      amount: -ads,
      pct: mrrRupees > 0 ? (ads / mrrRupees) * 100 : 0,
    },
    {
      category: "Net Margin",
      amount: netMargin,
      pct: mrrRupees > 0 ? (netMargin / mrrRupees) * 100 : 0,
    },
  ];

  // Trend data
  const trendMrrGrowth = metrics.map((m, i) => {
    const prev = i > 0 ? metrics[i - 1].mrr_total ?? 0 : 0;
    const curr = m.mrr_total ?? 0;
    const growth = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    return { week: m.period_end?.slice(5) ?? "", value: parseFloat(growth.toFixed(1)) };
  });

  const trendCac = metrics.map((m) => ({
    week: m.period_end?.slice(5) ?? "",
    value: (m.cac_blended ?? 0) / 100,
  }));

  const trendLtvCac = metrics.map((m) => ({
    week: m.period_end?.slice(5) ?? "",
    value: m.ltv_cac_ratio ?? 0,
  }));

  const trendGrossMargin = metrics.map((m) => ({
    week: m.period_end?.slice(5) ?? "",
    value: (m.gross_margin_pct ?? 0) / 100,
  }));

  if (!latest) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        No financial metrics data available yet. Metrics will appear once the engine processes its first week.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Metric Cards */}
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">MRR</span>
            <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="text-xl font-bold mt-1">{formatRupees(mrr)}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground">
              Target: {formatRupees(mrrTarget)}
            </span>
            {getHealthBadge(mrrHealth(mrr, mrrTarget))}
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Gross Margin</span>
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="text-xl font-bold mt-1">{formatPct(grossMarginPct)}</div>
          <div className="mt-1">{getHealthBadge(grossMarginHealth(grossMarginPct))}</div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Blended CAC</span>
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="text-xl font-bold mt-1">{formatRupees(blendedCac)}</div>
          <div className="mt-1">{getHealthBadge(cacHealth(blendedCac))}</div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">LTV:CAC Ratio</span>
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="text-xl font-bold mt-1">{ltvCacRatio.toFixed(1)}x</div>
          <div className="mt-1">{getHealthBadge(ltvCacHealth(ltvCacRatio))}</div>
        </Card>
      </div>

      {/* CAC by Channel + Payback Period */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="p-3">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-sm">CAC by Channel</CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Customer acquisition cost: Organic vs Paid
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {cacChannelData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-xs">
                No CAC data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={cacChannelData}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" tick={{ fontSize: 9 }} />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    tickFormatter={(v) => `\u20B9${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [`\u20B9${value.toLocaleString("en-IN")}`, undefined]}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px" }} iconSize={8} />
                  <ReferenceLine y={8000} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: "Amber", fontSize: 9 }} />
                  <ReferenceLine y={12000} stroke="#EF4444" strokeDasharray="3 3" label={{ value: "Red", fontSize: 9 }} />
                  <Bar dataKey="Organic" fill="#22C55E" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Paid" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="p-3">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-sm">Payback Period</CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Months to recover CAC by channel
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={paybackData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} unit=" mo" />
                <YAxis type="category" dataKey="channel" tick={{ fontSize: 10 }} width={60} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value} months`, undefined]} />
                <ReferenceLine x={5} stroke="#22C55E" strokeDasharray="3 3" label={{ value: "5mo", fontSize: 9 }} />
                <ReferenceLine x={9} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: "9mo", fontSize: 9 }} />
                <ReferenceLine x={12} stroke="#EF4444" strokeDasharray="3 3" label={{ value: "12mo", fontSize: 9 }} />
                <Bar dataKey="months" fill="#8B5CF6" radius={[0, 4, 4, 0]} name="Payback" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* LTV by Segment Table */}
      <Card className="p-3">
        <CardHeader className="p-0 pb-2">
          <CardTitle className="text-sm">LTV by Segment</CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Lifetime value across customer segments
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Segment</TableHead>
                <TableHead className="text-xs text-right">LTV</TableHead>
                <TableHead className="text-xs text-right">Risk-adj LTV</TableHead>
                <TableHead className="text-xs text-right">CAC</TableHead>
                <TableHead className="text-xs text-right">LTV:CAC</TableHead>
                <TableHead className="text-xs text-right">Payback</TableHead>
                <TableHead className="text-xs text-center">Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ltvSegments.map((seg) => {
                const ltv = seg.ltv;
                const riskAdj = Math.round(ltv * 0.85);
                const cac = blendedCac;
                const ratio = cac > 0 ? ltv / cac : 0;
                const payback = cac > 0 ? ((cac / 100) / ((ltv / 100) / 24)).toFixed(1) : "N/A";
                const health = ltvCacHealth(ratio);

                return (
                  <TableRow key={seg.segment}>
                    <TableCell className="text-xs font-medium">{seg.segment}</TableCell>
                    <TableCell className="text-xs text-right">{formatRupees(ltv)}</TableCell>
                    <TableCell className="text-xs text-right">{formatRupees(riskAdj)}</TableCell>
                    <TableCell className="text-xs text-right">{formatRupees(cac)}</TableCell>
                    <TableCell className="text-xs text-right">{ratio.toFixed(1)}x</TableCell>
                    <TableCell className="text-xs text-right">{payback} mo</TableCell>
                    <TableCell className="text-xs text-center">{getHealthBadge(health)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* MRR Cost Waterfall */}
      <Card className="p-3">
        <CardHeader className="p-0 pb-2">
          <CardTitle className="text-sm">MRR Cost Waterfall</CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Revenue breakdown: MRR minus costs equals net margin
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={waterfallData}
              layout="vertical"
              margin={{ top: 5, right: 60, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 9 }}
                tickFormatter={(v) =>
                  `\u20B9${Math.abs(v) >= 100000 ? `${(v / 100000).toFixed(1)}L` : v.toLocaleString("en-IN")}`
                }
              />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={80} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, _name: string, entry: { payload: { pct: number } }) => {
                  const pct = entry.payload.pct;
                  return [
                    `\u20B9${Math.abs(value).toLocaleString("en-IN")} (${pct.toFixed(1)}% of MRR)`,
                    undefined,
                  ];
                }}
              />
              <Bar
                dataKey="amount"
                name="Amount"
                radius={[0, 4, 4, 0]}
                fill="#3B82F6"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 12-week Trend Lines */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <TrendCard
          title="MRR Growth Rate"
          subtitle="Week-over-week growth %"
          data={trendMrrGrowth}
          color="#22C55E"
          unit="%"
          refLines={[
            { y: 5, color: "#22C55E", label: "Target 5%" },
          ]}
        />
        <TrendCard
          title="Blended CAC"
          subtitle="Customer acquisition cost trend"
          data={trendCac}
          color="#3B82F6"
          unit="\u20B9"
          formatValue={(v) => `\u20B9${v.toLocaleString("en-IN")}`}
          refLines={[
            { y: 5000, color: "#22C55E", label: "\u20B95k" },
            { y: 8000, color: "#F59E0B", label: "\u20B98k" },
          ]}
        />
        <TrendCard
          title="LTV:CAC Ratio"
          subtitle="Lifetime value to acquisition cost"
          data={trendLtvCac}
          color="#8B5CF6"
          unit="x"
          refLines={[
            { y: 12, color: "#22C55E", label: "12x" },
            { y: 8, color: "#F59E0B", label: "8x" },
          ]}
        />
        <TrendCard
          title="Gross Margin"
          subtitle="Weekly gross margin %"
          data={trendGrossMargin}
          color="#F97316"
          unit="%"
          refLines={[
            { y: 65, color: "#22C55E", label: "65%" },
            { y: 50, color: "#F59E0B", label: "50%" },
          ]}
        />
      </div>
    </div>
  );
}

interface TrendCardProps {
  title: string;
  subtitle: string;
  data: Array<{ week: string; value: number }>;
  color: string;
  unit: string;
  formatValue?: (v: number) => string;
  refLines?: Array<{ y: number; color: string; label: string }>;
}

function TrendCard({ title, subtitle, data, color, unit, formatValue, refLines = [] }: TrendCardProps) {
  return (
    <Card className="p-3">
      <CardHeader className="p-0 pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="p-0">
        {data.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs">
            No trend data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="week" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                width={50}
                tickFormatter={(v) => (formatValue ? formatValue(v) : `${v}${unit}`)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [
                  formatValue ? formatValue(value) : `${value}${unit}`,
                  title,
                ]}
              />
              {refLines.map((rl) => (
                <ReferenceLine
                  key={rl.label}
                  y={rl.y}
                  stroke={rl.color}
                  strokeDasharray="4 4"
                  label={{ value: rl.label, fontSize: 9, fill: rl.color }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
