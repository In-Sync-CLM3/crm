import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users,
  Search,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  X,
  Filter,
  UserPlus,
  ArrowRight,
  Mail,
  Phone,
  Building,
  Globe,
  Linkedin,
  MapPin,
  Calendar,
  Target,
  TrendingUp,
  Zap,
  MessageSquare,
  Clock,
} from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import PaginationControls from "@/components/common/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { exportToCSV, formatDateForExport } from "@/utils/exportUtils";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Lead {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  status: string;
  source: string | null;
  industry_type: string | null;
  headline: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin_url: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  mkt_lead_scores: LeadScore | null;
}

interface LeadScore {
  id: string;
  fit_score: number;
  intent_score: number;
  engagement_score: number;
  total_score: number;
  scoring_model: string;
  scoring_details: any;
  scored_at: string;
}

interface SequenceEnrollment {
  id: string;
  campaign_id: string;
  current_step: number;
  status: string;
  next_action_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  campaign_name?: string;
}

interface SequenceAction {
  id: string;
  enrollment_id: string;
  step_number: number;
  channel: string;
  status: string;
  variant: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface ConversationMemory {
  id: string;
  context: any;
  token_count: number;
  last_channel: string | null;
  last_interaction_at: string | null;
  summary_count: number;
}

interface CampaignOption {
  id: string;
  name: string;
}

type SortField = "name" | "email" | "company" | "source" | "status" | "created_at";
type SortDir = "asc" | "desc";

const LEAD_STATUSES = ["new", "enriched", "scored", "enrolled", "converted", "disqualified"] as const;
const LEAD_SOURCES = ["apollo", "native", "google_ads", "indiamart", "website", "referral", "manual", "import"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function leadStatusColor(status: string): string {
  switch (status) {
    case "new":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "enriched":
      return "bg-cyan-100 text-cyan-700 border-cyan-200";
    case "scored":
      return "bg-violet-100 text-violet-700 border-violet-200";
    case "enrolled":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "converted":
      return "bg-green-100 text-green-700 border-green-200";
    case "disqualified":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function sourceColor(source: string): string {
  switch (source) {
    case "apollo":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "native":
      return "bg-indigo-100 text-indigo-700 border-indigo-200";
    case "google_ads":
      return "bg-red-100 text-red-700 border-red-200";
    case "indiamart":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "website":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "referral":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "manual":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "import":
      return "bg-teal-100 text-teal-700 border-teal-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function scoreColor(score: number | null): string {
  if (score === null || score === undefined) return "text-muted-foreground";
  if (score >= 80) return "text-green-600 font-semibold";
  if (score >= 50) return "text-amber-600 font-medium";
  if (score >= 20) return "text-orange-500";
  return "text-muted-foreground";
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
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "bounced":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function actionStatusColor(status: string): string {
  switch (status) {
    case "sent":
      return "bg-blue-100 text-blue-700";
    case "delivered":
      return "bg-green-100 text-green-700";
    case "failed":
    case "bounced":
      return "bg-red-100 text-red-700";
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "replied":
      return "bg-purple-100 text-purple-700";
    case "skipped":
      return "bg-gray-100 text-gray-500";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function replyIntentColor(intent: string): string {
  switch (intent) {
    case "interested": return "bg-green-100 text-green-700";
    case "objection": return "bg-amber-100 text-amber-700";
    case "unsubscribe": return "bg-red-100 text-red-700";
    case "out_of_office": return "bg-blue-100 text-blue-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function leadDisplayName(lead: Lead): string {
  const parts = [lead.first_name, lead.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "(unnamed)";
}

function getLeadScore(lead: Lead): number | null {
  if (lead.mkt_lead_scores) return lead.mkt_lead_scores.total_score;
  return null;
}

// ===========================================================================
// Main component
// ===========================================================================

export default function LeadBrowser() {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Applied filters (only update on search click)
  const [appliedFilters, setAppliedFilters] = useState({
    searchTerm: "",
    statusFilter: "all",
    sourceFilter: "all",
    dateFrom: "",
    dateTo: "",
  });

  // Sort
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Selection
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  // Detail panel
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  // Bulk actions
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkEnrollDialogOpen, setBulkEnrollDialogOpen] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState<string>("new");
  const [bulkCampaignId, setBulkCampaignId] = useState<string>("");

  // Export
  const [exporting, setExporting] = useState(false);

  // Pagination
  const pagination = usePagination({ defaultPageSize: 25 });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: [
      "contacts_marketing",
      effectiveOrgId,
      pagination.currentPage,
      pagination.pageSize,
      appliedFilters,
      sortField,
      sortDir,
    ],
    queryFn: async () => {
      if (!effectiveOrgId) return { data: [], count: 0 };

      let query = supabase
        .from("contacts")
        .select(
          `
          id, org_id, first_name, last_name, email, phone, company, job_title,
          status, source, industry_type, headline, city, state, country,
          linkedin_url, website, created_at, updated_at,
          mkt_lead_scores (
            id, fit_score, intent_score, engagement_score, total_score,
            scoring_model, scoring_details, scored_at
          )
        `,
          { count: "exact" }
        )
        .eq("org_id", effectiveOrgId)
        .not("source", "is", null);

      // Search filter
      if (appliedFilters.searchTerm) {
        const term = appliedFilters.searchTerm;
        query = query.or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`
        );
      }

      // Status filter
      if (appliedFilters.statusFilter && appliedFilters.statusFilter !== "all") {
        query = query.eq("status", appliedFilters.statusFilter);
      }

      // Source filter
      if (appliedFilters.sourceFilter && appliedFilters.sourceFilter !== "all") {
        query = query.eq("source", appliedFilters.sourceFilter);
      }

      // Date range
      if (appliedFilters.dateFrom) {
        query = query.gte("created_at", appliedFilters.dateFrom);
      }
      if (appliedFilters.dateTo) {
        query = query.lte("created_at", appliedFilters.dateTo + "T23:59:59.999Z");
      }

      // Sorting
      const dbSortField: string =
        sortField === "name" ? "first_name" : sortField;

      query = query.order(dbSortField, {
        ascending: sortDir === "asc",
        nullsFirst: false,
      });

      // Pagination
      const offset = (pagination.currentPage - 1) * pagination.pageSize;
      query = query.range(offset, offset + pagination.pageSize - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      const normalized = (data || []).map((row: any) => ({
        ...row,
        mkt_lead_scores: Array.isArray(row.mkt_lead_scores)
          ? row.mkt_lead_scores[0] || null
          : row.mkt_lead_scores || null,
      })) as Lead[];

      return { data: normalized, count: count || 0 };
    },
    enabled: !!effectiveOrgId,
  });

  const leads = leadsData?.data || [];

  // Update pagination total
  useEffect(() => {
    if (leadsData) {
      pagination.setTotalRecords(leadsData.count);
    }
  }, [leadsData?.count]);

  // Campaigns for enrollment dialog & display
  const { data: campaigns = [] } = useQuery({
    queryKey: ["mkt_campaigns_options", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_campaigns")
        .select("id, name")
        .eq("org_id", effectiveOrgId)
        .in("status", ["active", "draft"])
        .order("name");
      if (error) {
        console.warn("Could not fetch campaigns:", error.message);
        return [];
      }
      return (data || []) as CampaignOption[];
    },
    enabled: !!effectiveOrgId,
  });


  // Lead detail queries (only when detail panel is open)
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery({
    queryKey: ["lead_enrollments", selectedLead?.id],
    queryFn: async () => {
      if (!selectedLead) return [];
      const { data, error } = await supabase
        .from("mkt_sequence_enrollments")
        .select("*")
        .eq("lead_id", selectedLead.id)
        .order("enrolled_at", { ascending: false });
      if (error) throw error;

      // Fetch campaign names
      const campaignIds = [...new Set((data || []).map((e: any) => e.campaign_id))];
      let campaignNames: Record<string, string> = {};
      if (campaignIds.length > 0) {
        const { data: cData } = await supabase
          .from("mkt_campaigns")
          .select("id, name")
          .in("id", campaignIds);
        if (cData) {
          cData.forEach((c: any) => {
            campaignNames[c.id] = c.name;
          });
        }
      }

      return (data || []).map((e: any) => ({
        ...e,
        campaign_name: campaignNames[e.campaign_id] || "Unknown",
      })) as SequenceEnrollment[];
    },
    enabled: !!selectedLead && detailPanelOpen,
  });

  const { data: recentActions = [], isLoading: actionsLoading } = useQuery({
    queryKey: ["lead_actions", selectedLead?.id],
    queryFn: async () => {
      if (!selectedLead) return [];
      // Get enrollment IDs for this lead
      const { data: enrollmentData } = await supabase
        .from("mkt_sequence_enrollments")
        .select("id")
        .eq("lead_id", selectedLead.id);

      if (!enrollmentData || enrollmentData.length === 0) return [];

      const enrollmentIds = enrollmentData.map((e: any) => e.id);
      const { data, error } = await supabase
        .from("mkt_sequence_actions")
        .select("*")
        .in("enrollment_id", enrollmentIds)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as SequenceAction[];
    },
    enabled: !!selectedLead && detailPanelOpen,
  });

  const { data: conversationMemory, isLoading: memoryLoading } = useQuery({
    queryKey: ["lead_memory", selectedLead?.id],
    queryFn: async () => {
      if (!selectedLead) return null;
      const { data, error } = await supabase
        .from("mkt_conversation_memory")
        .select("*")
        .eq("lead_id", selectedLead.id)
        .maybeSingle();

      if (error) throw error;
      return data as ConversationMemory | null;
    },
    enabled: !!selectedLead && detailPanelOpen,
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const bulkUpdateStatusMutation = useMutation({
    mutationFn: async ({
      leadIds,
      newStatus,
    }: {
      leadIds: string[];
      newStatus: string;
    }) => {
      const { error } = await supabase
        .from("contacts")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .in("id", leadIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts_marketing"] });
      setSelectedLeads([]);
      setBulkStatusDialogOpen(false);
      notify.success("Leads updated", `Status updated for ${selectedLeads.length} leads`);
    },
    onError: (err: any) => {
      notify.error("Failed to update leads", err);
    },
  });

  const bulkEnrollMutation = useMutation({
    mutationFn: async ({
      leadIds,
      campaignId,
    }: {
      leadIds: string[];
      campaignId: string;
    }) => {
      const enrollments = leadIds.map((leadId) => ({
        org_id: effectiveOrgId,
        lead_id: leadId,
        campaign_id: campaignId,
        current_step: 1,
        status: "active",
      }));

      const { error } = await supabase
        .from("mkt_sequence_enrollments")
        .insert(enrollments);
      if (error) throw error;

      // Update contact status to enrolled for those currently in pre-enrolled states
      await supabase
        .from("contacts")
        .update({ status: "enrolled", updated_at: new Date().toISOString() })
        .in("id", leadIds)
        .in("status", ["new", "enriched", "scored"]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts_marketing"] });
      setSelectedLeads([]);
      setBulkEnrollDialogOpen(false);
      notify.success("Leads enrolled", `${selectedLeads.length} leads enrolled in campaign`);
    },
    onError: (err: any) => {
      notify.error("Failed to enroll leads", err);
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSearch() {
    pagination.reset();
    setAppliedFilters({
      searchTerm,
      statusFilter,
      sourceFilter,
      dateFrom,
      dateTo,
    });
  }

  function handleClearFilters() {
    setSearchTerm("");
    setStatusFilter("all");
    setSourceFilter("all");
    setDateFrom("");
    setDateTo("");
    pagination.reset();
    setAppliedFilters({
      searchTerm: "",
      statusFilter: "all",
      sourceFilter: "all",
      dateFrom: "",
      dateTo: "",
    });
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    pagination.reset();
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return <ChevronsUpDown className="h-3 w-3 ml-1 text-muted-foreground" />;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3 ml-1" />
    ) : (
      <ChevronDown className="h-3 w-3 ml-1" />
    );
  }

  function toggleLeadSelection(id: string) {
    setSelectedLeads((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAllSelection() {
    if (selectedLeads.length === leads.length && leads.length > 0) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map((l) => l.id));
    }
  }

  function openLeadDetail(lead: Lead) {
    setSelectedLead(lead);
    setDetailPanelOpen(true);
  }

  async function handleExport() {
    if (!effectiveOrgId) return;
    setExporting(true);
    try {
      let dataToExport: Lead[] = [];

      if (selectedLeads.length > 0) {
        dataToExport = leads.filter((l) => selectedLeads.includes(l.id));
      } else {
        // Fetch all matching filtered data in batches
        const batchSize = 500;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          let query = supabase
            .from("contacts")
            .select("id, org_id, first_name, last_name, email, phone, company, job_title, status, source, industry_type, headline, city, state, country, linkedin_url, website, created_at, updated_at")
            .eq("org_id", effectiveOrgId)
            .not("source", "is", null);

          if (appliedFilters.searchTerm) {
            const term = appliedFilters.searchTerm;
            query = query.or(
              `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`
            );
          }
          if (appliedFilters.statusFilter !== "all") {
            query = query.eq("status", appliedFilters.statusFilter);
          }
          if (appliedFilters.sourceFilter !== "all") {
            query = query.eq("source", appliedFilters.sourceFilter);
          }
          if (appliedFilters.dateFrom) {
            query = query.gte("created_at", appliedFilters.dateFrom);
          }
          if (appliedFilters.dateTo) {
            query = query.lte("created_at", appliedFilters.dateTo + "T23:59:59.999Z");
          }

          const { data, error } = await query
            .order("created_at", { ascending: false })
            .range(offset, offset + batchSize - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            dataToExport = [...dataToExport, ...data] as Lead[];
            offset += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }
      }

      if (dataToExport.length === 0) {
        notify.info("No Data", "No leads to export");
        return;
      }

      const columns = [
        { key: "first_name", label: "First Name" },
        { key: "last_name", label: "Last Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "company", label: "Company" },
        { key: "job_title", label: "Job Title" },
        { key: "industry_type", label: "Industry" },
        { key: "headline", label: "Headline" },
        { key: "city", label: "City" },
        { key: "state", label: "State" },
        { key: "country", label: "Country" },
        { key: "source", label: "Source" },
        { key: "status", label: "Status" },
        { key: "linkedin_url", label: "LinkedIn URL" },
        { key: "website", label: "Website" },
        { key: "created_at", label: "Created At", format: formatDateForExport },
      ];

      const filename = `marketing_leads_${new Date().toISOString().split("T")[0]}`;
      exportToCSV(dataToExport, columns, filename);
      notify.success("Export Complete", `${dataToExport.length} leads exported`);
    } catch (error: any) {
      notify.error("Export Failed", error);
    } finally {
      setExporting(false);
    }
  }

  const hasActiveFilters =
    appliedFilters.searchTerm ||
    appliedFilters.statusFilter !== "all" ||
    appliedFilters.sourceFilter !== "all" ||
    appliedFilters.dateFrom ||
    appliedFilters.dateTo;

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">Lead Browser</h1>
              <p className="text-xs text-muted-foreground">
                {pagination.totalRecords > 0
                  ? `${pagination.totalRecords.toLocaleString()} lead${pagination.totalRecords === 1 ? "" : "s"}`
                  : "Marketing leads"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter className="h-3.5 w-3.5 mr-1" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 h-2 w-2 rounded-full bg-primary inline-block" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              {exporting
                ? "Exporting..."
                : selectedLeads.length > 0
                ? `Export (${selectedLeads.length})`
                : "Export CSV"}
            </Button>
          </div>
        </div>

        {/* Search + Filters */}
        <Card>
          <CardContent className="p-3 space-y-3">
            {/* Search bar - always visible */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-8 text-sm h-9"
                />
              </div>
              <Button size="sm" onClick={handleSearch} className="h-9">
                Search
              </Button>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="h-9"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            {/* Advanced filters */}
            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t">
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="text-sm h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">
                        All Statuses
                      </SelectItem>
                      {LEAD_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-sm capitalize">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Source</Label>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="text-sm h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">
                        All Sources
                      </SelectItem>
                      {LEAD_SOURCES.map((s) => (
                        <SelectItem key={s} value={s} className="text-sm capitalize">
                          {s.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Created From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="text-sm h-8"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Created To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="text-sm h-8"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk actions bar */}
        {selectedLeads.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded-md border border-primary/20">
            <span className="text-sm font-medium">
              {selectedLeads.length} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkStatusDialogOpen(true)}
            >
              Update Status
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkEnrollDialogOpen(true)}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              Enroll in Campaign
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedLeads([])}
            >
              Deselect All
            </Button>
          </div>
        )}

        {/* Leads table */}
        <Card>
          <CardContent className="p-0">
            {leadsLoading ? (
              <LoadingState message="Loading leads..." />
            ) : leads.length === 0 ? (
              <EmptyState
                icon={<Users className="h-10 w-10 text-muted-foreground" />}
                title={hasActiveFilters ? "No leads match your filters" : "No leads yet"}
                message={
                  hasActiveFilters
                    ? "Try adjusting your search or filters."
                    : "Marketing leads will appear here as they are captured from campaigns and integrations."
                }
                action={
                  hasActiveFilters ? (
                    <Button size="sm" variant="outline" onClick={handleClearFilters}>
                      Clear Filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-xs">
                        <Checkbox
                          checked={
                            selectedLeads.length === leads.length && leads.length > 0
                          }
                          onCheckedChange={toggleAllSelection}
                        />
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer select-none"
                        onClick={() => handleSort("name")}
                      >
                        <div className="flex items-center">
                          Name
                          {sortIcon("name")}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer select-none hidden md:table-cell"
                        onClick={() => handleSort("email")}
                      >
                        <div className="flex items-center">
                          Email
                          {sortIcon("email")}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer select-none hidden lg:table-cell"
                        onClick={() => handleSort("company")}
                      >
                        <div className="flex items-center">
                          Company
                          {sortIcon("company")}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer select-none"
                        onClick={() => handleSort("source")}
                      >
                        <div className="flex items-center">
                          Source
                          {sortIcon("source")}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer select-none"
                        onClick={() => handleSort("status")}
                      >
                        <div className="flex items-center">
                          Status
                          {sortIcon("status")}
                        </div>
                      </TableHead>
                      <TableHead className="text-xs text-right">Score</TableHead>
                      <TableHead
                        className="text-xs cursor-pointer select-none hidden lg:table-cell"
                        onClick={() => handleSort("created_at")}
                      >
                        <div className="flex items-center">
                          Created
                          {sortIcon("created_at")}
                        </div>
                      </TableHead>
                      <TableHead className="text-xs w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => {
                      const score = getLeadScore(lead);
                      return (
                        <TableRow
                          key={lead.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => openLeadDetail(lead)}
                        >
                          <TableCell
                            className="py-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={selectedLeads.includes(lead.id)}
                              onCheckedChange={() => toggleLeadSelection(lead.id)}
                            />
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium truncate max-w-[160px]">
                                {leadDisplayName(lead)}
                              </span>
                              {lead.job_title && (
                                <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                                  {lead.job_title}
                                </span>
                              )}
                              {/* Show email on mobile in name cell */}
                              {lead.email && (
                                <span className="text-xs text-muted-foreground truncate max-w-[160px] md:hidden">
                                  {lead.email}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs hidden md:table-cell">
                            <span className="truncate max-w-[180px] block">
                              {lead.email || "-"}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs hidden lg:table-cell">
                            {lead.company ? (
                              <div className="flex items-center gap-1">
                                <Building className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="truncate max-w-[140px]">
                                  {lead.company}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] capitalize ${sourceColor(lead.source || "")}`}
                            >
                              {(lead.source || "unknown").replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] capitalize ${leadStatusColor(lead.status)}`}
                            >
                              {lead.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 text-right">
                            <span className={`text-xs ${scoreColor(score)}`}>
                              {score !== null && score !== undefined ? score : "-"}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs hidden lg:table-cell">
                            {format(new Date(lead.created_at), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                openLeadDetail(lead);
                              }}
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
          <PaginationControls
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            totalRecords={pagination.totalRecords}
            startRecord={pagination.startRecord}
            endRecord={pagination.endRecord}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            disabled={leadsLoading}
          />
        </Card>
      </div>

      {/* Lead Detail Panel */}
      <Dialog open={detailPanelOpen} onOpenChange={setDetailPanelOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedLead && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  {leadDisplayName(selectedLead)}
                  <Badge
                    variant="secondary"
                    className={`text-[10px] capitalize ${leadStatusColor(selectedLead.status)}`}
                  >
                    {selectedLead.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {selectedLead.email || "No email"}{" "}
                  {selectedLead.company && ` - ${selectedLead.company}`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Lead info grid */}
                <Card>
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Lead Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      {selectedLead.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs truncate">{selectedLead.email}</span>
                        </div>
                      )}
                      {selectedLead.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs">{selectedLead.phone}</span>
                        </div>
                      )}
                      {selectedLead.company && (
                        <div className="flex items-center gap-1.5">
                          <Building className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs">{selectedLead.company}</span>
                        </div>
                      )}
                      {selectedLead.job_title && (
                        <div className="flex items-center gap-1.5">
                          <Target className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs">{selectedLead.job_title}</span>
                        </div>
                      )}
                      {selectedLead.industry_type && (
                        <div className="flex items-center gap-1.5">
                          <Building className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs">{selectedLead.industry_type}</span>
                        </div>
                      )}
                      {selectedLead.headline && (
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs">{selectedLead.headline}</span>
                        </div>
                      )}
                      {(selectedLead.city || selectedLead.state || selectedLead.country) && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs">
                            {[selectedLead.city, selectedLead.state, selectedLead.country]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </div>
                      )}
                      {selectedLead.linkedin_url && (
                        <div className="flex items-center gap-1.5">
                          <Linkedin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <a
                            href={selectedLead.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline truncate"
                          >
                            LinkedIn Profile
                          </a>
                        </div>
                      )}
                      {selectedLead.website && (
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                          <a
                            href={
                              selectedLead.website.startsWith("http")
                                ? selectedLead.website
                                : `https://${selectedLead.website}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline truncate"
                          >
                            {selectedLead.website}
                          </a>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs">
                          Created {format(new Date(selectedLead.created_at), "dd MMM yyyy, HH:mm")}
                        </span>
                      </div>
                    </div>

                  </CardContent>
                </Card>

                {/* Score breakdown */}
                <Card>
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Score Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    {(() => {
                      const scoreData = selectedLead.mkt_lead_scores;
                      const fit = scoreData?.fit_score ?? 0;
                      const intent = scoreData?.intent_score ?? 0;
                      const engagement = scoreData?.engagement_score ?? 0;
                      const total = scoreData?.total_score ?? 0;

                      return (
                        <div className="space-y-2">
                          <div className="grid grid-cols-4 gap-2">
                            <div className="text-center p-2 rounded bg-muted">
                              <div className="flex items-center justify-center gap-1 mb-1">
                                <Target className="h-3 w-3 text-blue-500" />
                                <span className="text-[10px] text-muted-foreground">Fit</span>
                              </div>
                              <span className={`text-sm font-semibold ${scoreColor(fit)}`}>
                                {fit}
                              </span>
                            </div>
                            <div className="text-center p-2 rounded bg-muted">
                              <div className="flex items-center justify-center gap-1 mb-1">
                                <TrendingUp className="h-3 w-3 text-amber-500" />
                                <span className="text-[10px] text-muted-foreground">Intent</span>
                              </div>
                              <span className={`text-sm font-semibold ${scoreColor(intent)}`}>
                                {intent}
                              </span>
                            </div>
                            <div className="text-center p-2 rounded bg-muted">
                              <div className="flex items-center justify-center gap-1 mb-1">
                                <Zap className="h-3 w-3 text-green-500" />
                                <span className="text-[10px] text-muted-foreground">Engage</span>
                              </div>
                              <span className={`text-sm font-semibold ${scoreColor(engagement)}`}>
                                {engagement}
                              </span>
                            </div>
                            <div className="text-center p-2 rounded bg-primary/5 border border-primary/20">
                              <div className="flex items-center justify-center gap-1 mb-1">
                                <span className="text-[10px] font-medium text-primary">Total</span>
                              </div>
                              <span className={`text-sm font-bold ${scoreColor(total)}`}>
                                {total}
                              </span>
                            </div>
                          </div>
                          {scoreData?.scoring_model && (
                            <p className="text-[10px] text-muted-foreground">
                              Model: {scoreData.scoring_model} | Scored:{" "}
                              {scoreData.scored_at
                                ? format(new Date(scoreData.scored_at), "dd MMM yyyy HH:mm")
                                : "N/A"}
                            </p>
                          )}
                          {scoreData?.scoring_details &&
                            typeof scoreData.scoring_details === "object" &&
                            Object.keys(scoreData.scoring_details).length > 0 && (
                              <details className="text-xs">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                  Scoring Details
                                </summary>
                                <pre className="mt-1 bg-muted rounded p-2 overflow-auto max-h-32 text-[10px]">
                                  {JSON.stringify(scoreData.scoring_details, null, 2)}
                                </pre>
                              </details>
                            )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Campaign Enrollments */}
                <Card>
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Campaign Enrollments
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    {enrollmentsLoading ? (
                      <LoadingState message="Loading enrollments..." className="py-3" />
                    ) : enrollments.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        Not enrolled in any campaigns.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {enrollments.map((enrollment) => (
                          <div
                            key={enrollment.id}
                            className="flex items-center justify-between p-2 rounded bg-muted text-xs"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">{enrollment.campaign_name}</span>
                              <span className="text-muted-foreground">
                                Step {enrollment.current_step} | Enrolled{" "}
                                {format(new Date(enrollment.enrolled_at), "dd MMM yyyy")}
                              </span>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[10px] capitalize ${enrollmentStatusColor(enrollment.status)}`}
                            >
                              {enrollment.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Actions */}
                <Card>
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Recent Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    {actionsLoading ? (
                      <LoadingState message="Loading actions..." className="py-3" />
                    ) : recentActions.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        No actions recorded yet.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {recentActions.map((action) => (
                          <div
                            key={action.id}
                            className={`p-1.5 rounded border text-xs ${action.status === "replied" ? "border-purple-200 bg-purple-50/50" : ""}`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="shrink-0">
                                {action.channel === "email" && (
                                  <Mail className="h-3 w-3 text-blue-500" />
                                )}
                                {action.channel === "whatsapp" && (
                                  <MessageSquare className="h-3 w-3 text-green-500" />
                                )}
                                {action.channel === "call" && (
                                  <Phone className="h-3 w-3 text-amber-500" />
                                )}
                                {action.channel === "sms" && (
                                  <MessageSquare className="h-3 w-3 text-purple-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="capitalize">{action.channel}</span>
                                <span className="text-muted-foreground">
                                  {" "}- Step {action.step_number}
                                </span>
                                {action.variant && (
                                  <span className="text-muted-foreground">
                                    {" "}(Variant {action.variant})
                                  </span>
                                )}
                              </div>
                              <Badge
                                variant="outline"
                                className={`text-[10px] capitalize shrink-0 ${actionStatusColor(action.status)}`}
                              >
                                {action.status}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {format(new Date(action.created_at), "dd MMM HH:mm")}
                              </span>
                            </div>
                            {action.status === "replied" && action.metadata && (
                              <div className="mt-1.5 pl-5 space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {action.metadata.reply_intent && (
                                    <Badge variant="outline" className={`text-[10px] capitalize ${replyIntentColor(action.metadata.reply_intent as string)}`}>
                                      {String(action.metadata.reply_intent).replace(/_/g, " ")}
                                    </Badge>
                                  )}
                                  {action.metadata.reply_subject && (
                                    <span className="text-[10px] text-muted-foreground truncate">
                                      Re: {String(action.metadata.reply_subject)}
                                    </span>
                                  )}
                                </div>
                                {action.metadata.reply_preview && (
                                  <p className="text-[10px] text-muted-foreground line-clamp-2 italic">
                                    "{String(action.metadata.reply_preview)}"
                                  </p>
                                )}
                                {action.replied_at && (
                                  <p className="text-[10px] text-muted-foreground">
                                    Replied {format(new Date(action.replied_at), "dd MMM yyyy HH:mm")}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Conversation Memory */}
                <Card>
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Conversation Memory
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    {memoryLoading ? (
                      <LoadingState message="Loading memory..." className="py-3" />
                    ) : !conversationMemory ? (
                      <p className="text-xs text-muted-foreground py-2">
                        No conversation memory recorded.
                      </p>
                    ) : (
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-3">
                          {conversationMemory.last_channel && (
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3 text-muted-foreground" />
                              <span>Last: {conversationMemory.last_channel}</span>
                            </div>
                          )}
                          {conversationMemory.last_interaction_at && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span>
                                {format(
                                  new Date(conversationMemory.last_interaction_at),
                                  "dd MMM yyyy HH:mm"
                                )}
                              </span>
                            </div>
                          )}
                          <span className="text-muted-foreground">
                            {conversationMemory.token_count} tokens |{" "}
                            {conversationMemory.summary_count} summaries
                          </span>
                        </div>

                        {conversationMemory.context &&
                          typeof conversationMemory.context === "object" && (
                            <div className="space-y-1.5">
                              {conversationMemory.context.key_facts &&
                                conversationMemory.context.key_facts.length > 0 && (
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                                      Key Facts
                                    </p>
                                    <ul className="list-disc list-inside text-xs space-y-0.5">
                                      {conversationMemory.context.key_facts.map(
                                        (fact: string, i: number) => (
                                          <li key={i}>{fact}</li>
                                        )
                                      )}
                                    </ul>
                                  </div>
                                )}
                              {conversationMemory.context.objections &&
                                conversationMemory.context.objections.length > 0 && (
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                                      Objections
                                    </p>
                                    <ul className="list-disc list-inside text-xs space-y-0.5">
                                      {conversationMemory.context.objections.map(
                                        (obj: string, i: number) => (
                                          <li key={i}>{obj}</li>
                                        )
                                      )}
                                    </ul>
                                  </div>
                                )}
                              {conversationMemory.context.interests &&
                                conversationMemory.context.interests.length > 0 && (
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                                      Interests
                                    </p>
                                    <ul className="list-disc list-inside text-xs space-y-0.5">
                                      {conversationMemory.context.interests.map(
                                        (int: string, i: number) => (
                                          <li key={i}>{int}</li>
                                        )
                                      )}
                                    </ul>
                                  </div>
                                )}
                              {conversationMemory.context.next_steps &&
                                conversationMemory.context.next_steps.length > 0 && (
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                                      Next Steps
                                    </p>
                                    <ul className="list-disc list-inside text-xs space-y-0.5">
                                      {conversationMemory.context.next_steps.map(
                                        (step: string, i: number) => (
                                          <li key={i}>{step}</li>
                                        )
                                      )}
                                    </ul>
                                  </div>
                                )}
                              {conversationMemory.context.timeline &&
                                conversationMemory.context.timeline.length > 0 && (
                                  <details className="text-xs">
                                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                      Interaction Timeline ({conversationMemory.context.timeline.length})
                                    </summary>
                                    <div className="mt-1 space-y-1">
                                      {conversationMemory.context.timeline
                                        .slice(-5)
                                        .map((entry: any, i: number) => (
                                          <div
                                            key={i}
                                            className="p-1.5 bg-muted rounded text-[10px]"
                                          >
                                            <span className="font-medium capitalize">
                                              {entry.channel}
                                            </span>{" "}
                                            <span className="text-muted-foreground">
                                              ({entry.direction})
                                            </span>
                                            {entry.summary && (
                                              <p className="mt-0.5">{entry.summary}</p>
                                            )}
                                            {entry.timestamp && (
                                              <p className="text-muted-foreground mt-0.5">
                                                {format(
                                                  new Date(entry.timestamp),
                                                  "dd MMM yyyy HH:mm"
                                                )}
                                              </p>
                                            )}
                                          </div>
                                        ))}
                                    </div>
                                  </details>
                                )}
                            </div>
                          )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Update Status Dialog */}
      <Dialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Update Lead Status</DialogTitle>
            <DialogDescription className="text-xs">
              Change status for {selectedLeads.length} selected lead
              {selectedLeads.length === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">New Status</Label>
              <Select value={bulkNewStatus} onValueChange={setBulkNewStatus}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-sm capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkStatusDialogOpen(false)}
                disabled={bulkUpdateStatusMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  bulkUpdateStatusMutation.mutate({
                    leadIds: selectedLeads,
                    newStatus: bulkNewStatus,
                  })
                }
                disabled={bulkUpdateStatusMutation.isPending}
              >
                {bulkUpdateStatusMutation.isPending ? "Updating..." : "Update"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Enroll in Campaign Dialog */}
      <Dialog open={bulkEnrollDialogOpen} onOpenChange={setBulkEnrollDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Enroll in Campaign</DialogTitle>
            <DialogDescription className="text-xs">
              Enroll {selectedLeads.length} selected lead
              {selectedLeads.length === 1 ? "" : "s"} in a campaign sequence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Campaign</Label>
              {campaigns.length > 0 ? (
                <Select value={bulkCampaignId} onValueChange={setBulkCampaignId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select a campaign..." />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-sm">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground p-2 border rounded">
                  No active or draft campaigns available. Create a campaign first.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkEnrollDialogOpen(false)}
                disabled={bulkEnrollMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  bulkEnrollMutation.mutate({
                    leadIds: selectedLeads,
                    campaignId: bulkCampaignId,
                  })
                }
                disabled={bulkEnrollMutation.isPending || !bulkCampaignId}
              >
                {bulkEnrollMutation.isPending ? "Enrolling..." : "Enroll"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
