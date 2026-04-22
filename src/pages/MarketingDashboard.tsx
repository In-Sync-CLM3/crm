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
  CalendarDays,
} from "lucide-react";
import { BreakpointBanner } from "@/components/Marketing/BreakpointBanner";
import { DailyReport } from "@/components/Marketing/DailyReport";
import { MarketingOverview } from "@/components/Marketing/MarketingOverview";
import { FinancialIntelligence } from "@/components/Marketing/FinancialIntelligence";
import { CampaignPerformance } from "@/components/Marketing/CampaignPerformance";
import { LeadFunnel } from "@/components/Marketing/LeadFunnel";
import { ChannelAnalytics } from "@/components/Marketing/ChannelAnalytics";
import { MilestoneTracker } from "@/components/Marketing/MilestoneTracker";
import { ICPPanel } from "@/components/Marketing/ICPPanel";
import { useOrgData } from "@/hooks/useOrgData";

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
    await queryClient.invalidateQueries({ queryKey: ["daily-report-campaigns"] });
    await queryClient.invalidateQueries({ queryKey: ["daily-report-actions"] });
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
            <TabsTrigger value="icp" className="gap-1.5">
              <Target className="h-3.5 w-3.5" />
              <span>ICP Intelligence</span>
            </TabsTrigger>
            <TabsTrigger value="daily" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Today's Report</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="space-y-4">
              <MilestoneTracker />
              <MarketingOverview days={days} />
            </div>
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

          <TabsContent value="icp">
            <ICPIntelligenceTab />
          </TabsContent>

          <TabsContent value="daily">
            <DailyReport />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function ICPIntelligenceTab() {
  const { data: products = [], isLoading } = useOrgData<{
    id: string;
    product_key: string;
    product_name: string;
    active: boolean;
    onboarding_status: string;
  }>("mkt_products", {
    select: "id,product_key,product_name,active,onboarding_status",
    orderBy: { column: "created_at", ascending: false },
  });

  const onboarded = products.filter((p) => p.onboarding_status === "complete");

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading products…
      </div>
    );
  }

  if (onboarded.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No onboarded products yet. Complete product onboarding to see ICP intelligence.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pt-2">
      {onboarded.map((p) => (
        <ICPPanel
          key={p.product_key}
          productKey={p.product_key}
          productName={p.product_name}
          compact
        />
      ))}
    </div>
  );
}
