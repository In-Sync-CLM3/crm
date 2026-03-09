import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Plus, Trash2, FileText, Mail } from "lucide-react";
import { calculateLineItem, calculateDocumentTotals, formatCurrencyINR, numberToWords, detectSupplyType, getCurrentFinancialYear } from "@/utils/billingUtils";
import { DOC_TYPE_LABELS } from "@/types/billing";
import type { BillingDocument, BillingDocumentItem, BillingDocumentType, BillingClient, BillingSettings, SupplyType } from "@/types/billing";

interface BillingCreateDocumentProps {
  docType: BillingDocumentType;
  clients: BillingClient[];
  settings: BillingSettings;
  getNextDocNumber: (docType: BillingDocumentType) => string;
  onSave: (doc: BillingDocument) => void;
  onBack: () => void;
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

export function BillingCreateDocument({ docType, clients, settings, getNextDocNumber, onSave, onBack }: BillingCreateDocumentProps) {
  const [form, setForm] = useState({
    doc_number: getNextDocNumber(docType),
    client_id: "",
    doc_date: new Date().toISOString().split("T")[0],
    due_date: "",
    notes: settings.default_terms || "",
  });

  const [items, setItems] = useState<RawItem[]>([
    { description: "", hsn_sac: settings.default_hsn || "998314", qty: 1, unit: "Nos", rate: 0, discount: 0, tax_rate: settings.default_tax_rate || 18 },
  ]);

  const selectedClient = clients.find(c => c.id === form.client_id);
  const supplyType: SupplyType = useMemo(() => {
    if (!selectedClient) return "inter_state";
    return detectSupplyType(settings.company_state_code, selectedClient.billing_state_code || "");
  }, [selectedClient, settings.company_state_code]);

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

  const handleSave = (status: "draft" | "sent") => {
    const newDoc: BillingDocument = {
      id: `d${Date.now()}`,
      org_id: settings.org_id || "",
      doc_type: docType,
      doc_number: form.doc_number,
      client_id: form.client_id,
      client_name: selectedClient?.company || `${selectedClient?.first_name || ""} ${selectedClient?.last_name || ""}`.trim() || "",
      client: selectedClient ? {
        company: selectedClient.company,
        first_name: selectedClient.first_name,
        last_name: selectedClient.last_name || "",
        gstin: selectedClient.gstin,
        pan: selectedClient.pan,
        billing_state_code: selectedClient.billing_state_code,
        billing_address: selectedClient.billing_address,
        state: selectedClient.state,
        city: selectedClient.city,
        pin_code: selectedClient.pin_code,
      } : undefined,
      doc_date: form.doc_date,
      due_date: form.due_date,
      financial_year: getCurrentFinancialYear(),
      supply_type: supplyType,
      subtotal: totals.subtotal,
      total_tax: totals.totalTax,
      total_amount: totals.grandTotal,
      amount_paid: 0,
      balance_due: totals.grandTotal,
      status,
      notes: form.notes,
      terms_and_conditions: form.notes,
      items: calcItems,
      created_at: new Date().toISOString(),
    };
    onSave(newDoc);
    onBack();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="h-5 w-5" /></Button>
        <h2 className="text-2xl font-bold">Create {DOC_TYPE_LABELS[docType]}</h2>
      </div>

      {/* Document Details */}
      <Card className="p-6">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Document Details</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label>Document Number</Label>
            <Input value={form.doc_number} onChange={e => setForm({ ...form, doc_number: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Date <span className="text-red-500">*</span></Label>
            <Input type="date" value={form.doc_date} onChange={e => setForm({ ...form, doc_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{docType === "quotation" ? "Valid Until" : "Due Date"}</Label>
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
          <div className="mt-4 p-3 bg-muted/50 rounded-lg grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Address</p>
              <p className="text-xs mt-0.5">{selectedClient.billing_address || selectedClient.state}{selectedClient.city ? `, ${selectedClient.city}` : ""}{selectedClient.pin_code ? ` - ${selectedClient.pin_code}` : ""}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">GSTIN</p>
              <p className="text-xs font-mono mt-0.5">{selectedClient.gstin || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Supply Type</p>
              <Badge variant="secondary" className={supplyType === "intra_state" ? "bg-emerald-100 text-emerald-700 mt-0.5" : "bg-blue-100 text-blue-700 mt-0.5"}>
                {supplyType === "intra_state" ? "Intra-State (CGST+SGST)" : "Inter-State (IGST)"}
              </Badge>
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
          </div>
        </div>
      </Card>

      {/* Terms */}
      <Card className="p-6">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Terms & Conditions</h3>
        <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button variant="outline" onClick={() => handleSave("draft")}><FileText className="h-4 w-4 mr-1" />Save as Draft</Button>
        <Button onClick={() => handleSave("sent")}><Mail className="h-4 w-4 mr-1" />Save & Send</Button>
      </div>
    </div>
  );
}
