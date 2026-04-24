import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Plus, Trash2, FileText, Mail, Save } from "lucide-react";
import { toast } from "sonner";
import { calculateLineItem, calculateDocumentTotals, formatCurrencyINR, numberToWords, detectSupplyType, getCurrentFinancialYear } from "@/utils/billingUtils";
import { DOC_TYPE_LABELS, INDIAN_STATES } from "@/types/billing";
import type { BillingDocument, BillingDocumentItem, BillingDocumentType, BillingClient, BillingSettings, SupplyType } from "@/types/billing";
import { useBillingClientCache } from "@/hooks/useBillingClientCache";

interface BillingCreateDocumentProps {
  docType: BillingDocumentType;
  clients: BillingClient[];
  settings: BillingSettings;
  getNextDocNumber: (docType: BillingDocumentType) => string;
  onSave: (doc: BillingDocument) => Promise<{ success: boolean; error?: string; id?: string }> | void;
  onBack: () => void;
  editDoc?: BillingDocument;
  onUpdateSettings?: (settings: BillingSettings) => void;
  onRecordAdvance?: (payload: { document_id: string; amount: number; payment_date: string; reference_number?: string; notes?: string; org_id: string }) => Promise<void> | void;
  existingAdvanceTotal?: number;
  advanceHasPaymentRecord?: boolean;
}

interface RawItem {
  description: string;
  hsn_sac: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number;
  tax_rate: number;
}

function getDefaultTerms(settings: BillingSettings, docType: BillingDocumentType): string {
  if (docType === "proforma" && settings.default_proforma_terms) return settings.default_proforma_terms;
  if (docType === "credit_note" && settings.default_credit_note_terms) return settings.default_credit_note_terms;
  return settings.default_terms || "";
}

