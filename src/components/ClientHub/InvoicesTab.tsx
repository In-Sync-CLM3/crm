import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Search, Plus, Receipt, Download, Trash2, Filter, Users, Building2, Contact, ArrowRight, Loader2, Sparkles, Upload, Pencil, Check, X } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { DocumentPreview } from "@/components/common/DocumentPreview";
import { EntitySelector, SelectedEntity } from "./EntitySelector";
import { RevenueAnalytics } from "./RevenueAnalytics";
import { SmartInvoiceUploadDialog } from "./SmartInvoiceUploadDialog";
import { MonthlyTaxSummary } from "@/components/Clients/MonthlyTaxSummary";
import { format } from "date-fns";

const invoiceStatuses = [
  { value: "draft", label: "Draft", variant: "outline" as const },
  { value: "sent", label: "Sent", variant: "secondary" as const },
  { value: "paid", label: "Paid", variant: "default" as const },
  { value: "overdue", label: "Overdue", variant: "destructive" as const },
  { value: "cancelled", label: "Cancelled", variant: "outline" as const },
];

export function InvoicesTab() {
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  const notify = useNotification();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSmartUploadOpen, setIsSmartUploadOpen] = useState(false);
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  // Form state
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [documentType, setDocumentType] = useState<"invoice" | "proforma">("invoice");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  // Inline editing state
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editTdsAmount, setEditTdsAmount] = useState("");
  const [editPaymentDate, setEditPaymentDate] = useState("");
  const [editActualPayment, setEditActualPayment] = useState("");

  // Fetch all invoices with entity info — merges client_invoices and billing_documents
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["all-invoices", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];

      const [clientInvoicesRes, billingDocsRes] = await Promise.all([
        supabase
          .from("client_invoices")
          .select(`
            *,
            client:clients(id, first_name, last_name, company),
            contact:contacts(id, first_name, last_name, company),
            external_entity:external_entities(id, name, company)
          `)
          .eq("org_id", effectiveOrgId),
        supabase
          .from("billing_documents")
          .select(`
            id, org_id, doc_type, doc_number, doc_date, due_date, status,
            subtotal, total_tax, total_amount, amount_paid, balance_due,
            notes, client_id, client_name, client_billing_snapshot
          `)
          .eq("org_id", effectiveOrgId),
      ]);

      if (clientInvoicesRes.error) throw clientInvoicesRes.error;
      if (billingDocsRes.error) throw billingDocsRes.error;

      const clientRows = (clientInvoicesRes.data || []).map((r: any) => ({
        ...r,
        _source: "client_invoices" as const,
      }));

      const billingRows = (billingDocsRes.data || []).map((d: any) => {
        const snapshot = d.client_billing_snapshot || null;
        const clientDisplay = snapshot || d.client_name
          ? {
              id: d.client_id || null,
              first_name: snapshot?.first_name || d.client_name || "",
              last_name: snapshot?.last_name || "",
              company: snapshot?.company || d.client_name || "",
            }
          : null;

        return {
          id: d.id,
          _source: "billing_documents" as const,
          org_id: d.org_id,
          invoice_number: d.doc_number,
          invoice_date: d.doc_date,
          due_date: d.due_date,
          document_type: d.doc_type,
          status: d.status || "draft",
          amount: Number(d.subtotal || 0),
          tax_amount: Number(d.total_tax || 0),
          currency: "INR",
          notes: d.notes,
          file_url: null,
          client_id: d.client_id,
          contact_id: null,
          external_entity_id: null,
          client: clientDisplay,
          contact: null,
          external_entity: null,
          tds_amount: 0,
          payment_received_date: null,
          actual_payment_received: null,
          amount_paid: Number(d.amount_paid || 0),
          balance_due: Number(d.balance_due || 0),
        };
      });

      const merged = [...clientRows, ...billingRows].sort((a, b) => {
        const da = a.invoice_date ? new Date(a.invoice_date).getTime() : 0;
        const db = b.invoice_date ? new Date(b.invoice_date).getTime() : 0;
        return db - da;
      });

      return merged;
    },
    enabled: !!effectiveOrgId,
  });

  // Filter invoices
  const filteredInvoices = invoices?.filter((inv) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      inv.invoice_number?.toLowerCase().includes(searchLower) ||
      inv.notes?.toLowerCase().includes(searchLower);
    
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    const matchesType = typeFilter === "all" || inv.document_type === typeFilter || (typeFilter === "proforma" && inv.document_type === "quotation");

    let matchesEntityType = true;
    if (entityTypeFilter === "client") matchesEntityType = !!inv.client_id;
    else if (entityTypeFilter === "contact") matchesEntityType = !!inv.contact_id;
    else if (entityTypeFilter === "external") matchesEntityType = !!inv.external_entity_id;
    else if (entityTypeFilter === "billing") matchesEntityType = inv._source === "billing_documents";
    
    return matchesSearch && matchesStatus && matchesType && matchesEntityType;
  });

  const getEntityInfo = (inv: any) => {
    if (inv.client) {
      return {
        type: "Client",
        name: `${inv.client.first_name} ${inv.client.last_name || ""}`.trim(),
        company: inv.client.company,
        icon: <Users className="h-3 w-3" />,
      };
    }
    if (inv.contact) {
      return {
        type: "Contact",
        name: `${inv.contact.first_name} ${inv.contact.last_name || ""}`.trim(),
        company: inv.contact.company,
        icon: <Contact className="h-3 w-3" />,
      };
    }
    if (inv.external_entity) {
      return {
        type: "External",
        name: inv.external_entity.name,
        company: inv.external_entity.company,
        icon: <Building2 className="h-3 w-3" />,
      };
    }
    return { type: "Unknown", name: "-", company: null, icon: null };
  };

  const formatCurrency = (value: number, curr: string = "INR") => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: curr,
    }).format(value);
  };

  const extractDataFromFile = async (uploadedFile: File) => {
    setIsExtracting(true);
    try {
      const fileExt = uploadedFile.name.split(".").pop();
      const tempFileName = `temp/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("client-documents")
        .upload(tempFileName, uploadedFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("client-documents")
        .getPublicUrl(tempFileName);

      const { data, error } = await supabase.functions.invoke("extract-document-data", {
        body: { fileUrl: urlData.publicUrl, documentType: "invoice" },
      });

      if (error) throw error;

      if (data?.success && data.extractedData) {
        const extracted = data.extractedData;
        if (extracted.invoice_number) setInvoiceNumber(extracted.invoice_number);
        if (extracted.invoice_date) setInvoiceDate(extracted.invoice_date);
        if (extracted.due_date) setDueDate(extracted.due_date);
        if (extracted.amount) setAmount(String(extracted.amount));
        if (extracted.tax_amount) setTaxAmount(String(extracted.tax_amount));
        if (extracted.currency) setCurrency(extracted.currency);
        if (extracted.notes) setNotes(extracted.notes);
        
        notify.success("Data extracted", "Please review the extracted values");
      }
    } catch (error) {
      console.error("Extraction error:", error);
      notify.error("Extraction failed", "Please fill in manually");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    if (selectedFile) {
      await extractDataFromFile(selectedFile);
    }
  };

  const addInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEntity || !effectiveOrgId) throw new Error("Please select an entity");
      
      setIsUploading(true);
      let fileUrl = null;

      if (file) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${selectedEntity.type}/${selectedEntity.id}/invoices/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("client-documents")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("client-documents")
          .getPublicUrl(fileName);

        fileUrl = urlData.publicUrl;
      }

      const insertData: any = {
        org_id: effectiveOrgId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        amount: parseFloat(amount) || 0,
        tax_amount: parseFloat(taxAmount) || 0,
        currency,
        status,
        notes: notes || null,
        file_url: fileUrl,
        document_type: documentType,
      };

      if (selectedEntity.type === "client") insertData.client_id = selectedEntity.id;
      else if (selectedEntity.type === "contact") insertData.contact_id = selectedEntity.id;
      else if (selectedEntity.type === "external") insertData.external_entity_id = selectedEntity.id;

      const { error } = await supabase.from("client_invoices").insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Added", `${documentType === "proforma" ? "Proforma Invoice" : "Invoice"} added successfully`);
      queryClient.invalidateQueries({ queryKey: ["all-invoices"] });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      notify.error("Error", error.message || "Failed to add");
    },
    onSettled: () => {
      setIsUploading(false);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ invoiceId, newStatus }: { invoiceId: string; newStatus: string }) => {
     const updateData: Record<string, unknown> = { status: newStatus };
     
     // Auto-set payment_received_date when marking as paid
     if (newStatus === "paid") {
       updateData.payment_received_date = new Date().toISOString().split('T')[0];
     }
     
     const { error } = await supabase
        .from("client_invoices")
       .update(updateData)
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Updated", "Status updated");
      queryClient.invalidateQueries({ queryKey: ["all-invoices"] });
    },
  });

  const updatePaymentDetailsMutation = useMutation({
    mutationFn: async ({ 
      invoiceId, 
      tds_amount, 
      payment_received_date, 
      actual_payment_received,
      net_received_amount 
    }: { 
      invoiceId: string; 
      tds_amount: number | null; 
      payment_received_date: string | null;
      actual_payment_received: number | null;
      net_received_amount: number;
    }) => {
      const { error } = await supabase
        .from("client_invoices")
        .update({ 
          tds_amount, 
          payment_received_date, 
          actual_payment_received,
          net_received_amount
        })
        .eq("id", invoiceId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Updated", "Payment details have been updated");
      queryClient.invalidateQueries({ queryKey: ["all-invoices"] });
      setEditingInvoiceId(null);
    },
    onError: () => {
      notify.error("Error", "Failed to update payment details");
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase.from("client_invoices").delete().eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Deleted", "Invoice removed");
      queryClient.invalidateQueries({ queryKey: ["all-invoices"] });
    },
  });

  const startEditing = (invoice: any) => {
    setEditingInvoiceId(invoice.id);
    setEditTdsAmount(String(invoice.tds_amount || ""));
    setEditPaymentDate(invoice.payment_received_date || "");
    setEditActualPayment(String(invoice.actual_payment_received || ""));
  };

  const cancelEditing = () => {
    setEditingInvoiceId(null);
    setEditTdsAmount("");
    setEditPaymentDate("");
    setEditActualPayment("");
  };

  const savePaymentDetails = (invoice: any) => {
    const gstAmount = invoice.tax_amount || 0;
    const tds = parseFloat(editTdsAmount) || 0;
    const netReceived = invoice.amount + gstAmount - tds;
    
    updatePaymentDetailsMutation.mutate({
      invoiceId: invoice.id,
      tds_amount: tds || null,
      payment_received_date: editPaymentDate || null,
      actual_payment_received: parseFloat(editActualPayment) || null,
      net_received_amount: netReceived
    });
  };

  const convertToInvoiceMutation = useMutation({
    mutationFn: async (proforma: any) => {
      const invoiceCount = invoices?.filter((inv) => inv.document_type === "invoice").length || 0;
      const newInvoiceNumber = `INV-${String(invoiceCount + 1).padStart(3, "0")}`;

      const insertData: any = {
        org_id: effectiveOrgId,
        invoice_number: newInvoiceNumber,
        invoice_date: new Date().toISOString().split("T")[0],
        due_date: proforma.due_date,
        amount: proforma.amount,
        tax_amount: proforma.tax_amount,
        currency: proforma.currency,
        status: "draft",
        notes: `Converted from ${proforma.invoice_number}`,
        file_url: proforma.file_url,
        document_type: "invoice",
        converted_from_quotation_id: proforma.id,
        client_id: proforma.client_id,
        contact_id: proforma.contact_id,
        external_entity_id: proforma.external_entity_id,
      };

      const { error } = await supabase.from("client_invoices").insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Converted", "Proforma Invoice converted to invoice");
      queryClient.invalidateQueries({ queryKey: ["all-invoices"] });
    },
  });

  const resetForm = () => {
    setSelectedEntity(null);
    setDocumentType("invoice");
    setInvoiceNumber("");
    setInvoiceDate("");
    setDueDate("");
    setAmount("");
    setTaxAmount("");
    setCurrency("INR");
    setStatus("draft");
    setNotes("");
    setFile(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber || !invoiceDate || !amount) {
      notify.error("Error", "Please fill in all required fields");
      return;
    }
    if (!selectedEntity) {
      notify.error("Error", "Please select an entity");
      return;
    }
    addInvoiceMutation.mutate();
  };

  return (
    <div className="space-y-4">
      {/* Revenue Analytics */}
      <RevenueAnalytics invoices={invoices || []} />


      {/* Filters and Actions */}
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="proforma">Proforma Invoice</SelectItem>
              <SelectItem value="credit_note">Credit Note</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {invoiceStatuses.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="client">Clients</SelectItem>
              <SelectItem value="contact">Contacts</SelectItem>
              <SelectItem value="external">External</SelectItem>
              <SelectItem value="billing">Billing System</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsSmartUploadOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Smart Upload
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Invoice
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New {documentType === "proforma" ? "Proforma Invoice" : "Invoice"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Document Type Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Document Type</Label>
                  <p className="text-xs text-muted-foreground">
                    {documentType === "proforma" ? "Pre-revenue, no tax liability" : "Revenue with tax liability"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${documentType === "invoice" ? "font-medium" : "text-muted-foreground"}`}>Invoice</span>
                  <Switch
                    checked={documentType === "proforma"}
                    onCheckedChange={(checked) => setDocumentType(checked ? "proforma" : "invoice")}
                  />
                  <span className={`text-xs ${documentType === "proforma" ? "font-medium" : "text-muted-foreground"}`}>Proforma</span>
                </div>
              </div>

              <EntitySelector
                value={selectedEntity}
                onChange={setSelectedEntity}
                showCreateExternal
              />

              <div className="space-y-2">
                <Label>Upload Document</Label>
                <Input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  disabled={isExtracting}
                />
                {isExtracting && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Extracting data...</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{documentType === "proforma" ? "Proforma" : "Invoice"} Number *</Label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder={documentType === "proforma" ? "PI-001" : "INV-001"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {invoiceStatuses.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tax Amount</Label>
                  <Input
                    type="number"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes..."
                />
              </div>

              <Button type="submit" className="w-full" disabled={isUploading}>
                {isUploading ? "Saving..." : `Add ${documentType === "proforma" ? "Proforma Invoice" : "Invoice"}`}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>

        <SmartInvoiceUploadDialog 
          open={isSmartUploadOpen} 
          onOpenChange={setIsSmartUploadOpen} 
        />
      </div>

      {/* Invoices Table */}
      {isLoading ? (
        <LoadingState message="Loading invoices..." />
      ) : !filteredInvoices?.length ? (
        <EmptyState
          icon={<Receipt className="h-12 w-12" />}
          title="No invoices found"
          message="Add invoices and proforma invoices to track your revenue"
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Amount</TableHead>
                 <TableHead className="text-right">TDS</TableHead>
                 <TableHead>Payment Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((inv) => {
                  const entityInfo = getEntityInfo(inv);
                  const statusInfo = invoiceStatuses.find((s) => s.value === inv.status);
                  const total = (inv.amount || 0) + (inv.tax_amount || 0);
                  const isProforma = inv.document_type === "quotation" || inv.document_type === "proforma";
                  const isCreditNote = inv.document_type === "credit_note";
                  const isBilling = inv._source === "billing_documents";
                  const isEditing = editingInvoiceId === inv.id;
                  const tdsDeducted = inv.tds_amount || 0;

                  return (
                    <TableRow
                      key={`${inv._source || "client_invoices"}_${inv.id}`}
                     className={inv.file_url && !isEditing ? "cursor-pointer hover:bg-muted/50" : ""}
                     onClick={() => !isEditing && inv.file_url && setViewingFile(inv.file_url)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{inv.invoice_number}</span>
                          {isBilling && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">Billing</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isCreditNote ? "destructive" : isProforma ? "secondary" : "default"}>
                          {isCreditNote ? "Credit Note" : isProforma ? "Proforma" : "Invoice"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="flex items-center gap-1">
                            {entityInfo.icon}
                            {entityInfo.type}
                          </Badge>
                          <span className="text-sm">{entityInfo.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(total, inv.currency)}</TableCell>
                     {/* TDS - Editable */}
                     <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                       {isEditing ? (
                         <Input
                           type="number"
                           value={editTdsAmount}
                           onChange={(e) => setEditTdsAmount(e.target.value)}
                           className="w-24 h-8 text-right text-sm"
                           placeholder="0.00"
                         />
                       ) : (
                         <span className="text-orange-600">{formatCurrency(tdsDeducted, inv.currency)}</span>
                       )}
                     </TableCell>
                     {/* Payment Date - Editable */}
                     <TableCell onClick={(e) => e.stopPropagation()}>
                       {isEditing ? (
                         <Input
                           type="date"
                           value={editPaymentDate}
                           onChange={(e) => setEditPaymentDate(e.target.value)}
                           className="w-32 h-8 text-sm"
                         />
                       ) : (
                         inv.payment_received_date ? format(new Date(inv.payment_received_date), "MMM d, yyyy") : "-"
                       )}
                     </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isBilling ? (
                          <Badge variant={statusInfo?.variant ?? "outline"}>
                            {statusInfo?.label ?? inv.status}
                          </Badge>
                        ) : (
                          <Select
                            value={inv.status}
                            onValueChange={(newStatus) => updateStatusMutation.mutate({ invoiceId: inv.id, newStatus })}
                          >
                            <SelectTrigger className="w-[100px] h-7">
                              <Badge variant={statusInfo?.variant}>{statusInfo?.label}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {invoiceStatuses.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>{format(new Date(inv.invoice_date), "MMM d, yyyy")}</TableCell>
                      <TableCell>{inv.due_date ? format(new Date(inv.due_date), "MMM d, yyyy") : "-"}</TableCell>
                      <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                       {/* Edit button */}
                      {!isBilling && !isEditing && inv.status === "paid" && (
                         <Button
                           variant="ghost"
                           size="icon"
                           onClick={() => startEditing(inv)}
                           title="Edit TDS & Payment Details"
                         >
                           <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                         </Button>
                       )}
                       {/* Save/Cancel when editing */}
                       {isEditing && (
                         <>
                           <Button
                             variant="ghost"
                             size="icon"
                             onClick={() => savePaymentDetails(inv)}
                             title="Save"
                           >
                             <Check className="h-4 w-4 text-green-600" />
                           </Button>
                           <Button
                             variant="ghost"
                             size="icon"
                             onClick={cancelEditing}
                             title="Cancel"
                           >
                             <X className="h-4 w-4 text-destructive" />
                           </Button>
                         </>
                       )}
                        {!isBilling && isProforma && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => convertToInvoiceMutation.mutate(inv)}
                            title="Convert to Invoice"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        )}
                        {inv.file_url && (
                          <Button variant="ghost" size="icon" asChild title="Download">
                            <a href={inv.file_url} download target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {!isBilling && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteInvoiceMutation.mutate(inv.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Document Viewer Dialog */}
      <Dialog open={!!viewingFile} onOpenChange={(open) => !open && setViewingFile(null)}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Document Viewer</DialogTitle>
          </DialogHeader>
          {viewingFile && <DocumentPreview fileUrl={viewingFile} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
