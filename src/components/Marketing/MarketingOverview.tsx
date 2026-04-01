import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/common/LoadingState";
import {
  Megaphone,
  Users,
  UserCheck,
  Send,
  UserPlus,
  Target,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface MarketingOverviewProps {
  days: number;
}

interface OverviewStats {
  active_campaigns: number;
  leads_sourced: number;
  leads_converted: number;
  total_actions: number;
  active_enrollments: number;
  conversion_rate: number;
  funnel: {
    sourced: number;
    enriched: number;
    scored: number;
    enrolled: number;
    converted: number;
  };
  channel_performance: Array<{
    channel: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
  }>;
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "11px",
};

export function MarketingOverview({ days }: MarketingOverviewProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["mkt-dashboard-overview", days],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const { data: result, error } = await supabase.functions.invoke(
        "mkt-dashboard-stats",
        {
          body: { days, section: "overview" },
        }
      );

      if (error) throw error;
      return result as OverviewStats;
    },
  });

  if (isLoading) return <LoadingState message="Loading overview..." />;

  const stats = data ?? {
    active_campaigns: 0,
    leads_sourced: 0,
    leads_converted: 0,
    total_actions: 0,
    active_enrollments: 0,
    conversion_rate: 0,
    funnel: { sourced: 0, enriched: 0, scored: 0, enrolled: 0, converted: 0 },
    channel_performance: [],
  };

  const statCards = [
    {
      label: "Active Campaigns",
      value: stats.active_campaigns,
      icon: Megaphone,
      color: "text-blue-500",
    },
    {
      label: "Leads Sourced",
      value: stats.leads_sourced,
      icon: Users,
      color: "text-green-500",
    },
    {
      label: "Leads Converted",
      value: stats.leads_converted,
      icon: UserCheck,
      color: "text-emerald-500",
    },
    {
      label: "Total Actions",
      value: stats.total_actions,
      icon: Send,
      color: "text-purple-500",
    },
    {
      label: "Active Enrollments",
      value: stats.active_enrollments,
      icon: UserPlus,
      color: "text-orange-500",
    },
    {
      label: "Conversion Rate",
      value: `${(stats.conversion_rate ?? 0).toFixed(1)}%`,
      icon: Target,
      color: "text-rose-500",
    },
  ];

  const funnelData = [
    { stage: "Sourced", count: stats.funnel.sourced },
    { stage: "Enriched", count: stats.funnel.enriched },
    { stage: "Scored", count: stats.funnel.scored },
    { stage: "Enrolled", count: stats.funnel.enrolled },
    { stage: "Converted", count: stats.funnel.converted },
  ];

  return (
    <div className="space-y-4">
      {/* Stat Cards */}
      <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {card.label}
                </span>
                <Icon className={`h-3.5 w-3.5 ${card.color}`} />
              </div>
              <div className="text-xl font-bold mt-1">{card.value}</div>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Lead Funnel */}
        <Card className="p-3">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-sm">Lead Funnel</CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Pipeline stages from sourced to converted
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {funnelData.every((d) => d.count === 0) ? (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-xs">
                No funnel data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={funnelData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                    horizontal={false}
                  />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    tick={{ fontSize: 10 }}
                    width={60}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="count"
                    fill="#8B5CF6"
                    radius={[0, 4, 4, 0]}
                    name="Leads"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Channel Performance */}
        <Card className="p-3">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-sm">Channel Performance</CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Actions by channel: sent, opened, clicked, replied
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {stats.channel_performance.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-xs">
                No channel data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={stats.channel_performance}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis dataKey="channel" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} iconSize={8} />
                  <Bar dataKey="sent" fill="#3B82F6" name="Sent" />
                  <Bar dataKey="opened" fill="#22C55E" name="Opened" />
                  <Bar dataKey="clicked" fill="#F59E0B" name="Clicked" />
                  <Bar dataKey="replied" fill="#8B5CF6" name="Replied" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
