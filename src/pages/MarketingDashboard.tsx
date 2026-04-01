import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  TrendingUp,
  Target,
  Users,
  Radio,
  Megaphone,
} from "lucide-react";
import { BreakpointBanner } from "@/components/Marketing/BreakpointBanner";
import { MarketingOverview } from "@/components/Marketing/MarketingOverview";
import { FinancialIntelligence } from "@/components/Marketing/FinancialIntelligence";
import { CampaignPerformance } from "@/components/Marketing/CampaignPerformance";
import { LeadFunnel } from "@/components/Marketing/LeadFunnel";
import { ChannelAnalytics } from "@/components/Marketing/ChannelAnalytics";

type PeriodOption = "7" | "30" | "90";

export default function MarketingDashboard() {
  const [period, setPeriod] = useState<PeriodOption>("30");
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const days = parseInt(period, 10);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["mkt-dashboard-overview"] });
    await queryClient.invalidateQueries({ queryKey: ["mkt-dashboard-campaigns"] });
    await queryClient.invalidateQueries({ queryKey: ["mkt-dashboard-leads-funnel"] });
    await queryClient.invalidateQueries({ queryKey: ["mkt-dashboard-channels"] });
    await queryClient.invalidateQueries({ queryKey: ["mkt-engine-metrics-weekly"] });
    await queryClient.invalidateQueries({ queryKey: ["mkt-breakpoints"] });
    setRefreshing(false);
  }, [queryClient]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Top Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Marketing Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              Revenue engine metrics, campaigns, and lead funnel analytics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7d</SelectItem>
                <SelectItem value="30">Last 30d</SelectItem>
                <SelectItem value="90">Last 90d</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline text-xs">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Breakpoint Banner */}
        <BreakpointBanner />

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="financial" className="gap-1.5">
              <Target className="h-3.5 w-3.5" />
              <span>Financial Intelligence</span>
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="gap-1.5">
              <Megaphone className="h-3.5 w-3.5" />
              <span>Campaigns</span>
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              <span>Leads & Funnel</span>
            </TabsTrigger>
            <TabsTrigger value="channels" className="gap-1.5">
              <Radio className="h-3.5 w-3.5" />
              <span>Channel Performance</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <MarketingOverview days={days} />
          </TabsContent>

          <TabsContent value="financial">
            <FinancialIntelligence />
          </TabsContent>

          <TabsContent value="campaigns">
            <CampaignPerformance days={days} />
          </TabsContent>

          <TabsContent value="leads">
            <LeadFunnel days={days} />
          </TabsContent>

          <TabsContent value="channels">
            <ChannelAnalytics days={days} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
