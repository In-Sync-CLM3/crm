import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/common/LoadingState";
import { Users, Target, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface LeadFunnelProps {
  days: number;
}

interface FunnelData {
  funnel: Array<{
    stage: string;
    count: number;
    conversion_rate: number;
  }>;
  by_status: Array<{ name: string; value: number }>;
  by_source: Array<{ name: string; value: number }>;
  score_distribution: Array<{ range: string; count: number }>;
  total_leads: number;
  avg_score: number;
  conversion_rate: number;
}

const PIE_COLORS = [
  "#3B82F6",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "11px",
};

export function LeadFunnel({ days }: LeadFunnelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["mkt-dashboard-leads-funnel", days],
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke(
        "mkt-dashboard-stats",
        {
          body: { days, section: "leads,funnel" },
        }
      );

      if (error) throw error;
      return result as FunnelData;
    },
  });

  if (isLoading) return <LoadingState message="Loading lead funnel..." />;

  const funnelData = data?.funnel ?? [];
  const byStatus = data?.by_status ?? [];
  const bySource = data?.by_source ?? [];
  const scoreDist = data?.score_distribution ?? [];
  const totalLeads = data?.total_leads ?? 0;
  const avgScore = data?.avg_score ?? 0;
  const conversionRate = data?.conversion_rate ?? 0;

  const hasFunnelData = funnelData.some((d) => d.count > 0);
  const hasStatusData = byStatus.some((d) => d.value > 0);
  const hasSourceData = bySource.some((d) => d.value > 0);
  const hasScoreData = scoreDist.some((d) => d.count > 0);

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid gap-2 grid-cols-3">
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Leads</span>
            <Users className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-bold mt-1">{totalLeads.toLocaleString()}</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Avg Score</span>
            <TrendingUp className="h-3.5 w-3.5 text-green-500" />
          </div>
          <div className="text-xl font-bold mt-1">{(avgScore ?? 0).toFixed(1)}</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Conversion Rate</span>
            <Target className="h-3.5 w-3.5 text-purple-500" />
          </div>
          <div className="text-xl font-bold mt-1">{(conversionRate ?? 0).toFixed(1)}%</div>
        </Card>
      </div>

      {/* Funnel Visualization */}
      <Card className="p-3">
        <CardHeader className="p-0 pb-2">
          <CardTitle className="text-sm">Lead Funnel</CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Stage-by-stage progression with conversion rates
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {!hasFunnelData ? (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground text-xs">
              No funnel data available yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={funnelData}
                layout="vertical"
                margin={{ top: 5, right: 80, left: 80, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tick={{ fontSize: 10 }}
                  width={80}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, _name: string, entry: { payload: { conversion_rate: number } }) => [
                    `${(value ?? 0).toLocaleString()} (${(entry.payload.conversion_rate ?? 0).toFixed(1)}% conv.)`,
                    "Leads",
                  ]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Leads">
                  {funnelData.map((_entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Breakdown Charts */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {/* By Status */}
        <Card className="p-3">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-sm">By Status</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!hasStatusData ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-xs">
                No status data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={byStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    nameKey="name"
                    paddingAngle={2}
                  >
                    {byStatus.map((_entry, index) => (
                      <Cell
                        key={`status-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    wrapperStyle={{ fontSize: "10px" }}
                    iconSize={8}
                    layout="horizontal"
                    verticalAlign="bottom"
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* By Source */}
        <Card className="p-3">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-sm">By Source</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!hasSourceData ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-xs">
                No source data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={bySource}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    nameKey="name"
                    paddingAngle={2}
                  >
                    {bySource.map((_entry, index) => (
                      <Cell
                        key={`source-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    wrapperStyle={{ fontSize: "10px" }}
                    iconSize={8}
                    layout="horizontal"
                    verticalAlign="bottom"
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Score Distribution */}
        <Card className="p-3">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-sm">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!hasScoreData ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-xs">
                No score data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={scoreDist}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="range" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#8B5CF6" radius={[2, 2, 0, 0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
