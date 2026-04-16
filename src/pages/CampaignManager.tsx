import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Pencil,
  ArrowLeft,
  Megaphone,
  Play,
  Pause,
  Hash,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  MousePointerClick,
  Reply,
  Users,
} from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { format, formatDistanceToNow, isPast } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Campaign {
  id: string;
  org_id: string;
  name: string;
  campaign_type: string;
  status: string;
  icp_criteria: any;
  budget: number | null;
  budget_spent: number | null;
  max_enrollments: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface CampaignStep {
  id: string;
  org_id: string;
  campaign_id: string;
  step_number: number;
  channel: string;
  delay_hours: number;
  template_id: string | null;
  template_type: string | null;
  conditions: any;
  ab_test_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TemplateOption {
  id: string;
  name: string;
}

interface CampaignAnalytics {
  enrolled: number;
  active_enrollments: number;
  completed_enrollments: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  failed: number;
  bounced: number;
  complained: number;
  next_fire_at: string | null;
  last_sent_at: string | null;
}

interface StepAnalytics {
  step_id: string;
  step_number: number;
  channel: string;
  delay_hours: number;
  template_id: string | null;
  in_queue: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  failed: number;
  bounced: number;
  skipped: number;
}

interface AllCampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  product_key: string | null;
  enrolled: number;
  active_enrollments: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  failed: number;
  complained: number;
  next_fire_at: string | null;
  last_sent_at: string | null;
}

type CampaignStatus = "draft" | "active" | "paused" | "completed" | "archived";
type CampaignType = "outbound" | "inbound" | "nurture" | "reactivation" | "event";
type StepChannel = "email" | "whatsapp" | "call" | "sms";

const CAMPAIGN_STATUSES: CampaignStatus[] = ["draft", "active", "paused", "completed", "archived"];
const CAMPAIGN_TYPES: CampaignType[] = ["outbound", "inbound", "nurture", "reactivation", "event"];
const STEP_CHANNELS: StepChannel[] = ["email", "whatsapp", "call", "sms"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPaiseToCurrency(paise: number | null): string {
  if (paise === null || paise === undefined) return "\u20B90";
  const rupees = paise / 100;
  return "\u20B9" + rupees.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pct(num: number, denom: number): string {
  if (!denom || !num) return "";
  return `${Math.round((num / denom) * 100)}%`;
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  // shadcn Badge only has a few built-in variants; we use className for color
  return "secondary";
}

function statusColor(status: string): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "active":
      return "bg-green-100 text-green-700 border-green-200";
    case "paused":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "completed":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "archived":
      return "bg-gray-50 text-gray-500 border-gray-200";
    default:
      return "";
  }
}

function typeColor(type: string): string {
  switch (type) {
    case "outbound":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "inbound":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "nurture":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "reactivation":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "event":
      return "bg-pink-100 text-pink-700 border-pink-200";
    default:
      return "";
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

function templateTableForChannel(channel: string): string {
  switch (channel) {
    case "email":
      return "mkt_email_templates";
    case "whatsapp":
      return "mkt_whatsapp_templates";
    case "call":
      return "mkt_call_scripts";
    case "sms":
      return "mkt_whatsapp_templates"; // fallback, reuse whatsapp for sms
    default:
      return "mkt_email_templates";
  }
}

function templateTypeForChannel(channel: string): string {
  switch (channel) {
    case "email":
      return "email";
    case "whatsapp":
      return "whatsapp";
    case "call":
      return "call_script";
    case "sms":
      return "sms";
    default:
      return "email";
  }
}

// ---------------------------------------------------------------------------
// Empty form states
// ---------------------------------------------------------------------------

const emptyCampaignForm = {
  name: "",
  campaign_type: "outbound" as CampaignType,
  status: "draft" as CampaignStatus,
  icp_criteria: "",
  budget: "",
  max_enrollments: "",
};

const emptyStepForm = {
  channel: "email" as StepChannel,
  delay_hours: "0",
  template_id: "",
  conditions: "",
  is_active: true,
};

// ===========================================================================
// Main component
// ===========================================================================

export default function CampaignManager() {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();

  // View state
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Dialog state
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm);

  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<CampaignStep | null>(null);
  const [stepForm, setStepForm] = useState(emptyStepForm);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ["mkt_campaigns", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_campaigns")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Campaign[];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: steps = [], isLoading: stepsLoading } = useQuery({
    queryKey: ["mkt_campaign_steps", selectedCampaign?.id],
    queryFn: async () => {
      if (!selectedCampaign) return [];
      const { data, error } = await supabase
        .from("mkt_campaign_steps")
        .select("*")
        .eq("campaign_id", selectedCampaign.id)
        .order("step_number", { ascending: true });
      if (error) throw error;
      return (data || []) as CampaignStep[];
    },
    enabled: !!selectedCampaign,
  });

  // Campaign analytics
  const { data: campaignAnalytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["campaign_analytics", selectedCampaign?.id],
    queryFn: async () => {
      if (!selectedCampaign) return null;
      const { data, error } = await supabase
        .rpc("get_campaign_analytics", { p_campaign_id: selectedCampaign.id })
        .single();
      if (error) throw error;
      return data as CampaignAnalytics | null;
    },
    enabled: !!selectedCampaign,
    refetchInterval: 60_000,
  });

  // Per-step funnel analytics
  const { data: stepAnalytics = [], isLoading: stepAnalyticsLoading } = useQuery({
    queryKey: ["campaign_step_analytics", selectedCampaign?.id],
    queryFn: async () => {
      if (!selectedCampaign) return [];
      const { data, error } = await supabase
        .rpc("get_campaign_step_analytics", { p_campaign_id: selectedCampaign.id });
      if (error) throw error;
      return (data || []) as StepAnalytics[];
    },
    enabled: !!selectedCampaign,
    refetchInterval: 60_000,
  });

  // All-campaign analytics for list view
  const { data: allAnalytics = [] } = useQuery({
    queryKey: ["all_campaigns_analytics", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .rpc("get_all_campaigns_analytics", { p_org_id: effectiveOrgId });
      if (error) throw error;
      return (data || []) as AllCampaignAnalytics[];
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 120_000,
  });

  // Fetch templates for the current step channel
  const { data: templates = [] } = useQuery({
    queryKey: ["step_templates", stepForm.channel, effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const table = templateTableForChannel(stepForm.channel);
      const { data, error } = await supabase
        .from(table)
        .select("id, name")
        .eq("org_id", effectiveOrgId)
        .order("name");
      if (error) {
        // Table may not exist yet — gracefully return empty
        console.warn(`Could not fetch templates from ${table}:`, error.message);
        return [];
      }
      return (data || []) as TemplateOption[];
    },
    enabled: !!effectiveOrgId && stepDialogOpen,
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const upsertCampaignMutation = useMutation({
    mutationFn: async (form: typeof campaignForm & { id?: string }) => {
      const session = (await supabase.auth.getSession()).data.session;
      const userId = session?.user?.id;

      const payload: Record<string, any> = {
        org_id: effectiveOrgId,
        name: form.name.trim(),
        campaign_type: form.campaign_type,
        status: form.status,
        icp_criteria: form.icp_criteria ? (() => { try { return JSON.parse(form.icp_criteria); } catch { return form.icp_criteria; } })() : null,
        budget: form.budget ? Math.round(parseFloat(form.budget) * 100) : null,
        max_enrollments: form.max_enrollments ? parseInt(form.max_enrollments, 10) : null,
      };

      if (form.id) {
        // Update
        const { error } = await supabase
          .from("mkt_campaigns")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        // Insert
        payload.created_by = userId;
        const { error } = await supabase
          .from("mkt_campaigns")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt_campaigns"] });
      setCampaignDialogOpen(false);
      notify.success(editingCampaign ? "Campaign updated" : "Campaign created");
    },
    onError: (err: any) => {
      notify.error("Failed to save campaign", err);
    },
  });

  const toggleCampaignStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const newStatus = currentStatus === "active" ? "paused" : "active";
      const { error } = await supabase
        .from("mkt_campaigns")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
      return newStatus;
    },
    onSuccess: (newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["mkt_campaigns"] });
      // Also refresh detail if open
      if (selectedCampaign) {
        setSelectedCampaign((prev) =>
          prev ? { ...prev, status: newStatus } : prev
        );
      }
      notify.success(`Campaign ${newStatus}`);
    },
    onError: (err: any) => {
      notify.error("Failed to toggle status", err);
    },
  });

  const upsertStepMutation = useMutation({
    mutationFn: async (form: typeof emptyStepForm & { id?: string; step_number: number }) => {
      if (!selectedCampaign) throw new Error("No campaign selected");

      const payload: Record<string, any> = {
        org_id: effectiveOrgId,
        campaign_id: selectedCampaign.id,
        step_number: form.step_number,
        channel: form.channel,
        delay_hours: parseInt(form.delay_hours, 10) || 0,
        template_id: form.template_id || null,
        template_type: templateTypeForChannel(form.channel),
        conditions: form.conditions ? (() => { try { return JSON.parse(form.conditions); } catch { return form.conditions; } })() : null,
        is_active: form.is_active,
      };

      if (form.id) {
        const { error } = await supabase
          .from("mkt_campaign_steps")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("mkt_campaign_steps")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt_campaign_steps"] });
      setStepDialogOpen(false);
      notify.success(editingStep ? "Step updated" : "Step added");
    },
    onError: (err: any) => {
      notify.error("Failed to save step", err);
    },
  });

  const toggleStepActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("mkt_campaign_steps")
        .update({ is_active: !is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt_campaign_steps"] });
    },
    onError: (err: any) => {
      notify.error("Failed to toggle step", err);
    },
  });

  // ---------------------------------------------------------------------------
  // Dialog helpers
  // ---------------------------------------------------------------------------

  function openNewCampaign() {
    setEditingCampaign(null);
    setCampaignForm(emptyCampaignForm);
    setCampaignDialogOpen(true);
  }

  function openEditCampaign(c: Campaign) {
    setEditingCampaign(c);
    setCampaignForm({
      name: c.name,
      campaign_type: c.campaign_type as CampaignType,
      status: c.status as CampaignStatus,
      icp_criteria: c.icp_criteria ? JSON.stringify(c.icp_criteria, null, 2) : "",
      budget: c.budget !== null ? String(c.budget / 100) : "",
      max_enrollments: c.max_enrollments !== null ? String(c.max_enrollments) : "",
    });
    setCampaignDialogOpen(true);
  }

  function handleSaveCampaign() {
    if (!campaignForm.name.trim()) {
      notify.error("Validation", "Campaign name is required");
      return;
    }
    upsertCampaignMutation.mutate({
      ...campaignForm,
      id: editingCampaign?.id,
    });
  }

  function openNewStep() {
    setEditingStep(null);
    const nextNum = steps.length > 0 ? Math.max(...steps.map((s) => s.step_number)) + 1 : 1;
    setStepForm({ ...emptyStepForm });
    // store step_number in a ref-like way via dataset — we'll pass it on save
    (window as any).__nextStepNumber = nextNum;
    setStepDialogOpen(true);
  }

  function openEditStep(step: CampaignStep) {
    setEditingStep(step);
    setStepForm({
      channel: step.channel as StepChannel,
      delay_hours: String(step.delay_hours),
      template_id: step.template_id || "",
      conditions: step.conditions ? JSON.stringify(step.conditions, null, 2) : "",
      is_active: step.is_active,
    });
    (window as any).__nextStepNumber = step.step_number;
    setStepDialogOpen(true);
  }

  function handleSaveStep() {
    const stepNumber = editingStep?.step_number ?? (window as any).__nextStepNumber ?? steps.length + 1;
    upsertStepMutation.mutate({
      ...stepForm,
      id: editingStep?.id,
      step_number: stepNumber,
    });
  }

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

  // ---- Campaign Detail View ----
  if (selectedCampaign) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          {/* Back + header */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCampaign(null)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{selectedCampaign.name}</h1>
                <Badge className={`text-xs ${statusColor(selectedCampaign.status)}`}>
                  {selectedCampaign.status}
                </Badge>
                <Badge className={`text-xs ${typeColor(selectedCampaign.campaign_type)}`}>
                  {selectedCampaign.campaign_type}
                </Badge>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openEditCampaign(selectedCampaign)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toggleCampaignStatusMutation.mutate({
                        id: selectedCampaign.id,
                        currentStatus: selectedCampaign.status,
                      })
                    }
                    disabled={toggleCampaignStatusMutation.isPending}
                  >
                    {selectedCampaign.status === "active" ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {selectedCampaign.status === "active" ? "Pause campaign" : "Activate campaign"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Top summary row */}
          {campaignAnalytics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Card className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Enrolled</p>
                </div>
                <p className="text-lg font-bold">{(campaignAnalytics.enrolled ?? 0).toLocaleString("en-IN")}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {(campaignAnalytics.active_enrollments ?? 0).toLocaleString("en-IN")} active · {(campaignAnalytics.completed_enrollments ?? 0).toLocaleString("en-IN")} completed
                </p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Next Send</p>
                </div>
                {campaignAnalytics.next_fire_at ? (
                  <>
                    <p className="text-sm font-semibold">
                      {isPast(new Date(campaignAnalytics.next_fire_at))
                        ? "Now (pending)"
                        : formatDistanceToNow(new Date(campaignAnalytics.next_fire_at), { addSuffix: true })}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {format(new Date(campaignAnalytics.next_fire_at), "dd MMM, HH:mm 'UTC'")}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No pending sends</p>
                )}
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Send className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Last Sent</p>
                </div>
                {campaignAnalytics.last_sent_at ? (
                  <>
                    <p className="text-sm font-semibold">
                      {formatDistanceToNow(new Date(campaignAnalytics.last_sent_at), { addSuffix: true })}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {format(new Date(campaignAnalytics.last_sent_at), "dd MMM, HH:mm")}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Not sent yet</p>
                )}
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Overall Reply Rate</p>
                </div>
                <p className="text-lg font-bold">
                  {campaignAnalytics.sent > 0
                    ? `${Math.round(((campaignAnalytics.replied ?? 0) / campaignAnalytics.sent) * 100)}%`
                    : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {(campaignAnalytics.replied ?? 0).toLocaleString("en-IN")} of {(campaignAnalytics.sent ?? 0).toLocaleString("en-IN")} sent
                </p>
              </Card>
            </div>
          )}

          {/* Sequence funnel — step by step */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold">Sequence Funnel</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(analyticsLoading || stepAnalyticsLoading) ? (
                <div className="p-4 space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
                </div>
              ) : stepAnalytics.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No steps configured yet.</div>
              ) : (
                <div className="divide-y">
                  {stepAnalytics.map((step, idx) => (
                    <StepFunnelRow
                      key={step.step_id}
                      step={step}
                      isLast={idx === stepAnalytics.length - 1}
                      totalEnrolled={campaignAnalytics?.enrolled ?? 0}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Outcomes summary */}
          {campaignAnalytics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Sequence Completed</p>
                <p className="text-lg font-bold text-green-700">
                  {(campaignAnalytics.completed_enrollments ?? 0).toLocaleString("en-IN")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {pct(campaignAnalytics.completed_enrollments ?? 0, campaignAnalytics.enrolled ?? 0)} of enrolled
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Replied (All Steps)</p>
                <p className="text-lg font-bold text-blue-600">
                  {(campaignAnalytics.replied ?? 0).toLocaleString("en-IN")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {pct(campaignAnalytics.replied ?? 0, campaignAnalytics.sent ?? 0)} of sent
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Bounced / Complained</p>
                <p className="text-lg font-bold text-red-500">
                  {(campaignAnalytics.bounced ?? 0).toLocaleString("en-IN")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {(campaignAnalytics.complained ?? 0)} spam reports
                </p>
              </Card>
              <Card className="p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-0.5">Trial → Paid</p>
                <p className="text-sm text-muted-foreground">Tracked in pipeline</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  See CRM → Pipeline stages
                </p>
              </Card>
            </div>
          )}

          {/* Campaign meta row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Budget</p>
              <p className="text-sm font-semibold">{formatPaiseToCurrency(selectedCampaign.budget)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Spent</p>
              <p className="text-sm font-semibold">{formatPaiseToCurrency(selectedCampaign.budget_spent)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Max Enrollments</p>
              <p className="text-sm font-semibold">
                {selectedCampaign.max_enrollments?.toLocaleString("en-IN") ?? "Unlimited"}
              </p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm font-semibold">
                {format(new Date(selectedCampaign.created_at), "dd MMM yyyy")}
              </p>
            </Card>
          </div>

          {/* ICP Criteria display */}
          {selectedCampaign.icp_criteria && (
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-1">ICP Criteria</p>
              <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-32">
                {typeof selectedCampaign.icp_criteria === "string"
                  ? selectedCampaign.icp_criteria
                  : JSON.stringify(selectedCampaign.icp_criteria, null, 2)}
              </pre>
            </Card>
          )}

          {/* Sequence Steps */}
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Sequence Steps</CardTitle>
                <Button size="sm" onClick={openNewStep}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Step
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {stepsLoading ? (
                <LoadingState message="Loading steps..." />
              ) : steps.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No steps yet. Add a step to build the campaign sequence.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-xs">Step #</TableHead>
                      <TableHead className="text-xs">Channel</TableHead>
                      <TableHead className="text-xs">Delay (hrs)</TableHead>
                      <TableHead className="text-xs">Template ID</TableHead>
                      <TableHead className="text-xs w-20">Active</TableHead>
                      <TableHead className="text-xs w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {steps.map((step) => (
                      <TableRow key={step.id}>
                        <TableCell className="text-xs font-medium">
                          <div className="flex items-center gap-1.5">
                            <Hash className="h-3 w-3 text-muted-foreground" />
                            {step.step_number}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5 capitalize">
                            {channelIcon(step.channel)}
                            {step.channel}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{step.delay_hours}h</TableCell>
                        <TableCell className="text-xs font-mono">
                          {step.template_id ? step.template_id.slice(0, 8) + "..." : "-"}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={step.is_active}
                            onCheckedChange={() =>
                              toggleStepActiveMutation.mutate({
                                id: step.id,
                                is_active: step.is_active,
                              })
                            }
                            disabled={toggleStepActiveMutation.isPending}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => openEditStep(step)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Step Dialog */}
        <StepDialog
          open={stepDialogOpen}
          onOpenChange={setStepDialogOpen}
          form={stepForm}
          setForm={setStepForm}
          onSave={handleSaveStep}
          saving={upsertStepMutation.isPending}
          editing={!!editingStep}
          templates={templates}
          stepNumber={editingStep?.step_number ?? (window as any).__nextStepNumber ?? steps.length + 1}
        />

        {/* Campaign Dialog (for edit from detail) */}
        <CampaignDialog
          open={campaignDialogOpen}
          onOpenChange={setCampaignDialogOpen}
          form={campaignForm}
          setForm={setCampaignForm}
          onSave={handleSaveCampaign}
          saving={upsertCampaignMutation.isPending}
          editing={!!editingCampaign}
        />
      </DashboardLayout>
    );
  }

  // ---- Campaign List View ----
  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Campaign Manager</h1>
          </div>
          <Button size="sm" onClick={openNewCampaign}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Campaign
          </Button>
        </div>

        {/* Campaigns table */}
        <Card>
          <CardContent className="p-0">
            {campaignsLoading ? (
              <LoadingState message="Loading campaigns..." />
            ) : campaigns.length === 0 ? (
              <EmptyState
                icon={<Megaphone className="h-10 w-10 text-muted-foreground" />}
                title="No campaigns yet"
                message="Create your first campaign to start engaging leads."
                action={
                  <Button size="sm" onClick={openNewCampaign}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    New Campaign
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Enrolled</TableHead>
                    <TableHead className="text-xs text-right">Sent</TableHead>
                    <TableHead className="text-xs text-right">Opened</TableHead>
                    <TableHead className="text-xs text-right">Clicked</TableHead>
                    <TableHead className="text-xs text-right">Replied</TableHead>
                    <TableHead className="text-xs">Next Fire</TableHead>
                    <TableHead className="text-xs w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const stats = allAnalytics.find((a) => a.campaign_id === c.id);
                    return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedCampaign(c)}
                    >
                      <TableCell className="text-sm font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-xs capitalize ${statusColor(c.status)}`}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {stats ? (stats.enrolled ?? 0).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {stats ? (stats.sent ?? 0).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {stats && stats.sent > 0
                          ? `${(stats.opened ?? 0).toLocaleString("en-IN")} (${Math.round(((stats.opened ?? 0) / stats.sent) * 100)}%)`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {stats && stats.sent > 0
                          ? `${(stats.clicked ?? 0).toLocaleString("en-IN")} (${Math.round(((stats.clicked ?? 0) / stats.sent) * 100)}%)`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {stats ? (stats.replied ?? 0).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {stats?.next_fire_at
                          ? isPast(new Date(stats.next_fire_at))
                            ? <span className="text-amber-600 font-medium">Now (pending)</span>
                            : formatDistanceToNow(new Date(stats.next_fire_at), { addSuffix: true })
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => openEditCampaign(c)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit campaign</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() =>
                                    toggleCampaignStatusMutation.mutate({
                                      id: c.id,
                                      currentStatus: c.status,
                                    })
                                  }
                                  disabled={toggleCampaignStatusMutation.isPending}
                                >
                                  {c.status === "active" ? (
                                    <Pause className="h-3.5 w-3.5" />
                                  ) : (
                                    <Play className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {c.status === "active" ? "Pause" : "Activate"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Dialog */}
      <CampaignDialog
        open={campaignDialogOpen}
        onOpenChange={setCampaignDialogOpen}
        form={campaignForm}
        setForm={setCampaignForm}
        onSave={handleSaveCampaign}
        saving={upsertCampaignMutation.isPending}
        editing={!!editingCampaign}
      />
    </DashboardLayout>
  );
}

// ===========================================================================
// StepFunnelRow sub-component
// ===========================================================================

function MetricPill({
  label,
  value,
  rate,
  color,
}: {
  label: string;
  value: number;
  rate?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center min-w-[52px] text-center">
      <span className={`text-sm font-semibold leading-tight ${color || "text-foreground"}`}>
        {value.toLocaleString("en-IN")}
        {rate && (
          <span className="text-[10px] font-normal text-muted-foreground ml-0.5">
            ({rate})
          </span>
        )}
      </span>
      <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
    </div>
  );
}

function StepFunnelRow({
  step,
  isLast,
}: {
  step: StepAnalytics;
  isLast: boolean;
}) {
  const sent = step.sent ?? 0;
  const noData = sent === 0 && (step.in_queue ?? 0) === 0;

  return (
    <div>
      <div className="px-4 py-3">
        {/* Header: step badge + channel + delay + in-queue */}
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0">
            {step.step_number}
          </span>
          <span className="flex items-center gap-1 text-sm font-medium capitalize">
            {channelIcon(step.channel)}
            {step.channel}
          </span>
          <span className="text-xs text-muted-foreground">
            {step.delay_hours === 0 ? "Immediate" : `+${step.delay_hours}h after previous`}
          </span>
          {(step.in_queue ?? 0) > 0 && (
            <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 font-normal">
              {step.in_queue} in queue
            </Badge>
          )}
        </div>

        {/* Metrics */}
        <div className="pl-7 flex flex-wrap gap-x-5 gap-y-2 items-end">
          {noData && (
            <span className="text-xs text-muted-foreground italic">No actions sent yet</span>
          )}

          {!noData && step.channel === "email" && (
            <>
              <MetricPill label="Sent" value={sent} />
              <MetricPill label="Delivered" value={step.delivered ?? 0} rate={pct(step.delivered ?? 0, sent)} />
              <MetricPill label="Opened" value={step.opened ?? 0} rate={pct(step.opened ?? 0, sent)} color="text-blue-600" />
              <MetricPill label="Clicked" value={step.clicked ?? 0} rate={pct(step.clicked ?? 0, sent)} color="text-violet-600" />
              <MetricPill label="Replied" value={step.replied ?? 0} rate={pct(step.replied ?? 0, sent)} color="text-green-600" />
              {(step.failed ?? 0) > 0 && (
                <MetricPill label="Failed" value={step.failed ?? 0} color="text-red-500" />
              )}
              {(step.bounced ?? 0) > 0 && (
                <MetricPill label="Bounced" value={step.bounced ?? 0} color="text-red-400" />
              )}
              {(step.skipped ?? 0) > 0 && (
                <MetricPill label="Skipped" value={step.skipped ?? 0} color="text-muted-foreground" />
              )}
            </>
          )}

          {!noData && step.channel === "whatsapp" && (
            <>
              <MetricPill label="Sent" value={sent} />
              <MetricPill label="Delivered" value={step.delivered ?? 0} rate={pct(step.delivered ?? 0, sent)} />
              <MetricPill label="Replied" value={step.replied ?? 0} rate={pct(step.replied ?? 0, sent)} color="text-green-600" />
              {(step.failed ?? 0) > 0 && (
                <MetricPill label="Failed" value={step.failed ?? 0} color="text-red-500" />
              )}
              {(step.skipped ?? 0) > 0 && (
                <MetricPill label="Skipped" value={step.skipped ?? 0} color="text-muted-foreground" />
              )}
            </>
          )}

          {!noData && step.channel === "call" && (
            <>
              <MetricPill label="Dialed" value={sent} />
              <MetricPill label="Connected" value={step.replied ?? 0} rate={pct(step.replied ?? 0, sent)} color="text-green-600" />
              {(step.failed ?? 0) > 0 && (
                <MetricPill label="Failed" value={step.failed ?? 0} color="text-red-500" />
              )}
              {(step.skipped ?? 0) > 0 && (
                <MetricPill label="Skipped" value={step.skipped ?? 0} color="text-muted-foreground" />
              )}
            </>
          )}

          {!noData && step.channel === "sms" && (
            <>
              <MetricPill label="Sent" value={sent} />
              <MetricPill label="Delivered" value={step.delivered ?? 0} rate={pct(step.delivered ?? 0, sent)} />
              <MetricPill label="Replied" value={step.replied ?? 0} rate={pct(step.replied ?? 0, sent)} color="text-green-600" />
              {(step.failed ?? 0) > 0 && (
                <MetricPill label="Failed" value={step.failed ?? 0} color="text-red-500" />
              )}
            </>
          )}

          {!noData && !["email", "whatsapp", "call", "sms"].includes(step.channel) && (
            <>
              <MetricPill label="Sent" value={sent} />
              <MetricPill label="Replied" value={step.replied ?? 0} rate={pct(step.replied ?? 0, sent)} color="text-green-600" />
              {(step.failed ?? 0) > 0 && (
                <MetricPill label="Failed" value={step.failed ?? 0} color="text-red-500" />
              )}
            </>
          )}
        </div>
      </div>

      {/* Step connector */}
      {!isLast && (
        <div className="flex items-center gap-2 px-4 py-0.5">
          <div className="w-5 flex justify-center">
            <div className="h-4 w-px border-l-2 border-dashed border-muted-foreground/25" />
          </div>
          {(step.replied ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {step.replied} engaged → next step
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Campaign Dialog sub-component
// ===========================================================================

function CampaignDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSave,
  saving,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: typeof emptyCampaignForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyCampaignForm>>;
  onSave: () => void;
  saving: boolean;
  editing: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {editing ? "Edit Campaign" : "New Campaign"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {editing
              ? "Update campaign settings."
              : "Create a new marketing campaign."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Name */}
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input
              placeholder="e.g. Q2 Outbound Blast"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="text-sm"
            />
          </div>

          {/* Type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={form.campaign_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, campaign_type: v as CampaignType }))
                }
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize text-sm">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as CampaignStatus }))
                }
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize text-sm">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ICP Criteria */}
          <div className="space-y-1">
            <Label className="text-xs">ICP Criteria (JSON)</Label>
            <Textarea
              placeholder='{"industry": "SaaS", "company_size": "50-200"}'
              value={form.icp_criteria}
              onChange={(e) =>
                setForm((f) => ({ ...f, icp_criteria: e.target.value }))
              }
              className="text-sm font-mono min-h-[80px]"
            />
          </div>

          {/* Budget + Max Enrollments */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Budget (₹)</Label>
              <Input
                type="number"
                placeholder="e.g. 50000"
                value={form.budget}
                onChange={(e) =>
                  setForm((f) => ({ ...f, budget: e.target.value }))
                }
                className="text-sm"
                min={0}
              />
              <p className="text-[10px] text-muted-foreground">Enter in rupees; stored as paise</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Enrollments</Label>
              <Input
                type="number"
                placeholder="e.g. 1000"
                value={form.max_enrollments}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_enrollments: e.target.value }))
                }
                className="text-sm"
                min={0}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : editing ? "Update" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Step Dialog sub-component
// ===========================================================================

function StepDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSave,
  saving,
  editing,
  templates,
  stepNumber,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: typeof emptyStepForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyStepForm>>;
  onSave: () => void;
  saving: boolean;
  editing: boolean;
  templates: TemplateOption[];
  stepNumber: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {editing ? `Edit Step #${stepNumber}` : `Add Step #${stepNumber}`}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configure this sequence step.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Step number display */}
          <div className="flex items-center gap-2 rounded bg-muted px-3 py-2">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Step Number:</span>
            <span className="text-sm font-medium">{stepNumber}</span>
          </div>

          {/* Channel + Delay */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Channel</Label>
              <Select
                value={form.channel}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, channel: v as StepChannel, template_id: "" }))
                }
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_CHANNELS.map((ch) => (
                    <SelectItem key={ch} value={ch} className="capitalize text-sm">
                      <span className="flex items-center gap-1.5">
                        {channelIcon(ch)}
                        {ch}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Delay (hours)</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.delay_hours}
                onChange={(e) =>
                  setForm((f) => ({ ...f, delay_hours: e.target.value }))
                }
                className="text-sm"
                min={0}
              />
              <p className="text-[10px] text-muted-foreground">Hours after previous step</p>
            </div>
          </div>

          {/* Template */}
          <div className="space-y-1">
            <Label className="text-xs">Template</Label>
            {templates.length > 0 ? (
              <Select
                value={form.template_id}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, template_id: v }))
                }
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-sm">
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  No templates found for {form.channel}. Create templates first or leave blank.
                </p>
              </div>
            )}
          </div>

          {/* Conditions */}
          <div className="space-y-1">
            <Label className="text-xs">Conditions (JSON, optional)</Label>
            <Textarea
              placeholder='{"min_lead_score": 50}'
              value={form.conditions}
              onChange={(e) =>
                setForm((f) => ({ ...f, conditions: e.target.value }))
              }
              className="text-sm font-mono min-h-[70px]"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, is_active: v }))
              }
            />
            <Label className="text-xs">Active</Label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : editing ? "Update Step" : "Add Step"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
