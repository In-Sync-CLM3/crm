import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrencyINR } from "@/utils/billingUtils";
import type { BillingPayment, BillingDocument } from "@/types/billing";

interface BillingPaymentsListProps {
  payments: BillingPayment[];
  documents: BillingDocument[];
}

export function BillingPaymentsList({ payments, documents }: BillingPaymentsListProps) {
  const enriched = payments.map(p => {
    const doc = documents.find(d => d.id === p.document_id);
    return { ...p, doc_number: doc?.doc_number || "—", client_name: doc?.client_name || "—" };
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Payments</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{payments.length} payments recorded</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enriched.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No payments recorded yet. Record payments from Tax Invoice views.</TableCell></TableRow>
            ) : (
              enriched.map(p => (
                <TableRow key={p.id}>
                  <TableCell>{p.payment_date}</TableCell>
                  <TableCell className="font-semibold text-primary">{p.doc_number}</TableCell>
                  <TableCell>{p.client_name}</TableCell>
                  <TableCell className="text-right font-bold text-emerald-600">{formatCurrencyINR(p.amount)}</TableCell>
                  <TableCell className="capitalize">{p.payment_mode?.replace(/_/g, " ")}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{p.reference_number || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
