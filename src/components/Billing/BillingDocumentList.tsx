import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Eye, Download, Mail, ArrowRight, IndianRupee, Trash2 } from "lucide-react";
import { formatCurrencyINR, statusLabel } from "@/utils/billingUtils";
import { DOC_TYPE_LABELS, DOC_TYPE_COLORS, STATUS_COLORS } from "@/types/billing";
import type { BillingDocument, BillingDocumentType } from "@/types/billing";

interface BillingDocumentListProps {
  documents: BillingDocument[];
  docType: BillingDocumentType;
  onView: (id: string) => void;
  onCreate: () => void;
  onConvert?: (doc: BillingDocument) => void;
  onConvertToInvoice?: (doc: BillingDocument) => void;
  onDelete?: (id: string) => void;
  initialStatusFilter?: string;
}

export function BillingDocumentList({ documents, docType, onView, onCreate, onConvert, onConvertToInvoice, onDelete, initialStatusFilter }: BillingDocumentListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || "all");

  const typeLabel = DOC_TYPE_LABELS[docType] || "Documents";
  const docs = documents.filter(d => d.doc_type === docType);

  const filtered = docs.filter(d => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (search && !d.doc_number.toLowerCase().includes(search.toLowerCase()) && !d.client_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const receivable = filtered.reduce((s, d) => {
    if (["paid", "cancelled", "draft"].includes(d.status)) return s;
    return s + (d.balance_due || 0);
  }, 0);

  const statuses = docType === "proforma"
    ? ["all", "draft", "sent", "paid", "cancelled"]
    : docType === "credit_note"
    ? ["all", "draft", "sent", "issued", "cancelled"]
    : ["all", "draft", "sent", "paid", "partially_paid", "overdue", "cancelled"];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{typeLabel}s</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {docs.length} total
            {receivable > 0 && (
              <> • <span className="text-amber-600 font-semibold">{formatCurrencyINR(receivable)} receivable</span></>
            )}
          </p>
        </div>
        <Button onClick={onCreate}><Plus className="h-4 w-4 mr-1" />Create {typeLabel}</Button>
      </div>

      <Card>
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {statuses.map(s => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className="text-xs"
              >
                {s === "all" ? "All" : statusLabel(s)}
              </Button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by document number or client..." className="pl-9" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Doc #</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No {typeLabel.toLowerCase()}s found</TableCell></TableRow>
            ) : (
              filtered.map(d => (
                <TableRow key={d.id} className="hover:bg-muted/50">
                  <TableCell className="font-semibold text-primary cursor-pointer hover:underline" onClick={() => onView(d.id)}>{d.doc_number}</TableCell>
                  <TableCell>{d.client_name}</TableCell>
                  <TableCell className="text-muted-foreground">{d.doc_date}</TableCell>
                  <TableCell className="text-right">{formatCurrencyINR(d.subtotal)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrencyINR(d.total_tax)}</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrencyINR(d.total_amount)}</TableCell>
                  <TableCell className="text-right">
                    {d.status === "paid" || d.status === "cancelled" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : d.amount_paid > 0 ? (
                      <span className="font-bold text-amber-600">{formatCurrencyINR(d.balance_due)}</span>
                    ) : (
                      <span className="text-muted-foreground">{formatCurrencyINR(d.total_amount)}</span>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="secondary" className={STATUS_COLORS[d.status]}>{statusLabel(d.status)}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => onView(d.id)} title="View"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Download PDF" onClick={() => onView(d.id)}><Download className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Send Email"><Mail className="h-4 w-4" /></Button>
                      {docType === "proforma" && onConvert && (d.status === "paid" || d.status === "partially_paid") && (
                        <Button variant="ghost" size="sm" onClick={() => { if (window.confirm(`Convert ${d.doc_number} to Tax Invoice?`)) onConvert(d); }} title="Convert to Tax Invoice" className="text-emerald-600 hover:text-emerald-700 gap-1 text-xs font-semibold">
                          <ArrowRight className="h-4 w-4" />Tax Inv.
                        </Button>
                      )}
                      {docType === "proforma" && onConvert && d.status !== "paid" && d.status !== "partially_paid" && d.status !== "cancelled" && (
                        <Button variant="ghost" size="icon" onClick={() => { if (window.confirm(`Convert ${d.doc_number} to Tax Invoice?`)) onConvert(d); }} title="Convert to Tax Invoice" className="text-muted-foreground hover:text-emerald-600">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete ${d.doc_number}?`)) onDelete(d.id); }} title="Delete" className="text-muted-foreground hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
