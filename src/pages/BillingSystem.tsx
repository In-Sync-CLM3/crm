import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home, FileText, Receipt, IndianRupee, CreditCard, Settings, FileX2 } from "lucide-react";
import { useBillingData } from "@/hooks/useBillingData";
import { BillingDashboard } from "@/components/Billing/BillingDashboard";
import { BillingDocumentList } from "@/components/Billing/BillingDocumentList";
import { BillingDocumentView } from "@/components/Billing/BillingDocumentView";
import { BillingCreateDocument } from "@/components/Billing/BillingCreateDocument";
import { BillingPaymentsList } from "@/components/Billing/BillingPaymentsList";
import { BillingSettingsPanel } from "@/components/Billing/BillingSettings";
import { LoadingState } from "@/components/common/LoadingState";
import type { BillingDocument, BillingDocumentType, BillingClient } from "@/types/billing";
import { INDIAN_STATES } from "@/types/billing";

type BillingView = "dashboard" | "quotations" | "proformas" | "invoices" | "credit_notes" | "payments" | "settings";

// Map CRM client state name to state code
function getStateCode(stateName: string | null): string {
  if (!stateName) return "";
  const found = INDIAN_STATES.find(s => s.name.toLowerCase() === stateName.toLowerCase());
  return found?.code || "";
}

