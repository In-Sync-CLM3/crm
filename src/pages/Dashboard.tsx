import { useMemo, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { useOrgContext } from "@/hooks/useOrgContext";
import { LoadingState } from "@/components/common/LoadingState";
import { useTasks } from "@/hooks/useTasks";
import { useCallbackReminders } from "@/hooks/useCallbackReminders";
import DateRangeFilter, { DateRangePreset, getDateRangeFromPreset } from "@/components/common/DateRangeFilter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { TrendingUp, PhoneCall, IndianRupee, ArrowLeft, RefreshCw, Percent } from "lucide-react";

// Extracted Dashboard components
import { DashboardStatsCards } from "@/components/Dashboard/DashboardStatsCards";
import { DashboardRevenueCards, type RevenueCardType } from "@/components/Dashboard/DashboardRevenueCards";
import { RevenueCardDialog } from "@/components/Dashboard/RevenueCardDialog";
import { DueToDeptDialog } from "@/components/Dashboard/DueToDeptDialog";
import { DashboardRevenueChart } from "@/components/Dashboard/DashboardRevenueChart";
import { DashboardPipelineChart } from "@/components/Dashboard/DashboardPipelineChart";
import { DashboardActivityChart } from "@/components/Dashboard/DashboardActivityChart";
import { DashboardTasksSection } from "@/components/Dashboard/DashboardTasksSection";

// Revenue Dashboard components
import { MonthlyGoalTracker } from "@/components/Revenue/MonthlyGoalTracker";
import { ProgressionChart } from "@/components/Revenue/ProgressionChart";
import { RevenueBreakdownTabs } from "@/components/Revenue/RevenueBreakdownTabs";
import { ContactsListDialog, type MetricType } from "@/components/Revenue/ContactsListDialog";
import { DashboardGSTSection } from "@/components/Dashboard/DashboardGSTSection";

type DashboardView = "main" | "revenue" | "gst";

interface DashboardStats {
  totalContacts: number;
  activeDeals: number;
  callsToday: number;
  conversionRate: number;
  newContactsThisWeek: number;
  dealsWonThisMonth: number;
  contactGrowth: number;
  dealGrowth: number;
}

interface PipelineData {
  stage: string;
  count: number;
  value: number;
}

interface RevenueStats {
  totalInvoiced: number;
  totalReceived: number;
  totalPending: number;
  totalGST: number;
  totalTDS: number;
  dueToDept: number;
}

interface MonthlyRevenueData {
  month: string;
  invoiced: number;
  received: number;
}

export default function Dashboard() {
  const { effectiveOrgId, isLoading: orgLoading } = useOrgContext();
  const queryClient = useQueryClient();
  const { triggerEdgeFunctionCheck, checkReminders } = useCallbackReminders();
  const hasCheckedReminders = useRef(false);
  
  // Date range filter state - default to This Month
  const [datePreset, setDatePreset] = useState<DateRangePreset>("this_month");
  const [dateRange, setDateRange] = useState(() => getDateRangeFromPreset("this_month"));
  
  // View toggle state for Dashboard views
  const [currentView, setCurrentView] = useState<DashboardView>("main");
  
  // Dialog state for clickable actuals
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("qualified");

  // Dialog state for revenue card drill-down
  const [revenueCardDialogOpen, setRevenueCardDialogOpen] = useState(false);
  const [selectedCardType, setSelectedCardType] = useState<RevenueCardType>("invoiced");
  
  // Dialog state for Due to Dept breakdown
  const [dueToDeptDialogOpen, setDueToDeptDialogOpen] = useState(false);

  // Removed goal state - no longer needed with new MonthlyGoalTracker

  // Trigger reminder check on dashboard load
  useEffect(() => {
    if (effectiveOrgId && !hasCheckedReminders.current) {
      hasCheckedReminders.current = true;
      triggerEdgeFunctionCheck();
      checkReminders();
    }
  }, [effectiveOrgId, triggerEdgeFunctionCheck, checkReminders]);

  // Fetch optimized dashboard stats using database function
  const { data: rawStats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["dashboard-stats", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      
      const { data, error } = await supabase.rpc("get_dashboard_stats", {
        p_org_id: effectiveOrgId,
      });
      
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch pipeline distribution
  const { data: pipelineRaw = [], isLoading: pipelineLoading } = useQuery({
    queryKey: ["pipeline-distribution", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      const { data, error } = await supabase.rpc("get_pipeline_distribution", {
        p_org_id: effectiveOrgId,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch communication activity from correct data sources
  const { data: emailCampaigns, isLoading: emailLoading } = useQuery({
    queryKey: ["email-campaigns-activity", effectiveOrgId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      
      const { data, error } = await supabase
        .from("email_bulk_campaigns")
        .select("sent_count, created_at")
        .eq("org_id", effectiveOrgId)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString());
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: whatsappCampaigns, isLoading: whatsappLoading } = useQuery({
    queryKey: ["whatsapp-campaigns-activity", effectiveOrgId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      
      const { data, error } = await supabase
        .from("whatsapp_bulk_campaigns")
        .select("sent_count, created_at")
        .eq("org_id", effectiveOrgId)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString());
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: smsCampaigns, isLoading: smsLoading } = useQuery({
    queryKey: ["sms-campaigns-activity", effectiveOrgId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      
      const { data, error } = await supabase
        .from("sms_bulk_campaigns")
        .select("sent_count, created_at")
        .eq("org_id", effectiveOrgId)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString());
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: callLogs, isLoading: callsLoading } = useQuery({
    queryKey: ["call-logs-activity", effectiveOrgId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      
      const { data, error } = await supabase
        .from("call_logs")
        .select("created_at")
        .eq("org_id", effectiveOrgId)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString());
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch invoices by invoice_date for "Total Invoiced" and "Pending"
  const { data: invoicedData, isLoading: invoicedLoading } = useQuery({
    queryKey: ["invoiced-stats", effectiveOrgId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      
      const { data, error } = await supabase
        .from("client_invoices")
        .select(`
          amount,
          tax_amount,
          status,
          due_date,
          document_type,
          invoice_date,
          client_id,
          contact_id,
          external_entity_id,
          clients(first_name, last_name, company)
        `)
        .eq("org_id", effectiveOrgId)
        .gte("invoice_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("invoice_date", format(dateRange.to, "yyyy-MM-dd"));
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch paid invoices by payment_received_date for "Payments Received", "GST", and "TDS"
  const { data: paymentsData, isLoading: paymentsLoading, error: paymentsError } = useQuery({
    queryKey: ["payments-stats", effectiveOrgId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      
      const { data, error } = await supabase
        .from("client_invoices")
        .select(`
          amount,
          status,
          document_type,
          invoice_date,
          payment_received_date,
          tax_amount,
          tds_amount,
          net_received_amount,
          actual_payment_received,
          client_id,
          contact_id,
          external_entity_id,
          clients(first_name, last_name, company)
        `)
        .eq("org_id", effectiveOrgId)
        .eq("status", "paid")
        .not("payment_received_date", "is", null)
        .gte("payment_received_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("payment_received_date", format(dateRange.to, "yyyy-MM-dd"));
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Debug log for payments data
  console.log('Payments data for GST/TDS:', {
    paymentsData,
    paymentsError,
    count: paymentsData?.length,
    dateRange: { from: format(dateRange.from, "yyyy-MM-dd"), to: format(dateRange.to, "yyyy-MM-dd") }
  });

  // Fetch billing_documents (new billing system) for the date range
  const { data: billingDocsData, isLoading: billingDocsLoading } = useQuery({
    queryKey: ["billing-docs-stats", effectiveOrgId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      const { data, error } = await supabase
        .from("billing_documents")
        .select("doc_type, doc_number, client_name, doc_date, total_amount, total_tax, subtotal, amount_paid, balance_due, status")
        .eq("org_id", effectiveOrgId)
        .in("doc_type", ["invoice", "proforma"])
        .neq("status", "draft")
        .neq("status", "cancelled")
        .gte("doc_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("doc_date", format(dateRange.to, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch billing_payments with parent document details for the date range
  const { data: billingPaymentsData, isLoading: billingPaymentsLoading } = useQuery({
    queryKey: ["billing-payments-stats", effectiveOrgId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      const { data, error } = await supabase
        .from("billing_payments")
        .select("id, amount, tds_amount, payment_date, document_id, billing_documents(doc_number, doc_type, client_name, subtotal, total_tax, total_amount, doc_date)")
        .eq("org_id", effectiveOrgId)
        .gte("payment_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("payment_date", format(dateRange.to, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch all-time billing_documents for GST due calculation
  const { data: allBillingPaidGst } = useQuery({
    queryKey: ["all-billing-paid-gst", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      const { data, error } = await supabase
        .from("billing_documents")
        .select("total_tax")
        .eq("org_id", effectiveOrgId)
        .eq("doc_type", "invoice")
        .eq("status", "paid");
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  const revenueLoading = invoicedLoading || paymentsLoading || billingDocsLoading || billingPaymentsLoading;

  // Normalize billing_documents to match client_invoices shape for unified display
  const normalizedBillingDocs = useMemo(() => {
    if (!billingDocsData) return [];
    return billingDocsData.map((doc: any) => ({
      id: doc.id || Math.random().toString(),
      invoice_number: doc.doc_number,
      amount: Number(doc.subtotal || 0),
      tax_amount: Number(doc.total_tax || 0),
      tds_amount: 0,
      status: doc.status === "sent" ? "pending" : doc.status,
      invoice_date: doc.doc_date,
      payment_received_date: doc.status === "paid" ? doc.doc_date : null,
      due_date: doc.due_date,
      document_type: doc.doc_type === "proforma" ? "proforma" : "invoice",
      net_received_amount: doc.amount_paid ? Number(doc.amount_paid) : null,
      actual_payment_received: doc.amount_paid ? Number(doc.amount_paid) : null,
      client_id: doc.client_id,
      clients: { first_name: doc.client_name, last_name: "", company: doc.client_name },
      _source: "billing",
    }));
  }, [billingDocsData]);

  // Normalize billing_payments for received/TDS drill-downs
  const normalizedBillingPayments = useMemo(() => {
    if (!billingPaymentsData) return [];
    return billingPaymentsData.map((p: any) => {
      const doc = p.billing_documents || {};
      return {
        id: p.id || Math.random().toString(),
        invoice_number: doc.doc_number || "—",
        amount: Number(doc.subtotal || 0),
        tax_amount: Number(doc.total_tax || 0),
        tds_amount: Number(p.tds_amount || 0),
        status: "paid",
        invoice_date: doc.doc_date || p.payment_date,
        payment_received_date: p.payment_date,
        document_type: doc.doc_type === "proforma" ? "proforma" : "invoice",
        net_received_amount: Number(p.amount || 0),
        actual_payment_received: Number(p.amount || 0),
        clients: { first_name: doc.client_name || "", last_name: "", company: doc.client_name || "" },
        _source: "billing",
      };
    });
  }, [billingPaymentsData]);

  // Combined revenue data — merges legacy client_invoices + new billing_documents
  const revenueData = useMemo(() => {
    return [...(invoicedData || []), ...normalizedBillingDocs];
  }, [invoicedData, normalizedBillingDocs]);

  // Combined payments data — merges legacy paid invoices + new billing_payments
  const mergedPaymentsData = useMemo(() => {
    return [...(paymentsData || []), ...normalizedBillingPayments];
  }, [paymentsData, normalizedBillingPayments]);

  // Fetch all-time paid invoices for total GST collected (used for Due to Dept calculation)
  const { data: allPaidInvoicesGst } = useQuery({
    queryKey: ["all-paid-invoices-gst", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      
      const { data, error } = await supabase
        .from("client_invoices")
        .select("tax_amount")
        .eq("org_id", effectiveOrgId)
        .eq("status", "paid")
        .neq("document_type", "quotation");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch GST payment tracking records (amounts already remitted to dept)
  const { data: gstPaymentTracking } = useQuery({
    queryKey: ["gst-payment-tracking-dashboard", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      
      const { data, error } = await supabase
        .from("gst_payment_tracking")
        .select("amount_paid, payment_status")
        .eq("org_id", effectiveOrgId);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch current goal - MOVED BEFORE EARLY RETURN
  // Fetch pipeline stages to get contacts by stage for MonthlyGoalTracker
  const { data: pipelineStages = [] } = useQuery({
    queryKey: ["pipeline-stages-for-goals", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id, name")
        .eq("org_id", effectiveOrgId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch monthly actuals from backend API
  const currentYear = new Date().getFullYear();
  const { data: backendActuals } = useQuery({
    queryKey: ["monthly-actuals-backend-v2", effectiveOrgId, currentYear],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      
      const { data, error } = await supabase.functions.invoke("get-monthly-actuals", {
        body: { org_id: effectiveOrgId, year: currentYear }
      });
      
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch yearly invoices with client details for dialog and fallback monthly computation
  const { data: yearlyInvoicesWithClients = [] } = useQuery({
    queryKey: ["yearly-invoices-with-clients", effectiveOrgId, currentYear],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      const startOfYear = `${currentYear}-01-01`;
      const endOfYear = `${currentYear}-12-31`;

      const { data, error } = await supabase
        .from("client_invoices")
        .select(`
          id, invoice_number, amount, tax_amount, status, invoice_date, payment_received_date, document_type,
          net_received_amount, actual_payment_received,
          clients(id, first_name, last_name, company)
        `)
        .eq("org_id", effectiveOrgId)
        .gte("invoice_date", startOfYear)
        .lte("invoice_date", endOfYear);
      if (error) throw error;

      // Also fetch invoices paid in this year (payment_received_date in year) but invoiced earlier
      const { data: paidData, error: paidError } = await supabase
        .from("client_invoices")
        .select(`
          id, invoice_number, amount, tax_amount, status, invoice_date, payment_received_date, document_type,
          net_received_amount, actual_payment_received,
          clients(id, first_name, last_name, company)
        `)
        .eq("org_id", effectiveOrgId)
        .eq("status", "paid")
        .gte("payment_received_date", startOfYear)
        .lte("payment_received_date", endOfYear)
        .lt("invoice_date", startOfYear);
      if (paidError) throw paidError;

      // Merge both sets, avoiding duplicates
      const allInvoices = [...(data || [])];
      const existingIds = new Set(allInvoices.map((inv: any) => inv.id));
      (paidData || []).forEach((inv: any) => {
        if (!existingIds.has(inv.id)) {
          allInvoices.push(inv);
        }
      });

      return allInvoices;
    },
    enabled: !!effectiveOrgId,
  });

  const activityLoading = emailLoading || whatsappLoading || callsLoading || smsLoading;

  // Process communication activity data into daily timeline format
  const dailyActivityData = useMemo(() => {
    // Create a map of dates within range
    const dateMap: Record<string, { calls: number; emails: number; whatsapp: number; sms: number }> = {};
    
    // Initialize all dates in range
    const start = new Date(dateRange.from);
    const end = new Date(dateRange.to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateKey = format(new Date(d), "yyyy-MM-dd");
      dateMap[dateKey] = { calls: 0, emails: 0, whatsapp: 0, sms: 0 };
    }

    // Add call counts
    callLogs?.forEach((log: any) => {
      const dateKey = format(new Date(log.created_at), "yyyy-MM-dd");
      if (dateMap[dateKey]) {
        dateMap[dateKey].calls += 1;
      }
    });

    // Add email counts from campaigns
    emailCampaigns?.forEach((campaign: any) => {
      const dateKey = format(new Date(campaign.created_at), "yyyy-MM-dd");
      if (dateMap[dateKey]) {
        dateMap[dateKey].emails += campaign.sent_count || 0;
      }
    });

    // Add whatsapp counts from campaigns
    whatsappCampaigns?.forEach((campaign: any) => {
      const dateKey = format(new Date(campaign.created_at), "yyyy-MM-dd");
      if (dateMap[dateKey]) {
        dateMap[dateKey].whatsapp += campaign.sent_count || 0;
      }
    });

    // Add SMS counts from campaigns
    smsCampaigns?.forEach((campaign: any) => {
      const dateKey = format(new Date(campaign.created_at), "yyyy-MM-dd");
      if (dateMap[dateKey]) {
        dateMap[dateKey].sms += campaign.sent_count || 0;
      }
    });

    // Convert to array and format dates for display
    return Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date: format(new Date(date), "MMM d"),
        ...counts,
      }));
  }, [emailCampaigns, whatsappCampaigns, smsCampaigns, callLogs, dateRange]);

  // Calculate Due to Dept (all-time GST collected - all-time GST paid to dept)
  const dueToDept = useMemo(() => {
    const legacyGst = allPaidInvoicesGst?.reduce((sum, inv) =>
      sum + (inv.tax_amount || 0), 0) || 0;
    const billingGst = allBillingPaidGst?.reduce((sum, inv) =>
      sum + Number(inv.total_tax || 0), 0) || 0;
    const totalCollectedAllTime = legacyGst + billingGst;

    const totalPaidToDept = gstPaymentTracking?.reduce((sum, p) => {
      if (p.payment_status === "paid" || p.payment_status === "partial") {
        return sum + (p.amount_paid || 0);
      }
      return sum;
    }, 0) || 0;

    return totalCollectedAllTime - totalPaidToDept;
  }, [allPaidInvoicesGst, allBillingPaidGst, gstPaymentTracking]);

  // Process revenue stats from unified merged data
  const revenueStats: RevenueStats = useMemo(() => {
    let totalInvoiced = 0;
    let totalPending = 0;

    // Total Invoiced & Pending from merged revenueData (legacy + billing_documents)
    (revenueData || []).forEach((inv: any) => {
      const amount = inv.amount || 0;
      const taxAmount = inv.tax_amount || 0;
      const totalAmount = amount + taxAmount;
      totalInvoiced += totalAmount;
      if (inv.status !== "paid") {
        totalPending += totalAmount;
      }
    });

    // Received, GST, TDS from merged payments (legacy + billing_payments)
    let totalReceived = 0;
    let totalGST = 0;
    let totalTDS = 0;

    (mergedPaymentsData || []).forEach((inv: any) => {
      const taxAmount = inv.tax_amount || 0;
      const tdsAmount = inv.tds_amount || 0;
      totalGST += taxAmount;
      totalTDS += tdsAmount;
      const amount = inv.amount || 0;
      const actualReceived = inv.actual_payment_received ||
                            inv.net_received_amount ||
                            (amount + taxAmount - tdsAmount);
      totalReceived += actualReceived;
    });

    return { totalInvoiced, totalReceived, totalPending, totalGST, totalTDS, dueToDept };
  }, [revenueData, mergedPaymentsData, dueToDept]);

  // Resolve entity name from client join (left join, may be null)
  const getEntityName = (inv: any): string => {
    if (inv.clients?.company || inv.clients?.first_name) {
      return inv.clients.company || `${inv.clients.first_name || ''} ${inv.clients.last_name || ''}`.trim() || 'Unknown';
    }
    return 'Unknown';
  };

  // Process monthly revenue data by client for trend chart
  const { clientRevenueData, uniqueClients } = useMemo(() => {
    if (!revenueData || revenueData.length === 0) return { clientRevenueData: [], uniqueClients: [] };

    // Include all invoices and quotations
    const invoicesOnly = revenueData;
    
    // Calculate total revenue per client to filter out zero-revenue clients
    const clientTotals: Record<string, number> = {};
    invoicesOnly.forEach((invoice: any) => {
      const clientName = getEntityName(invoice);
      clientTotals[clientName] = (clientTotals[clientName] || 0) + (invoice.amount || 0);
    });
    
    // Only include clients with revenue > 0, sorted by total revenue descending
    const uniqueClients = Object.entries(clientTotals)
      .filter(([_, total]) => total > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([client]) => client);
    
    // Group by month and client (combined total revenue)
    const monthlyData: Record<string, Record<string, number>> = {};
    
    invoicesOnly.forEach((invoice: any) => {
      const date = new Date(invoice.invoice_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const clientName = getEntityName(invoice);

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {};
      }
      
      const amount = invoice.amount || 0;
      monthlyData[monthKey][clientName] = (monthlyData[monthKey][clientName] || 0) + amount;
    });

    const sortedMonths = Object.keys(monthlyData).sort();
    const last6Months = sortedMonths.slice(-6);
    
    const clientRevenueData: Array<{ month: string; [key: string]: string | number }> = last6Months.map(monthKey => {
      const [year, month] = monthKey.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      const monthData: { month: string; [key: string]: string | number } = {
        month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      };
      
      uniqueClients.forEach(client => {
        monthData[client] = monthlyData[monthKey]?.[client] || 0;
      });
      
      return monthData;
    });

    return { clientRevenueData, uniqueClients };
  }, [revenueData]);

  // Revenue view specific data processing - MOVED BEFORE EARLY RETURN
  const revenueTrendData = useMemo(() => {
    if (!revenueData || revenueData.length === 0) return [];

    const invoicesOnly = revenueData.filter((inv: any) => inv.document_type !== 'quotation');
    const monthlyData: Record<string, { invoiced: number; received: number }> = {};

    invoicesOnly.forEach((invoice: any) => {
      const date = new Date(invoice.invoice_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { invoiced: 0, received: 0 };
      }
      
      const amount = invoice.amount || 0;
      monthlyData[monthKey].invoiced += amount;
      if (invoice.status === 'paid') {
        monthlyData[monthKey].received += amount;
      }
    });

    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([monthKey, data]) => {
        const [year, month] = monthKey.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return {
          period: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          invoiced: data.invoiced,
          received: data.received,
        };
      });
  }, [revenueData]);

  // Date breakdown for RevenueBreakdownTabs - MOVED BEFORE EARLY RETURN
  const dateBreakdown = useMemo(() => {
    if (!revenueData || revenueData.length === 0) return [];

    const invoicesOnly = revenueData.filter((inv: any) => inv.document_type !== 'quotation');
    const dateMap: Record<string, { invoiced: number; received: number; count: number; clients: Set<string> }> = {};
    
    invoicesOnly.forEach((inv: any) => {
      const dateKey = inv.invoice_date;
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { invoiced: 0, received: 0, count: 0, clients: new Set() };
      }
      const amount = inv.amount || 0;
      dateMap[dateKey].invoiced += amount;
      dateMap[dateKey].count += 1;
      if (inv.status === 'paid') {
        dateMap[dateKey].received += amount;
      }
      // Add client/company name
      const clientName = getEntityName(inv);
      if (clientName && clientName !== 'Unknown') {
        dateMap[dateKey].clients.add(clientName);
      }
    });

    return Object.entries(dateMap)
      .map(([date, data]) => ({ 
        date, 
        invoiced: data.invoiced, 
        received: data.received, 
        count: data.count,
        clients: Array.from(data.clients)
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [revenueData]);

  // Client breakdown for RevenueBreakdownTabs - MOVED BEFORE EARLY RETURN
  const clientBreakdown = useMemo(() => {
    if (!revenueData || revenueData.length === 0) return [];

    const invoicesOnly = revenueData.filter((inv: any) => inv.document_type !== 'quotation');
    const clientMap: Record<string, { totalInvoiced: number; totalPaid: number; invoiceCount: number; company?: string }> = {};
    
    invoicesOnly.forEach((inv: any) => {
      const entityName = getEntityName(inv);
      if (!clientMap[entityName]) {
        clientMap[entityName] = {
          totalInvoiced: 0,
          totalPaid: 0,
          invoiceCount: 0,
          company: inv.clients?.company
        };
      }
      const amount = inv.amount || 0;
      clientMap[entityName].totalInvoiced += amount;
      clientMap[entityName].invoiceCount += 1;
      if (inv.status === 'paid') {
        clientMap[entityName].totalPaid += amount;
      }
    });

    return Object.entries(clientMap)
      .map(([clientName, data]) => ({ 
        clientId: clientName, 
        clientName, 
        ...data 
      }))
      .sort((a, b) => b.totalInvoiced - a.totalInvoiced);
  }, [revenueData]);

  // Invoices for RevenueBreakdownTabs - MOVED BEFORE EARLY RETURN
  const invoicesForBreakdown = useMemo(() => {
    if (!revenueData || revenueData.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return revenueData
      .filter((inv: any) => inv.document_type !== 'quotation')
      .map((inv: any) => {
        const dueDate = inv.due_date ? new Date(inv.due_date) : null;
        let status = inv.status;
        if (status !== 'paid' && dueDate) {
          dueDate.setHours(0, 0, 0, 0);
          if (dueDate < today) {
            status = 'overdue';
          }
        }
        return {
          id: inv.id || Math.random().toString(),
          invoice_number: inv.invoice_number || '-',
          invoice_date: inv.invoice_date,
          amount: inv.amount || 0,
          status,
          due_date: inv.due_date,
          client: {
            first_name: inv.clients?.first_name || '',
            last_name: inv.clients?.last_name || '',
            company: inv.clients?.company,
          },
        };
      })
      .sort((a: any, b: any) => b.invoice_date.localeCompare(a.invoice_date));
  }, [revenueData]);

  // Listen for org context changes
  useEffect(() => {
    const handleOrgChange = () => {
      queryClient.removeQueries({ queryKey: ["dashboard-stats"] });
      queryClient.removeQueries({ queryKey: ["pipeline-distribution"] });
      queryClient.removeQueries({ queryKey: ["demo-stats"] });
      queryClient.removeQueries({ queryKey: ["revenue-stats"] });
    };

    window.addEventListener("orgContextChange", handleOrgChange);
    return () => window.removeEventListener("orgContextChange", handleOrgChange);
  }, [queryClient]);

  // Process monthly actuals from backend API, with client-side fallback for revenue
  const monthlyActuals = useMemo(() => {
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const result: Record<string, { qualified: number; proposals: number; deals: number; invoiced: number; received: number }> = {};

    // Initialize all months
    monthNames.forEach(m => {
      result[m] = { qualified: 0, proposals: 0, deals: 0, invoiced: 0, received: 0 };
    });

    // If we have backend actuals, use them
    if (backendActuals?.monthly_actuals) {
      const hasNonZeroData = backendActuals.monthly_actuals.some((md: any) =>
        (md.invoiced || 0) > 0 || (md.received || 0) > 0 || (md.qualified || 0) > 0
      );

      if (hasNonZeroData) {
        backendActuals.monthly_actuals.forEach((monthData: any) => {
          const monthKey = monthNames[monthData.month - 1];
          if (monthKey) {
            result[monthKey] = {
              qualified: monthData.qualified || 0,
              proposals: monthData.proposals || 0,
              deals: monthData.deals || 0,
              invoiced: monthData.invoiced || 0,
              received: monthData.received || 0,
            };
          }
        });
        return result;
      }
    }

    // Fallback: compute monthly revenue from yearlyInvoicesWithClients
    if (yearlyInvoicesWithClients && yearlyInvoicesWithClients.length > 0) {
      yearlyInvoicesWithClients.forEach((inv: any) => {
        // Invoiced: group by invoice_date month
        if (inv.invoice_date) {
          const invoiceMonth = new Date(inv.invoice_date).getMonth();
          const monthKey = monthNames[invoiceMonth];
          if (monthKey) {
            const amount = (inv.amount || 0) + (inv.tax_amount || 0);
            result[monthKey].invoiced += amount;
          }
        }

        // Received: group by payment_received_date month
        if (inv.status === 'paid' && inv.payment_received_date) {
          const paymentMonth = new Date(inv.payment_received_date).getMonth();
          const monthKey = monthNames[paymentMonth];
          if (monthKey) {
            const received = inv.actual_payment_received || inv.net_received_amount ||
              ((inv.amount || 0) + (inv.tax_amount || 0));
            result[monthKey].received += received;
          }
        }
      });
    }

    return result;
  }, [backendActuals, yearlyInvoicesWithClients]);

  // Store backend actuals for dialog data lookup
  const backendMonthlyData = useMemo(() => {
    if (!backendActuals?.monthly_actuals) return {};
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const result: Record<string, any> = {};
    backendActuals.monthly_actuals.forEach((monthData: any) => {
      const monthKey = monthNames[monthData.month - 1];
      if (monthKey) {
        result[monthKey] = monthData;
      }
    });
    return result;
  }, [backendActuals]);

  // Get filtered contacts/invoices for dialog using backend IDs or client-side fallback
  const getDialogData = useMemo(() => {
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    return async (month: string, metricType: MetricType) => {
      const monthData = backendMonthlyData[month];
      const monthIndex = monthNames.indexOf(month);

      if (metricType === "invoiced" || metricType === "received") {
        const invoiceIds = metricType === "invoiced"
          ? monthData?.invoiced_invoice_ids
          : monthData?.received_invoice_ids;

        // If backend has IDs, use them; otherwise filter yearlyInvoicesWithClients by month
        let matchedInvoices: any[];
        if (invoiceIds && invoiceIds.length > 0) {
          matchedInvoices = yearlyInvoicesWithClients.filter((inv: any) => invoiceIds.includes(inv.id));
        } else if (monthIndex >= 0) {
          // Client-side fallback: filter by month from invoice_date or payment_received_date
          matchedInvoices = yearlyInvoicesWithClients.filter((inv: any) => {
            if (metricType === "invoiced") {
              return inv.invoice_date && new Date(inv.invoice_date).getMonth() === monthIndex;
            } else {
              return inv.status === "paid" && inv.payment_received_date &&
                new Date(inv.payment_received_date).getMonth() === monthIndex;
            }
          });
        } else {
          matchedInvoices = [];
        }

        const invoices = matchedInvoices.map((inv: any) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          amount: inv.amount || 0,
          status: inv.status,
          invoice_date: metricType === "received" ? (inv.payment_received_date || inv.invoice_date) : inv.invoice_date,
          clientName: getEntityName(inv),
        }));
        return { invoices, contacts: [] };
      } else {
        let contactIds: string[] = [];
        if (metricType === "qualified") contactIds = monthData?.qualified_contact_ids || [];
        else if (metricType === "proposals") contactIds = monthData?.proposal_contact_ids || [];
        else if (metricType === "deals") contactIds = monthData?.deal_contact_ids || [];
        
        if (contactIds.length === 0) {
          return { contacts: [], invoices: [] };
        }

        // Fetch contact details from database
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, first_name, last_name, company, created_at, pipeline_stage_id")
          .in("id", contactIds);

        // Get stage names
        const stageNameMap: Record<string, string> = {};
        pipelineStages.forEach((stage: any) => {
          stageNameMap[stage.id] = stage.name?.toLowerCase() || '';
        });

        const formattedContacts = (contacts || []).map((contact: any) => ({
          id: contact.id,
          first_name: contact.first_name,
          last_name: contact.last_name,
          company: contact.company,
          created_at: contact.created_at,
          stageName: stageNameMap[contact.pipeline_stage_id] || '',
        }));
        return { contacts: formattedContacts, invoices: [] };
      }
    };
  }, [backendMonthlyData, yearlyInvoicesWithClients, pipelineStages]);

  // State for dialog data (fetched asynchronously)
  const [dialogData, setDialogData] = useState<{ contacts: any[]; invoices: any[] }>({ contacts: [], invoices: [] });

  const handleCellClick = async (month: string, metricType: MetricType) => {
    setSelectedMonth(month);
    setSelectedMetric(metricType);
    setDialogOpen(true);
    
    // Fetch the dialog data
    const data = await getDialogData(month, metricType);
    setDialogData(data);
  };

  // Calculate YTD totals for QuickSummaryPills
  const ytdTotals = useMemo(() => {
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const currentMonth = new Date().getMonth();
    
    let ytdDeals = 0, ytdProposals = 0, ytdRevenue = 0;
    let ytdDealsTarget = 0, ytdProposalsTarget = 0, ytdRevenueTarget = 0;
    const monthlyRevenueTrend: number[] = [];
    
    const monthlyTargets: Record<string, { qualified: number; proposals: number; deals: number; revenue: number }> = {
      JAN: { qualified: 2, proposals: 1, deals: 0, revenue: 200000 },
      FEB: { qualified: 3, proposals: 2, deals: 1, revenue: 400000 },
      MAR: { qualified: 4, proposals: 2, deals: 2, revenue: 800000 },
      APR: { qualified: 4, proposals: 2, deals: 2, revenue: 700000 },
      MAY: { qualified: 5, proposals: 2, deals: 2, revenue: 900000 },
      JUN: { qualified: 5, proposals: 3, deals: 2, revenue: 1000000 },
      JUL: { qualified: 6, proposals: 3, deals: 2, revenue: 900000 },
      AUG: { qualified: 6, proposals: 3, deals: 2, revenue: 1100000 },
      SEP: { qualified: 6, proposals: 3, deals: 2, revenue: 900000 },
      OCT: { qualified: 7, proposals: 3, deals: 2, revenue: 1100000 },
      NOV: { qualified: 7, proposals: 3, deals: 2, revenue: 1100000 },
      DEC: { qualified: 7, proposals: 3, deals: 3, revenue: 1200000 },
    };

    for (let i = 0; i <= currentMonth; i++) {
      const month = monthNames[i];
      const actual = monthlyActuals[month] || { qualified: 0, proposals: 0, deals: 0, invoiced: 0, received: 0 };
      const target = monthlyTargets[month];
      
      ytdDeals += actual.deals;
      ytdProposals += actual.proposals;
      ytdRevenue += actual.received;
      
      ytdDealsTarget += target.deals;
      ytdProposalsTarget += target.proposals;
      ytdRevenueTarget += target.revenue;
      
      monthlyRevenueTrend.push(ytdRevenue);
    }

    return { ytdDeals, ytdProposals, ytdRevenue, ytdDealsTarget, ytdProposalsTarget, ytdRevenueTarget, monthlyRevenueTrend };
  }, [monthlyActuals]);

  // Fetch tasks for analytics
  const { data: tasksData } = useTasks({ filter: "assigned_to_me" });
  const allTasks = tasksData?.tasks || [];
  const pendingTasksCount = allTasks.filter(t => t.status === "pending").length;
  const overdueTasksCount = allTasks.filter(t => t.isOverdue && t.status !== "completed").length;

  const loading = orgLoading || statsLoading || pipelineLoading || revenueLoading;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    await queryClient.invalidateQueries({ queryKey: ["pipeline-distribution"] });
    await queryClient.invalidateQueries({ queryKey: ["revenue-stats"] });
    await queryClient.invalidateQueries({ queryKey: ["monthly-actuals-backend-v2"] });
    await queryClient.invalidateQueries({ queryKey: ["email-campaigns-activity"] });
    await queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns-activity"] });
    await queryClient.invalidateQueries({ queryKey: ["sms-campaigns-activity"] });
    await queryClient.invalidateQueries({ queryKey: ["call-logs-activity"] });
    setIsRefreshing(false);
  };

  // Handle revenue card click to show drill-down dialog
  const handleRevenueCardClick = (cardType: RevenueCardType) => {
    // For GST card, show Due to Dept monthly breakdown dialog
    if (cardType === "gst") {
      setDueToDeptDialogOpen(true);
      return;
    }
    setSelectedCardType(cardType);
    setRevenueCardDialogOpen(true);
  };

  // Get invoices for revenue card dialog based on card type
  const getRevenueCardInvoices = useMemo(() => {
    if (!revenueData && !mergedPaymentsData) return [];

    const mapInvoice = (inv: any) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      amount: inv.amount || 0,
      status: inv.status,
      invoice_date: inv.invoice_date,
      payment_received_date: inv.payment_received_date,
      tax_amount: inv.tax_amount || 0,
      tds_amount: inv.tds_amount || 0,
      clientName: getEntityName(inv),
    });

    switch (selectedCardType) {
      case "invoiced":
        return (revenueData || []).map(mapInvoice);
      case "received":
        return (mergedPaymentsData || []).map(mapInvoice);
      case "pending":
        return (revenueData || []).filter((inv: any) => inv.status !== "paid").map(mapInvoice);
      case "gst":
        return (mergedPaymentsData || []).filter((inv: any) => (inv.tax_amount || 0) > 0).map(mapInvoice);
      case "tds":
        return (mergedPaymentsData || []).filter((inv: any) => (inv.tds_amount || 0) > 0).map(mapInvoice);
      default:
        return [];
    }
  }, [selectedCardType, revenueData, mergedPaymentsData]);

  // Format currency in Indian format
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Process stats from database function
  const stats: DashboardStats = useMemo(() => {
    if (!rawStats) {
      return {
        totalContacts: 0,
        activeDeals: 0,
        callsToday: 0,
        conversionRate: 0,
        newContactsThisWeek: 0,
        dealsWonThisMonth: 0,
        contactGrowth: 0,
        dealGrowth: 0,
      };
    }

    const { total_contacts, active_deals, calls_today, prev_month_contacts, conversion_rate } = rawStats;
    const currentMonthContacts = total_contacts - prev_month_contacts;
    const contactGrowth = prev_month_contacts > 0
      ? Math.round(((currentMonthContacts - prev_month_contacts) / prev_month_contacts) * 100)
      : 0;

    return {
      totalContacts: total_contacts,
      activeDeals: active_deals,
      callsToday: calls_today,
      conversionRate: conversion_rate || 0,
      newContactsThisWeek: 0,
      dealsWonThisMonth: 0,
      contactGrowth,
      dealGrowth: 0,
    };
  }, [rawStats]);

  // Process pipeline data
  const pipelineData: PipelineData[] = useMemo(() => {
    if (!pipelineRaw || pipelineRaw.length === 0) return [];

    return pipelineRaw.map((item: any) => ({
      stage: item.stage_name,
      count: Number(item.contact_count),
      value: Number(item.contact_count),
    }));
  }, [pipelineRaw]);

  // EARLY RETURN - All hooks are now above this point
  if (!effectiveOrgId || loading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading dashboard data..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-3">
            {currentView !== "main" && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setCurrentView("main")}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                {currentView === "revenue" ? "Revenue Dashboard" : currentView === "gst" ? "GST Dashboard" : "Dashboard"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {currentView === "revenue" 
                  ? "Track revenue, goals, and financial performance" 
                  : currentView === "gst"
                  ? "Track GST collected, pending, and filing summaries"
                  : "Real-time insights into your sales performance"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {currentView === "main" && (
              <>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => setCurrentView("revenue")}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                >
                  <IndianRupee className="h-4 w-4" />
                  Revenue
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => setCurrentView("gst")}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                >
                  <Percent className="h-4 w-4" />
                  GST
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/reports" className="gap-1.5">
                    <TrendingUp className="h-4 w-4" />
                    Analytics
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/calling-dashboard" className="gap-1.5">
                    <PhoneCall className="h-4 w-4" />
                    Calling
                  </Link>
                </Button>
              </>
            )}
            <DateRangeFilter
              value={dateRange}
              onChange={setDateRange}
              preset={datePreset}
              onPresetChange={setDatePreset}
            />
          </div>
        </div>

        {currentView === "gst" ? (
          <DashboardGSTSection dateRange={dateRange} />
        ) : currentView === "revenue" ? (
          <>
            {/* Revenue Metrics Cards */}
            <DashboardRevenueCards
              revenueStats={revenueStats}
              formatCurrency={formatCurrency}
              onCardClick={handleRevenueCardClick}
            />

            {/* Revenue Card Drill-down Dialog */}
            <RevenueCardDialog
              open={revenueCardDialogOpen}
              onClose={() => setRevenueCardDialogOpen(false)}
              cardType={selectedCardType}
              invoices={getRevenueCardInvoices}
              dateRangeLabel={`${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`}
            />

            {/* Due to Dept Monthly Breakdown Dialog */}
            <DueToDeptDialog
              open={dueToDeptDialogOpen}
              onClose={() => setDueToDeptDialogOpen(false)}
            />

            {/* Progression Chart - Full Page Animated */}
            <ProgressionChart monthlyActuals={monthlyActuals} />

            {/* Compact Monthly Goal Tracker Table */}
            <MonthlyGoalTracker
              monthlyActuals={monthlyActuals}
              onCellClick={handleCellClick}
            />

            {/* Revenue Trend & Breakdown */}
            <DashboardRevenueChart
              data={clientRevenueData}
              clients={uniqueClients}
              formatCurrency={formatCurrency}
            />

            {/* Revenue Breakdown by Date, Client, Invoice */}
            <RevenueBreakdownTabs
              invoices={invoicesForBreakdown}
              dateBreakdown={dateBreakdown}
              clientBreakdown={clientBreakdown}
            />

            {/* Contacts List Dialog for clickable actuals */}
            <ContactsListDialog
              open={dialogOpen}
              onClose={() => setDialogOpen(false)}
              month={selectedMonth}
              metricType={selectedMetric}
              contacts={dialogData.contacts}
              invoices={dialogData.invoices}
            />
          </>
        ) : (
          <>
            {/* Key Metrics */}
            <DashboardStatsCards 
              stats={stats} 
              pendingTasksCount={pendingTasksCount} 
              overdueTasksCount={overdueTasksCount} 
            />

            {/* Revenue Metrics */}
            <DashboardRevenueCards 
              revenueStats={revenueStats} 
              formatCurrency={formatCurrency}
              onCardClick={handleRevenueCardClick}
            />

            {/* Revenue Card Drill-down Dialog */}
            <RevenueCardDialog
              open={revenueCardDialogOpen}
              onClose={() => setRevenueCardDialogOpen(false)}
              cardType={selectedCardType}
              invoices={getRevenueCardInvoices}
              dateRangeLabel={`${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`}
            />

            {/* Due to Dept Monthly Breakdown Dialog */}
            <DueToDeptDialog
              open={dueToDeptDialogOpen}
              onClose={() => setDueToDeptDialogOpen(false)}
            />

            {/* Monthly Revenue by Client Chart */}
            <DashboardRevenueChart 
              data={clientRevenueData} 
              clients={uniqueClients}
              formatCurrency={formatCurrency} 
            />

            {/* Pipeline Distribution & Communication Activity Charts */}
            <div className="grid gap-2 grid-cols-1 lg:grid-cols-2">
              <DashboardPipelineChart data={pipelineData} />
              <DashboardActivityChart data={dailyActivityData} isLoading={activityLoading} />
            </div>

            {/* My Tasks Section */}
            <DashboardTasksSection limit={5} />
          </>
        )}
      </div>

    </DashboardLayout>
  );
}
