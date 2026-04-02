import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Pause,
  Play,
  SkipForward,
  Trash2,
  ChevronDown,
  ChevronRight,
  Mail,
  MessageSquare,
  Phone,
  Send,
  RefreshCw,
  ChevronLeft,
} from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrollmentRow {
  id: string;
  org_id: string;
  lead_id: string;
  campaign_id: string;
  current_step: number;
  status: string;
  next_action_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  // joined
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_email: string | null;
  lead_company: string | null;
  campaign_name: string;
  campaign_status: string;
  total_steps: number;
  current_step_channel: string | null;
}

interface ActionRow {
  id: string;
  step_number: number;
  channel: string;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
}

interface CampaignOption {
  id: string;
  name: string;
}

type EnrollmentStatus = "active" | "paused" | "completed" | "cancelled";
type ChannelFilter = "all" | "email" | "whatsapp" | "call";

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = d.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);
  const isFuture = diffMs > 0;

  if (absDiff < 60_000) {
    return isFuture ? "in <1 min" : "just now";
  }
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000);
    return isFuture ? `in ${mins} min` : `${mins} min ago`;
  }
  if (absDiff < 86_400_000) {
    const hrs = Math.round(absDiff / 3_600_000);
    return isFuture ? `in ${hrs}h` : `${hrs}h ago`;
  }
  const days = Math.round(absDiff / 86_400_000);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function enrollmentStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700 border-green-200";
    case "paused":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "completed":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "cancelled":
    case "failed":
    case "bounced":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function actionStatusColor(status: string): string {
  switch (status) {
    case "sent":
    case "delivered":
      return "bg-green-100 text-green-700 border-green-200";
    case "pending":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "failed":
    case "bounced":
      return "bg-red-100 text-red-700 border-red-200";
    case "skipped":
      return "bg-amber-100 text-amber-700 border-amber-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function channelIcon(channel: string) {
  switch (channel) {
    case "email":
      return <Mail className="h-3.5 w-3.5" />;
    case "whatsapp":
      return <MessageSquare className="h-3.5 w-3.5" />;
    case "call":
      return <Phone className="h-3.5 w-3.5" />;
    case "sms":
      return <Send className="h-3.5 w-3.5" />;
    default:
      return null;
  }
}

function leadName(row: EnrollmentRow): string {
  const parts = [row.lead_first_name, row.lead_last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unknown Lead";
}

// ===========================================================================
// Main component
// ===========================================================================

export default function EnrollmentBrowser() {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();

  // Filter state
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [dueSoonOnly, setDueSoonOnly] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Refresh
  const [refreshing, setRefreshing] = useState(false);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  // Campaign list for filter dropdown
  const { data: campaignOptions = [] } = useQuery({
    queryKey: ["enrollment-browser-campaigns", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_campaigns")
        .select("id, name")
        .eq("org_id", effectiveOrgId)
        .order("name");
      if (error) throw error;
      return (data || []) as CampaignOption[];
    },
    enabled: !!effectiveOrgId,
  });

  // Main enrollments query
  const {
    data: enrollmentsResult,
    isLoading: enrollmentsLoading,
  } = useQuery({
    queryKey: [
      "enrollment-browser",
      effectiveOrgId,
      campaignFilter,
      statusFilter,
      channelFilter,
      dueSoonOnly,
      page,
    ],
    queryFn: async () => {
      if (!effectiveOrgId) return { rows: [], total: 0 };

      // Build query for enrollments with joins
      let query = supabase
        .from("mkt_sequence_enrollments")
        .select(
          `
          id,
          org_id,
          lead_id,
          campaign_id,
          current_step,
          status,
          next_action_at,
          enrolled_at,
          completed_at,
          cancelled_at,
          cancel_reason,
          mkt_leads!inner (
            first_name,
            last_name,
            email,
            company
          ),
          mkt_campaigns!inner (
            name,
            status
          )
        `,
          { count: "exact" }
        )
        .eq("org_id", effectiveOrgId)
        .order("enrolled_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      // Apply filters
      if (campaignFilter !== "all") {
        query = query.eq("campaign_id", campaignFilter);
      }
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (dueSoonOnly) {
        const oneHourFromNow = new Date(
          Date.now() + 60 * 60 * 1000
        ).toISOString();
        query = query
          .lte("next_action_at", oneHourFromNow)
          .gte("next_action_at", new Date().toISOString());
      }

      const { data, error, count } = await query;
      if (error) throw error;

      // Now get step counts per campaign for "Step X of Y" display
      const campaignIds = [
        ...new Set((data || []).map((d: any) => d.campaign_id)),
      ];

      let stepCounts: Record<string, number> = {};
      let stepChannels: Record<string, Record<number, string>> = {};

      if (campaignIds.length > 0) {
        const { data: stepsData } = await supabase
          .from("mkt_campaign_steps")
          .select("campaign_id, step_number, channel")
          .in("campaign_id", campaignIds)
          .order("step_number", { ascending: true });

        if (stepsData) {
          for (const s of stepsData) {
            stepCounts[s.campaign_id] = Math.max(
              stepCounts[s.campaign_id] || 0,
              s.step_number
            );
            if (!stepChannels[s.campaign_id]) {
              stepChannels[s.campaign_id] = {};
            }
            stepChannels[s.campaign_id][s.step_number] = s.channel;
          }
        }
      }

      // Map to flat rows
      const rows: EnrollmentRow[] = (data || []).map((d: any) => {
        const lead = d.mkt_leads;
        const campaign = d.mkt_campaigns;
        const currentChannel =
          stepChannels[d.campaign_id]?.[d.current_step] || null;

        return {
          id: d.id,
          org_id: d.org_id,
          lead_id: d.lead_id,
          campaign_id: d.campaign_id,
          current_step: d.current_step,
          status: d.status,
          next_action_at: d.next_action_at,
          enrolled_at: d.enrolled_at,
          completed_at: d.completed_at,
          cancelled_at: d.cancelled_at,
          cancel_reason: d.cancel_reason,
          lead_first_name: lead?.first_name || null,
          lead_last_name: lead?.last_name || null,
          lead_email: lead?.email || null,
          lead_company: lead?.company || null,
          campaign_name: campaign?.name || "Unknown",
          campaign_status: campaign?.status || "unknown",
          total_steps: stepCounts[d.campaign_id] || 0,
          current_step_channel: currentChannel,
        };
      });

      // Client-side channel filter (since channel comes from steps)
      const filtered =
        channelFilter === "all"
          ? rows
          : rows.filter((r) => r.current_step_channel === channelFilter);

      return { rows: filtered, total: count || 0 };
    },
    enabled: !!effectiveOrgId,
  });

  const enrollments = enrollmentsResult?.rows || [];
  const totalCount = enrollmentsResult?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Summary counts query
  const { data: summary } = useQuery({
    queryKey: ["enrollment-browser-summary", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId)
        return { active: 0, dueSoon: 0, completedToday: 0, pausedFailed: 0 };

      const oneHourFromNow = new Date(
        Date.now() + 60 * 60 * 1000
      ).toISOString();
      const nowIso = new Date().toISOString();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartIso = todayStart.toISOString();

      // Active count
      const { count: activeCount } = await supabase
        .from("mkt_sequence_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", effectiveOrgId)
        .eq("status", "active");

      // Due soon (next_action_at within 1 hour)
      const { count: dueSoonCount } = await supabase
        .from("mkt_sequence_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", effectiveOrgId)
        .eq("status", "active")
        .lte("next_action_at", oneHourFromNow)
        .gte("next_action_at", nowIso);

      // Completed today
      const { count: completedTodayCount } = await supabase
        .from("mkt_sequence_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", effectiveOrgId)
        .eq("status", "completed")
        .gte("completed_at", todayStartIso);

      // Paused + failed/cancelled/bounced
      const { count: pausedCount } = await supabase
        .from("mkt_sequence_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", effectiveOrgId)
        .in("status", ["paused", "cancelled", "bounced"]);

      return {
        active: activeCount || 0,
        dueSoon: dueSoonCount || 0,
        completedToday: completedTodayCount || 0,
        pausedFailed: pausedCount || 0,
      };
    },
    enabled: !!effectiveOrgId,
  });

  // Action history for expanded enrollment
  const { data: actions = [], isLoading: actionsLoading } = useQuery({
    queryKey: ["enrollment-actions", expandedId],
    queryFn: async () => {
      if (!expandedId) return [];
      const { data, error } = await supabase
        .from("mkt_sequence_actions")
        .select(
          "id, step_number, channel, status, scheduled_at, sent_at, delivered_at, opened_at, clicked_at, replied_at, failed_at, failure_reason"
        )
        .eq("enrollment_id", expandedId)
        .order("step_number", { ascending: true });
      if (error) throw error;
      return (data || []) as ActionRow[];
    },
    enabled: !!expandedId,
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const pauseResumeMutation = useMutation({
    mutationFn: async ({
      id,
      currentStatus,
    }: {
      id: string;
      currentStatus: string;
    }) => {
      const newStatus = currentStatus === "active" ? "paused" : "active";
      const { error } = await supabase
        .from("mkt_sequence_enrollments")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return newStatus;
    },
    onSuccess: (newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["enrollment-browser"] });
      queryClient.invalidateQueries({
        queryKey: ["enrollment-browser-summary"],
      });
      notify.success(`Enrollment ${newStatus}`);
    },
    onError: (err: any) => {
      notify.error("Failed to update enrollment", err);
    },
  });

  const skipStepMutation = useMutation({
    mutationFn: async ({
      id,
      currentStep,
      totalSteps,
    }: {
      id: string;
      currentStep: number;
      totalSteps: number;
    }) => {
      const nextStep = currentStep + 1;
      const updates: Record<string, any> = {
        current_step: nextStep,
        updated_at: new Date().toISOString(),
      };
      if (nextStep > totalSteps) {
        updates.status = "completed";
        updates.completed_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("mkt_sequence_enrollments")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollment-browser"] });
      queryClient.invalidateQueries({
        queryKey: ["enrollment-browser-summary"],
      });
      notify.success("Skipped to next step");
    },
    onError: (err: any) => {
      notify.error("Failed to skip step", err);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("mkt_sequence_enrollments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancel_reason: "Manually removed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollment-browser"] });
      queryClient.invalidateQueries({
        queryKey: ["enrollment-browser-summary"],
      });
      setExpandedId(null);
      notify.success("Removed from campaign");
    },
    onError: (err: any) => {
      notify.error("Failed to remove enrollment", err);
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["enrollment-browser"] });
    await queryClient.invalidateQueries({
      queryKey: ["enrollment-browser-summary"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["enrollment-browser-campaigns"],
    });
    setRefreshing(false);
  }, [queryClient]);

  const handleToggleExpand = useCallback(
    (id: string) => {
      setExpandedId((prev) => (prev === id ? null : id));
    },
    []
  );

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    setExpandedId(null);
  }, []);

  // Reset page when filters change
  const handleFilterChange = useCallback(
    (setter: (v: any) => void, value: any) => {
      setter(value);
      setPage(0);
      setExpandedId(null);
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!effectiveOrgId) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading organization..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Enrollment Browser</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              View and manage lead enrollments across all campaigns
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 gap-1.5"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline text-xs">Refresh</span>
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-green-100 p-1.5">
                <Users className="h-3.5 w-3.5 text-green-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Active Enrollments
                </p>
                <p className="text-lg font-semibold">
                  {summary?.active ?? "-"}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-amber-100 p-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due in 1 Hour</p>
                <p className="text-lg font-semibold">
                  {summary?.dueSoon ?? "-"}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-blue-100 p-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Completed Today
                </p>
                <p className="text-lg font-semibold">
                  {summary?.completedToday ?? "-"}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-red-100 p-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-red-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paused / Failed</p>
                <p className="text-lg font-semibold">
                  {summary?.pausedFailed ?? "-"}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-3">
          <div className="flex flex-wrap items-end gap-3">
            {/* Campaign filter */}
            <div className="space-y-1">
              <Label className="text-xs">Campaign</Label>
              <Select
                value={campaignFilter}
                onValueChange={(v) =>
                  handleFilterChange(setCampaignFilter, v)
                }
              >
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="All campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    All campaigns
                  </SelectItem>
                  {campaignOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status filter */}
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  handleFilterChange(setStatusFilter, v)
                }
              >
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    All statuses
                  </SelectItem>
                  <SelectItem value="active" className="text-xs">
                    Active
                  </SelectItem>
                  <SelectItem value="paused" className="text-xs">
                    Paused
                  </SelectItem>
                  <SelectItem value="completed" className="text-xs">
                    Completed
                  </SelectItem>
                  <SelectItem value="cancelled" className="text-xs">
                    Failed / Cancelled
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Channel filter */}
            <div className="space-y-1">
              <Label className="text-xs">Channel</Label>
              <Select
                value={channelFilter}
                onValueChange={(v) =>
                  handleFilterChange(
                    setChannelFilter,
                    v as ChannelFilter
                  )
                }
              >
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    All channels
                  </SelectItem>
                  <SelectItem value="email" className="text-xs">
                    Email
                  </SelectItem>
                  <SelectItem value="whatsapp" className="text-xs">
                    WhatsApp
                  </SelectItem>
                  <SelectItem value="call" className="text-xs">
                    Call
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Due soon toggle */}
            <div className="flex items-center gap-2 pb-0.5">
              <Switch
                id="due-soon"
                checked={dueSoonOnly}
                onCheckedChange={(v) =>
                  handleFilterChange(setDueSoonOnly, v)
                }
              />
              <Label htmlFor="due-soon" className="text-xs cursor-pointer">
                Due soon only
              </Label>
            </div>
          </div>
        </Card>

        {/* Enrollments table */}
        <Card>
          <CardContent className="p-0">
            {enrollmentsLoading ? (
              <LoadingState message="Loading enrollments..." />
            ) : enrollments.length === 0 ? (
              <EmptyState
                icon={
                  <Users className="h-10 w-10 text-muted-foreground" />
                }
                title="No enrollments found"
                message={
                  campaignFilter !== "all" ||
                  statusFilter !== "all" ||
                  channelFilter !== "all" ||
                  dueSoonOnly
                    ? "Try adjusting your filters."
                    : "Leads will appear here once they are enrolled in campaign sequences."
                }
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-8"></TableHead>
                      <TableHead className="text-xs">Lead</TableHead>
                      <TableHead className="text-xs">Email</TableHead>
                      <TableHead className="text-xs">Campaign</TableHead>
                      <TableHead className="text-xs">Step</TableHead>
                      <TableHead className="text-xs">Channel</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Next Action</TableHead>
                      <TableHead className="text-xs">Enrolled</TableHead>
                      <TableHead className="text-xs w-28">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrollments.map((enrollment) => (
                      <EnrollmentRowComponent
                        key={enrollment.id}
                        enrollment={enrollment}
                        isExpanded={expandedId === enrollment.id}
                        onToggleExpand={handleToggleExpand}
                        actions={
                          expandedId === enrollment.id ? actions : []
                        }
                        actionsLoading={
                          expandedId === enrollment.id && actionsLoading
                        }
                        onPauseResume={(id, status) =>
                          pauseResumeMutation.mutate({
                            id,
                            currentStatus: status,
                          })
                        }
                        onSkipStep={(id, step, total) =>
                          skipStepMutation.mutate({
                            id,
                            currentStep: step,
                            totalSteps: total,
                          })
                        }
                        onRemove={(id) => removeMutation.mutate(id)}
                        mutating={
                          pauseResumeMutation.isPending ||
                          skipStepMutation.isPending ||
                          removeMutation.isPending
                        }
                      />
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}
                    {" - "}
                    {Math.min((page + 1) * PAGE_SIZE, totalCount)} of{" "}
                    {totalCount}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={page === 0}
                      onClick={() => handlePageChange(page - 1)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs px-2 text-muted-foreground">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={page >= totalPages - 1}
                      onClick={() => handlePageChange(page + 1)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

// ===========================================================================
// Enrollment Row sub-component (with expandable action history)
// ===========================================================================

function EnrollmentRowComponent({
  enrollment,
  isExpanded,
  onToggleExpand,
  actions,
  actionsLoading,
  onPauseResume,
  onSkipStep,
  onRemove,
  mutating,
}: {
  enrollment: EnrollmentRow;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  actions: ActionRow[];
  actionsLoading: boolean;
  onPauseResume: (id: string, currentStatus: string) => void;
  onSkipStep: (id: string, currentStep: number, totalSteps: number) => void;
  onRemove: (id: string) => void;
  mutating: boolean;
}) {
  const isTerminal =
    enrollment.status === "completed" || enrollment.status === "cancelled";

  return (
    <>
      {/* Main row */}
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => onToggleExpand(enrollment.id)}
      >
        <TableCell className="px-2">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="text-sm">
          <div>
            <span className="font-medium">{leadName(enrollment)}</span>
            {enrollment.lead_company && (
              <span className="block text-xs text-muted-foreground">
                {enrollment.lead_company}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {enrollment.lead_email || "-"}
        </TableCell>
        <TableCell className="text-xs font-medium">
          {enrollment.campaign_name}
        </TableCell>
        <TableCell className="text-xs">
          <span className="font-medium">
            Step {enrollment.current_step}
          </span>
          {enrollment.total_steps > 0 && (
            <span className="text-muted-foreground">
              {" "}
              of {enrollment.total_steps}
            </span>
          )}
        </TableCell>
        <TableCell className="text-xs">
          {enrollment.current_step_channel ? (
            <div className="flex items-center gap-1.5 capitalize">
              {channelIcon(enrollment.current_step_channel)}
              {enrollment.current_step_channel}
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell>
          <Badge
            variant="secondary"
            className={`text-xs capitalize ${enrollmentStatusColor(enrollment.status)}`}
          >
            {enrollment.status}
          </Badge>
        </TableCell>
        <TableCell className="text-xs">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={
                    enrollment.next_action_at &&
                    new Date(enrollment.next_action_at).getTime() -
                      Date.now() <
                      3_600_000 &&
                    new Date(enrollment.next_action_at).getTime() > Date.now()
                      ? "text-amber-600 font-medium"
                      : ""
                  }
                >
                  {relativeTime(enrollment.next_action_at)}
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {formatTimestamp(enrollment.next_action_at)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
        <TableCell className="text-xs">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{relativeTime(enrollment.enrolled_at)}</span>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {formatTimestamp(enrollment.enrolled_at)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
        <TableCell>
          <div
            className="flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pause/Resume */}
            {!isTerminal && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={mutating}
                      onClick={() =>
                        onPauseResume(enrollment.id, enrollment.status)
                      }
                    >
                      {enrollment.status === "active" ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {enrollment.status === "active" ? "Pause" : "Resume"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Skip step */}
            {!isTerminal && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={mutating}
                      onClick={() =>
                        onSkipStep(
                          enrollment.id,
                          enrollment.current_step,
                          enrollment.total_steps
                        )
                      }
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    Skip to next step
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Remove */}
            {!isTerminal && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                      disabled={mutating}
                      onClick={() => onRemove(enrollment.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    Remove from campaign
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded action history */}
      {isExpanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={10} className="p-0">
            <div className="px-6 py-4">
              <h4 className="text-xs font-semibold mb-3">Action History</h4>
              {actionsLoading ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Loading actions...
                </div>
              ) : actions.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No actions recorded yet for this enrollment.
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />

                  <div className="space-y-3">
                    {actions.map((action, idx) => (
                      <div
                        key={action.id}
                        className="relative pl-8"
                      >
                        {/* Timeline dot */}
                        <div
                          className={`absolute left-1.5 top-1 h-3 w-3 rounded-full border-2 border-background ${
                            action.status === "sent" ||
                            action.status === "delivered"
                              ? "bg-green-500"
                              : action.status === "failed" ||
                                action.status === "bounced"
                              ? "bg-red-500"
                              : action.status === "pending"
                              ? "bg-gray-400"
                              : action.status === "skipped"
                              ? "bg-amber-500"
                              : "bg-gray-400"
                          }`}
                        />

                        <div className="rounded-md border bg-background p-3">
                          {/* Header */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-semibold">
                              Step {action.step_number}
                            </span>
                            <div className="flex items-center gap-1 text-xs capitalize text-muted-foreground">
                              {channelIcon(action.channel)}
                              {action.channel}
                            </div>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] capitalize ${actionStatusColor(action.status)}`}
                            >
                              {action.status}
                            </Badge>
                          </div>

                          {/* Timestamps grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
                            {action.sent_at && (
                              <div>
                                <span className="text-[10px] text-muted-foreground">
                                  Sent
                                </span>
                                <p className="text-xs">
                                  {formatTimestamp(action.sent_at)}
                                </p>
                              </div>
                            )}
                            {action.delivered_at && (
                              <div>
                                <span className="text-[10px] text-muted-foreground">
                                  Delivered
                                </span>
                                <p className="text-xs">
                                  {formatTimestamp(action.delivered_at)}
                                </p>
                              </div>
                            )}
                            {action.opened_at && (
                              <div>
                                <span className="text-[10px] text-muted-foreground">
                                  Opened
                                </span>
                                <p className="text-xs">
                                  {formatTimestamp(action.opened_at)}
                                </p>
                              </div>
                            )}
                            {action.clicked_at && (
                              <div>
                                <span className="text-[10px] text-muted-foreground">
                                  Clicked
                                </span>
                                <p className="text-xs">
                                  {formatTimestamp(action.clicked_at)}
                                </p>
                              </div>
                            )}
                            {action.replied_at && (
                              <div>
                                <span className="text-[10px] text-muted-foreground">
                                  Replied
                                </span>
                                <p className="text-xs">
                                  {formatTimestamp(action.replied_at)}
                                </p>
                              </div>
                            )}
                            {action.failed_at && (
                              <div>
                                <span className="text-[10px] text-muted-foreground">
                                  Failed
                                </span>
                                <p className="text-xs">
                                  {formatTimestamp(action.failed_at)}
                                </p>
                              </div>
                            )}
                            {action.scheduled_at &&
                              !action.sent_at &&
                              !action.failed_at && (
                                <div>
                                  <span className="text-[10px] text-muted-foreground">
                                    Scheduled
                                  </span>
                                  <p className="text-xs">
                                    {formatTimestamp(action.scheduled_at)}
                                  </p>
                                </div>
                              )}
                          </div>

                          {/* Failure reason */}
                          {action.failure_reason && (
                            <div className="mt-2 rounded bg-red-50 px-2 py-1">
                              <p className="text-[10px] text-red-600">
                                <span className="font-medium">Reason:</span>{" "}
                                {action.failure_reason}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