export default function BillingSystem() {
  const { effectiveOrgId } = useOrgContext();
  const [view, setView] = useState<BillingView>("dashboard");
  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [createDocType, setCreateDocType] = useState<BillingDocumentType | null>(null);
  const [editDoc, setEditDoc] = useState<BillingDocument | null>(null);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string | undefined>(undefined);

  const {
    documents, payments, settings,
    addDocument, updateDocument, deleteDocument, convertDocument,
    recordPayment, updateSettings, getDocumentPayments, getNextDocNumber,
    issueCreditNote,
  } = useBillingData();

  // Fetch CRM clients from Supabase
  const { data: crmClients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["billing-crm-clients", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("id, company, first_name, last_name, email, phone, address, city, state, postal_code, status")
        .eq("org_id", effectiveOrgId)
        .order("company", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Map CRM clients to BillingClient format
  const clients: BillingClient[] = useMemo(() => {
    return crmClients.map(c => ({
      id: c.id,
      company: c.company || `${c.first_name} ${c.last_name || ""}`.trim(),
      first_name: c.first_name,
      last_name: c.last_name || undefined,
      email: c.email || undefined,
      phone: c.phone || undefined,
      billing_address: c.address || undefined,
      city: c.city || undefined,
      state: c.state || undefined,
      pin_code: c.postal_code || undefined,
      billing_state_code: getStateCode(c.state),
      status: c.status || "active",
    }));
  }, [crmClients]);

  const navigate = useCallback((v: BillingView) => {
    setView(v);
    setViewDocId(null);
    setCreateDocType(null);
    if (v !== "invoices") setInvoiceStatusFilter(undefined);
  }, []);

  const handleDashboardCardClick = useCallback((filter: string) => {
    if (filter === "credit_notes") {
      setView("credit_notes");
      setViewDocId(null);
      setCreateDocType(null);
      return;
    }
    setInvoiceStatusFilter(filter);
    setView("invoices");
    setViewDocId(null);
    setCreateDocType(null);
  }, []);

  const handleViewDoc = useCallback((id: string) => {
    setViewDocId(id);
    setCreateDocType(null);
  }, []);

  const handleCreateDoc = useCallback((docType: BillingDocumentType) => {
    setCreateDocType(docType);
    setViewDocId(null);
  }, []);

  const handleBack = useCallback(() => {
    setViewDocId(null);
    setCreateDocType(null);
    setEditDoc(null);
  }, []);

  const handleEditDoc = useCallback((doc: BillingDocument) => {
    setEditDoc(doc);
    setCreateDocType(doc.doc_type);
    setViewDocId(null);
  }, []);

  const handleDeleteDoc = useCallback((id: string) => {
    deleteDocument(id);
    if (viewDocId === id) setViewDocId(null);
  }, [deleteDocument, viewDocId]);

  const handleSaveDoc = useCallback((doc: BillingDocument) => {
    if (editDoc) {
      updateDocument(doc.id, doc);
    } else {
      addDocument(doc);
    }
  }, [editDoc, updateDocument, addDocument]);

  const handleIssueCreditNote = useCallback((doc: BillingDocument) => {
    updateDocument(doc.id, { status: "cancelled" });
    const cn = issueCreditNote(doc);
    setViewDocId(cn.id);
    setCreateDocType(null);
    setEditDoc(null);
  }, [issueCreditNote, updateDocument]);

  const handleConvert = useCallback((doc: BillingDocument) => {
    const nextType: BillingDocumentType = doc.doc_type === "quotation" ? "proforma" : "invoice";
    convertDocument(doc, nextType);
  }, [convertDocument]);

  const handleConvertToInvoice = useCallback((doc: BillingDocument) => {
    convertDocument(doc, "invoice");
  }, [convertDocument]);

  const handleRecordPayment = useCallback((payment: { document_id: string; amount: number; payment_date: string; payment_mode: string; reference_number: string; notes: string; org_id: string }) => {
    recordPayment(payment as any);
  }, [recordPayment]);

  if (clientsLoading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading billing data..." />
      </DashboardLayout>
    );
  }

  const renderContent = () => {
    if (viewDocId) {
      const doc = documents.find(d => d.id === viewDocId);
      if (!doc) return <div className="text-center text-muted-foreground py-8">Document not found</div>;
      return (
        <BillingDocumentView
          doc={doc}
          payments={getDocumentPayments(doc.id)}
          settings={settings}
          onBack={handleBack}
          onRecordPayment={handleRecordPayment}
          onEdit={handleEditDoc}
          onDelete={handleDeleteDoc}
          onIssueCreditNote={handleIssueCreditNote}
          onConvertToInvoice={doc.doc_type === "proforma" ? handleConvert : undefined}
        />
      );
    }

    if (createDocType) {
      return (
        <BillingCreateDocument
          docType={createDocType}
          clients={clients}
          settings={settings}
          getNextDocNumber={getNextDocNumber}
          onSave={handleSaveDoc}
          onBack={handleBack}
          editDoc={editDoc || undefined}
          onUpdateSettings={updateSettings}
        />
      );
    }

    switch (view) {
      case "dashboard":
        return (
          <BillingDashboard
            documents={documents}
            onCreateInvoice={() => handleCreateDoc("invoice")}
            onViewDocument={handleViewDoc}
            onCardClick={handleDashboardCardClick}
          />
        );
      case "quotations":
        return (
          <BillingDocumentList
            documents={documents}
            docType="quotation"
            onView={handleViewDoc}
            onCreate={() => handleCreateDoc("quotation")}
            onConvert={handleConvert}
            onConvertToInvoice={handleConvertToInvoice}
            onDelete={handleDeleteDoc}
          />
        );
      case "proformas":
        return (
          <BillingDocumentList
            documents={documents}
            docType="proforma"
            onView={handleViewDoc}
            onCreate={() => handleCreateDoc("proforma")}
            onConvert={handleConvert}
            onDelete={handleDeleteDoc}
          />
        );
      case "invoices":
        return (
          <BillingDocumentList
            documents={documents}
            docType="invoice"
            onView={handleViewDoc}
            onCreate={() => handleCreateDoc("invoice")}
            initialStatusFilter={invoiceStatusFilter}
            onDelete={handleDeleteDoc}
          />
        );
      case "credit_notes":
        return (
          <BillingDocumentList
            documents={documents}
            docType="credit_note"
            onView={handleViewDoc}
            onCreate={() => handleCreateDoc("credit_note")}
            onDelete={handleDeleteDoc}
          />
        );
      case "payments":
        return <BillingPaymentsList payments={payments} documents={documents} />;
      case "settings":
        return <BillingSettingsPanel settings={settings} onSave={updateSettings} />;
      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {!viewDocId && !createDocType && (
          <Tabs value={view} onValueChange={v => navigate(v as BillingView)}>
            <TabsList className="bg-muted/50 h-auto flex-wrap gap-0.5">
              <TabsTrigger value="dashboard" className="gap-1.5 text-xs"><Home className="h-3.5 w-3.5" />Dashboard</TabsTrigger>
              <TabsTrigger value="quotations" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />Quotations</TabsTrigger>
              <TabsTrigger value="proformas" className="gap-1.5 text-xs"><Receipt className="h-3.5 w-3.5" />Proforma Inv.</TabsTrigger>
              <TabsTrigger value="invoices" className="gap-1.5 text-xs"><IndianRupee className="h-3.5 w-3.5" />Tax Invoices</TabsTrigger>
              <TabsTrigger value="credit_notes" className="gap-1.5 text-xs"><FileX2 className="h-3.5 w-3.5" />Credit Notes</TabsTrigger>
              <TabsTrigger value="payments" className="gap-1.5 text-xs"><CreditCard className="h-3.5 w-3.5" />Payments</TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-xs"><Settings className="h-3.5 w-3.5" />Settings</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {renderContent()}
      </div>
    </DashboardLayout>
  );
}
