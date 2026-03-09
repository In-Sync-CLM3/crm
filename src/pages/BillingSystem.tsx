import { useState, useCallback } from "react";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home, FileText, Receipt, IndianRupee, CreditCard, Settings, Users } from "lucide-react";
import { useBillingData } from "@/hooks/useBillingData";
import { BillingDashboard } from "@/components/Billing/BillingDashboard";
import { BillingClientMaster } from "@/components/Billing/BillingClientMaster";
import { BillingDocumentList } from "@/components/Billing/BillingDocumentList";
import { BillingDocumentView } from "@/components/Billing/BillingDocumentView";
import { BillingCreateDocument } from "@/components/Billing/BillingCreateDocument";
import { BillingPaymentsList } from "@/components/Billing/BillingPaymentsList";
import { BillingSettingsPanel } from "@/components/Billing/BillingSettings";
import type { BillingDocument, BillingDocumentType } from "@/types/billing";

type BillingView = "dashboard" | "clients" | "quotations" | "proformas" | "invoices" | "payments" | "settings";

export default function BillingSystem() {
  const [view, setView] = useState<BillingView>("dashboard");
  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [createDocType, setCreateDocType] = useState<BillingDocumentType | null>(null);

  const {
    documents, payments, clients, settings,
    addDocument, updateDocument, deleteDocument, convertDocument,
    recordPayment, addClient, updateClient, updateSettings, getDocumentPayments, getNextDocNumber,
  } = useBillingData();

  const navigate = useCallback((v: BillingView) => {
    setView(v);
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
  }, []);

  const handleConvert = useCallback((doc: BillingDocument) => {
    const nextType: BillingDocumentType = doc.doc_type === "quotation" ? "proforma" : "invoice";
    convertDocument(doc, nextType);
  }, [convertDocument]);

  const handleRecordPayment = useCallback((payment: { document_id: string; amount: number; payment_date: string; payment_mode: string; reference_number: string; notes: string; org_id: string }) => {
    recordPayment(payment as any);
  }, [recordPayment]);

  // Determine active tab based on current view
  const activeTab = viewDocId || createDocType ? view : view;

  const renderContent = () => {
    // Document view
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
        />
      );
    }

    // Create document
    if (createDocType) {
      return (
        <BillingCreateDocument
          docType={createDocType}
          clients={clients}
          settings={settings}
          getNextDocNumber={getNextDocNumber}
          onSave={addDocument}
          onBack={handleBack}
        />
      );
    }

    // Main views
    switch (view) {
      case "dashboard":
        return (
          <BillingDashboard
            documents={documents}
            onCreateInvoice={() => handleCreateDoc("invoice")}
            onViewDocument={handleViewDoc}
          />
        );
      case "clients":
        return (
          <BillingClientMaster
            clients={clients}
            onAddClient={addClient}
            onUpdateClient={updateClient}
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
          />
        );
      case "invoices":
        return (
          <BillingDocumentList
            documents={documents}
            docType="invoice"
            onView={handleViewDoc}
            onCreate={() => handleCreateDoc("invoice")}
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
        {/* Navigation Tabs */}
        {!viewDocId && !createDocType && (
          <Tabs value={view} onValueChange={v => navigate(v as BillingView)}>
            <TabsList className="bg-muted/50 h-auto flex-wrap gap-0.5">
              <TabsTrigger value="dashboard" className="gap-1.5 text-xs"><Home className="h-3.5 w-3.5" />Dashboard</TabsTrigger>
              <TabsTrigger value="clients" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Clients</TabsTrigger>
              <TabsTrigger value="quotations" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />Quotations</TabsTrigger>
              <TabsTrigger value="proformas" className="gap-1.5 text-xs"><Receipt className="h-3.5 w-3.5" />Proforma Inv.</TabsTrigger>
              <TabsTrigger value="invoices" className="gap-1.5 text-xs"><IndianRupee className="h-3.5 w-3.5" />Tax Invoices</TabsTrigger>
              <TabsTrigger value="payments" className="gap-1.5 text-xs"><CreditCard className="h-3.5 w-3.5" />Payments</TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-xs"><Settings className="h-3.5 w-3.5" />Settings</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Content */}
        {renderContent()}
      </div>
    </DashboardLayout>
  );
}
