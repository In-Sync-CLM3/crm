import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check } from "lucide-react";
import { formatCurrencyINR } from "@/utils/billingUtils";
import type { BillingDocument } from "@/types/billing";

interface RecordPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  doc: BillingDocument;
  onRecordPayment: (payment: { document_id: string; amount: number; tds_amount: number; payment_date: string; payment_mode: string; reference_number: string; notes: string; org_id: string }) => void;
}

export function RecordPaymentDialog({ open, onClose, doc, onRecordPayment }: RecordPaymentDialogProps) {
  const [form, setForm] = useState({
    payment_date: new Date().toISOString().split("T")[0],
    amount: String(doc.balance_due),
    tds_amount: "0",
    payment_mode: "bank_transfer",
    reference_number: "",
    notes: "",
  });

  const amountReceived = parseFloat(form.amount) || 0;
  const tdsAmount = parseFloat(form.tds_amount) || 0;
  const totalSettled = amountReceived + tdsAmount;

  const handleSubmit = () => {
    onRecordPayment({
      document_id: doc.id,
      amount: amountReceived,
      tds_amount: tdsAmount,
      payment_date: form.payment_date,
      payment_mode: form.payment_mode,
      reference_number: form.reference_number,
      notes: form.notes,
      org_id: doc.org_id,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-1">
          <div className="flex justify-between text-sm"><span>Invoice Total</span><strong>{formatCurrencyINR(doc.total_amount)}</strong></div>
          <div className="flex justify-between text-sm"><span>Already Paid</span><strong className="text-emerald-600">{formatCurrencyINR(doc.amount_paid)}</strong></div>
          <div className="flex justify-between text-sm font-bold"><span>Balance Due</span><strong className="text-amber-600">{formatCurrencyINR(doc.balance_due)}</strong></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Payment Date <span className="text-red-500">*</span></Label>
            <Input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Amount Received <span className="text-red-500">*</span></Label>
            <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>TDS Deducted</Label>
            <Input type="number" value={form.tds_amount} onChange={e => setForm({ ...form, tds_amount: e.target.value })} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Total Settled</Label>
            <div className="h-10 flex items-center px-3 rounded-md border bg-muted/30 text-sm font-semibold">
              {formatCurrencyINR(totalSettled)}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Payment Mode</Label>
            <Select value={form.payment_mode} onValueChange={v => setForm({ ...form, payment_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="online">Online Gateway</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reference Number</Label>
            <Input value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} placeholder="Transaction ID / Cheque No." />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit}>
            <Check className="h-4 w-4 mr-1" />Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
