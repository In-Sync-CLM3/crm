import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, FileText, Edit } from "lucide-react";
import { INDIAN_STATES } from "@/types/billing";
import type { BillingSettings as BillingSettingsType } from "@/types/billing";
import { toast } from "sonner";

interface BillingSettingsProps {
  settings: BillingSettingsType;
  onSave: (settings: BillingSettingsType) => void;
}

export function BillingSettingsPanel({ settings: initial, onSave }: BillingSettingsProps) {
  const [s, setS] = useState<BillingSettingsType>({ ...initial });

  const u = (k: keyof BillingSettingsType, v: string | number) => {
    const next = { ...s, [k]: v };
    if (k === "company_state") {
      const st = INDIAN_STATES.find(state => state.name === v);
      if (st) next.company_state_code = st.code;
    }
    setS(next);
  };

  const handleSave = () => {
    onSave(s);
    toast.success("Settings saved successfully");
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Billing Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Company & invoice configuration</p>
      </div>

      {/* Company Details */}
      <Card className="p-6">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Company Details</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5"><Label>Company Name</Label><Input value={s.company_name} onChange={e => u("company_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>GSTIN</Label><Input value={s.company_gstin} onChange={e => u("company_gstin", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>PAN</Label><Input value={s.company_pan} onChange={e => u("company_pan", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={s.company_email} onChange={e => u("company_email", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={s.company_phone} onChange={e => u("company_phone", e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Select value={s.company_state} onValueChange={v => u("company_state", v)}>
              <SelectTrigger><SelectValue placeholder="Select State" /></SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map(st => <SelectItem key={st.code} value={st.name}>{st.code} - {st.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-3 space-y-1.5"><Label>Address</Label><Input value={s.company_address} onChange={e => u("company_address", e.target.value)} /></div>
        </div>
      </Card>

      {/* Bank Details */}
      <Card className="p-6">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Bank Details</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5"><Label>Bank Name</Label><Input value={s.bank_name} onChange={e => u("bank_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Account Number</Label><Input value={s.bank_account_number} onChange={e => u("bank_account_number", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>IFSC Code</Label><Input value={s.bank_ifsc} onChange={e => u("bank_ifsc", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Branch</Label><Input value={s.bank_branch} onChange={e => u("bank_branch", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>UPI ID</Label><Input value={s.bank_upi_id} onChange={e => u("bank_upi_id", e.target.value)} /></div>
        </div>
      </Card>

      {/* Branding */}
      <Card className="p-6">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Branding</h3>
        <div className="grid grid-cols-2 gap-6">
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-muted/30 transition-all">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3"><FileText className="h-5 w-5 text-primary" /></div>
            <p className="text-sm font-semibold">Upload Company Logo</p>
            <p className="text-xs text-muted-foreground mt-1">PNG or JPG, max 2MB</p>
          </div>
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-muted/30 transition-all">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3"><Edit className="h-5 w-5 text-primary" /></div>
            <p className="text-sm font-semibold">Upload Signature</p>
            <p className="text-xs text-muted-foreground mt-1">Authorized signatory image</p>
          </div>
        </div>
      </Card>

      {/* Invoice Defaults */}
      <Card className="p-6">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Invoice Defaults</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Default Tax Rate</Label>
            <Select value={String(s.default_tax_rate)} onValueChange={v => u("default_tax_rate", parseInt(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[0, 5, 12, 18, 28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Payment Terms (Days)</Label><Input type="number" value={s.default_due_days} onChange={e => u("default_due_days", parseInt(e.target.value) || 30)} /></div>
          <div className="space-y-1.5"><Label>Default HSN/SAC</Label><Input value={s.default_hsn} onChange={e => u("default_hsn", e.target.value)} /></div>
          <div className="col-span-3 space-y-1.5">
            <Label>Default Terms & Conditions</Label>
            <Textarea value={s.default_terms} onChange={e => u("default_terms", e.target.value)} rows={3} />
          </div>
        </div>
      </Card>

      {/* Number Sequences */}
      <Card className="p-6">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Number Sequences</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="space-y-1.5"><Label>Invoice Prefix</Label><Input value={s.invoice_prefix} onChange={e => u("invoice_prefix", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Quotation Prefix</Label><Input value={s.quotation_prefix} onChange={e => u("quotation_prefix", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Proforma Prefix</Label><Input value={s.proforma_prefix} onChange={e => u("proforma_prefix", e.target.value)} /></div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document Type</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Next Number</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { type: "Tax Invoice", prefix: s.invoice_prefix, next: s.next_invoice_number },
              { type: "Quotation", prefix: s.quotation_prefix, next: s.next_quotation_number },
              { type: "Proforma Invoice", prefix: s.proforma_prefix, next: s.next_proforma_number },
            ].map(row => (
              <TableRow key={row.type}>
                <TableCell className="font-medium">{row.type}</TableCell>
                <TableCell className="font-mono text-primary">{row.prefix}</TableCell>
                <TableCell className="font-semibold">{row.prefix}-XXXX-{String(row.next).padStart(4, "0")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-end pb-8">
        <Button size="lg" onClick={handleSave}><Check className="h-4 w-4 mr-1" />Save Settings</Button>
      </div>
    </div>
  );
}