export function BillingCreateDocument({ docType, clients, settings, getNextDocNumber, onSave, onBack, editDoc, onUpdateSettings, onRecordAdvance, existingAdvanceTotal = 0, advanceHasPaymentRecord = false }: BillingCreateDocumentProps) {
  const { getClientBillingDetails, saveClientBillingDetails } = useBillingClientCache();
  const isEdit = !!editDoc;
  // Lock the advance field only when a payment record backs it (edits there
  // must go through the payment workflow). When the advance only lives on
  // doc.amount_paid (legacy / no record yet), keep it editable so the user
  // can correct the amount.
  const advanceLocked = isEdit && existingAdvanceTotal > 0 && advanceHasPaymentRecord;
  // True when the form's advance value should REPLACE doc.amount_paid on save
  // (rather than be added to it) — the legacy proforma case.
  const advanceReplacesAmountPaid = isEdit && existingAdvanceTotal > 0 && !advanceHasPaymentRecord;

  const [form, setForm] = useState({
    doc_number: editDoc?.doc_number || getNextDocNumber(docType),
    client_id: editDoc?.client_id || "",
    doc_date: editDoc?.doc_date || new Date().toISOString().split("T")[0],
    due_date: editDoc?.due_date || "",
    notes: editDoc?.notes || getDefaultTerms(settings, docType),
    advance_amount: existingAdvanceTotal > 0 ? String(existingAdvanceTotal) : "",
    advance_date: new Date().toISOString().split("T")[0],
    advance_reference: "",
  });

  const [items, setItems] = useState<RawItem[]>(
    editDoc?.items?.length
      ? editDoc.items.map(item => ({
          description: item.description,
          hsn_sac: item.hsn_sac,
          qty: item.qty,
          unit: item.unit,
          rate: item.rate,
          discount: item.discount,
          tax_rate: item.tax_rate,
        }))
      : [{ description: "", hsn_sac: settings.default_hsn || "998314", qty: 1, unit: "Nos", rate: 0, discount: 0, tax_rate: settings.default_tax_rate || 18 }],
  );

  // Editable billing details for the selected client
  const [billingDetails, setBillingDetails] = useState({
    invoice_company_name: editDoc?.client?.invoice_company_name || "",
    gstin: editDoc?.client?.gstin || "",
    pan: editDoc?.client?.pan || "",
    billing_address: editDoc?.client?.billing_address || "",
    city: editDoc?.client?.city || "",
    state: editDoc?.client?.state || "",
    state_code: editDoc?.client?.billing_state_code || "",
    pin_code: editDoc?.client?.pin_code || "",
  });

  const selectedClient = clients.find(c => c.id === form.client_id);

  // Pre-fill billing details when client changes:
  // 1. First check saved billing cache (previously entered details)
  // 2. Fall back to CRM client data
  useEffect(() => {
    if (selectedClient) {
      const cached = getClientBillingDetails(selectedClient.id);
      if (cached) {
        // Use previously saved billing details
        setBillingDetails(cached);
      } else {
        // Fall back to CRM client data
        const stateCode = selectedClient.billing_state_code ||
          INDIAN_STATES.find(s => s.name === selectedClient.state)?.code || "";
        setBillingDetails({
          invoice_company_name: "",
          gstin: selectedClient.gstin || "",
          pan: selectedClient.pan || "",
          billing_address: selectedClient.billing_address || "",
          city: selectedClient.city || "",
          state: selectedClient.state || "",
          state_code: stateCode,
          pin_code: selectedClient.pin_code || "",
        });
      }
    } else {
      setBillingDetails({ invoice_company_name: "", gstin: "", pan: "", billing_address: "", city: "", state: "", state_code: "", pin_code: "" });
    }
  }, [selectedClient, getClientBillingDetails]);

  const updateBillingField = (key: keyof typeof billingDetails, value: string) => {
    const next = { ...billingDetails, [key]: value };
    if (key === "state") {
      const st = INDIAN_STATES.find(s => s.name === value);
      if (st) next.state_code = st.code;
    }
    if (key === "gstin" && value.length >= 12) {
      next.pan = value.substring(2, 12);
    }
    setBillingDetails(next);
  };

  const supplyType: SupplyType = useMemo(() => {
    if (!billingDetails.state_code) return "inter_state";
    return detectSupplyType(settings.company_state_code, billingDetails.state_code);
  }, [billingDetails.state_code, settings.company_state_code]);

  const calcItems: BillingDocumentItem[] = useMemo(() => {
    return items.map((item, i) => {
      const calc = calculateLineItem(item.qty, item.rate, item.discount, item.tax_rate, supplyType);
      return { ...item, ...calc, sort_order: i };
    });
  }, [items, supplyType]);

  const totals = useMemo(() => calculateDocumentTotals(calcItems), [calcItems]);

  const updateItem = (idx: number, field: keyof RawItem, value: string | number) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    setItems(next);
  };

  const addItem = () => setItems([...items, { description: "", hsn_sac: settings.default_hsn || "998314", qty: 1, unit: "Nos", rate: 0, discount: 0, tax_rate: settings.default_tax_rate || 18 }]);
  const removeItem = (idx: number) => items.length > 1 && setItems(items.filter((_, i) => i !== idx));

  const [saving, setSaving] = useState(false);

  const handleSave = async (status: "draft" | "sent") => {
    if (saving) return;
    const advanceAmount = advanceLocked ? 0 : Math.max(0, parseFloat(form.advance_amount) || 0);
    const amountPaidWithAdvance = advanceReplacesAmountPaid
      ? advanceAmount
      : (editDoc?.amount_paid || 0) + advanceAmount;
    const derivedStatus: BillingDocument["status"] = editDoc
      ? (status === "sent" ? status : editDoc.status)
      : (advanceAmount > 0 && advanceAmount >= totals.grandTotal
          ? "paid"
          : advanceAmount > 0
            ? "partially_paid"
            : status);
    const newDoc: BillingDocument = {
      id: editDoc?.id || `d${Date.now()}`,
      org_id: settings.org_id || "",
      doc_type: docType,
      doc_number: form.doc_number,
      client_id: form.client_id,
      client_name: billingDetails.invoice_company_name || selectedClient?.company || `${selectedClient?.first_name || ""} ${selectedClient?.last_name || ""}`.trim() || "",
      client: selectedClient ? {
        company: selectedClient.company,
        first_name: selectedClient.first_name,
        last_name: selectedClient.last_name || "",
        invoice_company_name: billingDetails.invoice_company_name || undefined,
        gstin: billingDetails.gstin,
        pan: billingDetails.pan,
        billing_state_code: billingDetails.state_code,
        billing_address: billingDetails.billing_address,
        state: billingDetails.state,
        city: billingDetails.city,
        pin_code: billingDetails.pin_code,
      } : undefined,
      doc_date: form.doc_date,
      due_date: form.due_date,
      financial_year: editDoc?.financial_year || getCurrentFinancialYear(),
      supply_type: supplyType,
      subtotal: totals.subtotal,
      total_tax: totals.totalTax,
      total_amount: totals.grandTotal,
      amount_paid: amountPaidWithAdvance,
      balance_due: Math.max(0, totals.grandTotal - amountPaidWithAdvance),
      status: derivedStatus,
      notes: form.notes,
      terms_and_conditions: form.notes,
      original_invoice_id: editDoc?.original_invoice_id,
      original_invoice_number: editDoc?.original_invoice_number,
      items: calcItems,
      created_at: editDoc?.created_at || new Date().toISOString(),
    };
    // Save billing details for this client for future use
    if (form.client_id) {
      saveClientBillingDetails(form.client_id, billingDetails);
    }

    setSaving(true);
    try {
      const result = await onSave(newDoc);
      if (result && !result.success) {
        toast.error(result.error || "Failed to save document");
        return;
      }
      // Persist advance as a payment record whenever one doesn't already exist
      // for this doc (new doc, or edit of a legacy proforma that stored the
      // advance only on amount_paid).
      const newId = result && "id" in result ? result.id : undefined;
      const docId = newId || editDoc?.id;
      if (advanceAmount > 0 && docId && onRecordAdvance && !advanceHasPaymentRecord) {
        await onRecordAdvance({
          document_id: docId,
          amount: advanceAmount,
          payment_date: form.advance_date,
          reference_number: form.advance_reference || undefined,
          notes: "Advance received earlier",
          org_id: settings.org_id || "",
        });
      }
      onBack();
    } catch {
      toast.error("Failed to save document");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="h-5 w-5" /></Button>
        <h2 className="text-2xl font-bold">{isEdit ? "Edit" : "Create"} {DOC_TYPE_LABELS[docType]}</h2>
      </div>

      {/* Document Details */}
      <Card className="p-6">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Document Details</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label>Document Number</Label>
            <Input value={form.doc_number} onChange={e => setForm({ ...form, doc_number: e.target.value })} />
          </div>
          {editDoc?.original_invoice_number && (
            <div className="space-y-1.5">
              <Label>Against Invoice</Label>
              <Input value={editDoc.original_invoice_number} disabled className="text-red-600 font-semibold" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Date <span className="text-red-500">*</span></Label>
            <Input type="date" value={form.doc_date} onChange={e => setForm({ ...form, doc_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Client <span className="text-red-500">*</span></Label>
            <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select Client" /></SelectTrigger>
              <SelectContent>
                {clients.filter(c => c.status === "active" || !c.status).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.company || `${c.first_name} ${c.last_name || ""}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedClient && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Bill To — Billing Details</h4>
              <Badge variant="secondary" className={supplyType === "intra_state" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}>
                {supplyType === "intra_state" ? "Intra-State (CGST+SGST)" : "Inter-State (IGST)"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-2 space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">Invoice Company Name <span className="text-muted-foreground">(if different from CRM)</span></Label>
                <Input
                  value={billingDetails.invoice_company_name}
                  onChange={e => updateBillingField("invoice_company_name", e.target.value)}
                  placeholder={selectedClient?.company || "Leave blank to use CRM company name"}
                  className="h-8 text-xs"
                />
              </div>
              <div className="lg:col-span-2" />
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">GSTIN <span className="text-red-500">*</span></Label>
                <Input
                  value={billingDetails.gstin}
                  onChange={e => updateBillingField("gstin", e.target.value)}
                  placeholder="e.g., 27AABCC1234D1Z5"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">PAN</Label>
                <Input
                  value={billingDetails.pan}
                  onChange={e => updateBillingField("pan", e.target.value)}
                  className="h-8 text-xs font-mono"
                  disabled={billingDetails.gstin.length >= 12}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">State <span className="text-red-500">*</span></Label>
                <Select value={billingDetails.state} onValueChange={v => updateBillingField("state", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select State" /></SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map(s => (
                      <SelectItem key={s.code} value={s.name}>{s.code} - {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">State Code</Label>
                <Input value={billingDetails.state_code} className="h-8 text-xs" disabled />
              </div>
              <div className="lg:col-span-2 space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">Billing Address <span className="text-red-500">*</span></Label>
                <Input
                  value={billingDetails.billing_address}
                  onChange={e => updateBillingField("billing_address", e.target.value)}
                  placeholder="Street address, building, area"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">City</Label>
                <Input
                  value={billingDetails.city}
                  onChange={e => updateBillingField("city", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">PIN Code</Label>
                <Input
                  value={billingDetails.pin_code}
                  onChange={e => updateBillingField("pin_code", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Line Items */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Line Items</h3>
          <Button variant="ghost" size="sm" onClick={addItem}><Plus className="h-4 w-4 mr-1" />Add Item</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 rounded-lg">
                {["#", "Description", "HSN/SAC", "Qty", "Unit", "Rate (₹)", "Disc%", "Taxable", "Tax%", "Tax", "Total", ""].map(h => (
                  <th key={h} className="px-2 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calcItems.map((item, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2">
                    <Input value={item.description} onChange={e => updateItem(i, "description", e.target.value)} className="h-8 text-xs" placeholder="Service/Product name" />
                  </td>
                  <td className="px-2 py-2">
                    <Input value={item.hsn_sac} onChange={e => updateItem(i, "hsn_sac", e.target.value)} className="h-8 text-xs w-20" />
                  </td>
                  <td className="px-2 py-2">
                    <Input type="number" value={item.qty} onChange={e => updateItem(i, "qty", parseFloat(e.target.value) || 0)} className="h-8 text-xs w-16 text-right" />
                  </td>
                  <td className="px-2 py-2">
                    <select value={item.unit} onChange={e => updateItem(i, "unit", e.target.value)} className="h-8 px-1 text-xs border rounded w-20">
                      {["Nos", "Months", "Users", "Licenses", "Hours"].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <Input type="number" value={item.rate} onChange={e => updateItem(i, "rate", parseFloat(e.target.value) || 0)} className="h-8 text-xs w-24 text-right" />
                  </td>
                  <td className="px-2 py-2">
                    <Input type="number" value={item.discount} onChange={e => updateItem(i, "discount", parseFloat(e.target.value) || 0)} className="h-8 text-xs w-16 text-right" />
                  </td>
                  <td className="px-2 py-2 text-xs font-medium text-right">{formatCurrencyINR(item.taxable)}</td>
                  <td className="px-2 py-2">
                    <select value={item.tax_rate} onChange={e => updateItem(i, "tax_rate", parseFloat(e.target.value))} className="h-8 px-1 text-xs border rounded w-16">
                      {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-xs text-right">{formatCurrencyINR(item.cgst + item.sgst + item.igst)}</td>
                  <td className="px-2 py-2 text-xs font-bold text-right">{formatCurrencyINR(item.total)}</td>
                  <td className="px-2 py-2">
                    <Button variant="ghost" size="icon" onClick={() => removeItem(i)} className="h-7 w-7 text-red-400 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="flex justify-end mt-6">
          <div className="w-80 bg-muted/50 rounded-xl p-5 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{formatCurrencyINR(totals.subtotal)}</span></div>
            {supplyType === "intra_state" ? (
              <>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">CGST</span><span>{formatCurrencyINR(totals.totalCgst)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">SGST</span><span>{formatCurrencyINR(totals.totalSgst)}</span></div>
              </>
            ) : (
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">IGST</span><span>{formatCurrencyINR(totals.totalIgst)}</span></div>
            )}
            <div className="h-px bg-border" />
            <div className="flex justify-between text-lg font-bold text-primary"><span>Grand Total</span><span>{formatCurrencyINR(totals.grandTotal)}</span></div>
            {totals.grandTotal > 0 && <p className="text-[10px] text-muted-foreground pt-1">{numberToWords(totals.grandTotal)}</p>}

            {/* Advance adjustment (for invoices & proformas only) */}
            {docType !== "credit_note" && (
              <>
                <div className="h-px bg-border mt-2" />
                <div className="space-y-1.5 pt-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Advance Received Earlier {advanceLocked && <span className="text-[10px] font-normal">(locked — already recorded)</span>}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={form.advance_amount}
                      disabled={advanceLocked}
                      onChange={e => setForm({ ...form, advance_amount: e.target.value })}
                    />
                    <Input
                      type="date"
                      value={form.advance_date}
                      disabled={advanceLocked}
                      onChange={e => setForm({ ...form, advance_date: e.target.value })}
                    />
                  </div>
                  <Input
                    placeholder="Reference (UTR / Txn ID — optional)"
                    value={form.advance_reference}
                    disabled={advanceLocked}
                    onChange={e => setForm({ ...form, advance_reference: e.target.value })}
                  />
                </div>
                {(() => {
                  const adv = Math.max(0, parseFloat(form.advance_amount) || 0);
                  if (adv <= 0) return null;
                  const net = Math.max(0, totals.grandTotal - adv);
                  return (
                    <>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Less: Advance Adjusted</span><span className="text-emerald-600">-{formatCurrencyINR(adv)}</span></div>
                      <div className="flex justify-between text-base font-bold text-emerald-700"><span>Net Payable</span><span>{formatCurrencyINR(net)}</span></div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Terms */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Terms & Conditions</h3>
          {onUpdateSettings && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1.5"
              onClick={() => {
                const key = docType === "proforma" ? "default_proforma_terms"
                  : docType === "credit_note" ? "default_credit_note_terms"
                  : "default_terms";
                onUpdateSettings({ ...settings, [key]: form.notes });
                toast.success(`Default terms saved for all ${DOC_TYPE_LABELS[docType]}s`);
              }}
            >
              <Save className="h-3.5 w-3.5 shrink-0" />
              <span>Save as default for all {DOC_TYPE_LABELS[docType]}s</span>
            </Button>
          )}
        </div>
        <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <Button variant="outline" onClick={onBack} disabled={saving}>Cancel</Button>
        <Button variant="outline" className="inline-flex items-center gap-1.5" onClick={() => handleSave("draft")} disabled={saving}><FileText className="h-4 w-4 shrink-0" />{saving ? "Saving..." : isEdit ? "Update" : "Save as Draft"}</Button>
        <Button className="inline-flex items-center gap-1.5" onClick={() => handleSave("sent")} disabled={saving}><Mail className="h-4 w-4 shrink-0" />{saving ? "Saving..." : isEdit ? "Update & Send" : "Save & Send"}</Button>
      </div>
    </div>
  );
}
