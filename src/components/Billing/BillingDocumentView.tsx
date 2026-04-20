import { useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Download, Mail, CreditCard, Loader2, Pencil, Trash2, FileX2, ArrowRight } from "lucide-react";
import { formatCurrencyINR, numberToWords, statusLabel, formatFinancialYear } from "@/utils/billingUtils";
import { DOC_TYPE_LABELS, STATUS_COLORS } from "@/types/billing";
import type { BillingDocument, BillingPayment, BillingSettings } from "@/types/billing";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { SendInvoiceEmailDialog } from "./SendInvoiceEmailDialog";

interface BillingDocumentViewProps {
  doc: BillingDocument;
  payments: BillingPayment[];
  settings: BillingSettings;
  onBack: () => void;
  onRecordPayment: (payment: { document_id: string; amount: number; tds_amount?: number; payment_date: string; payment_mode: string; reference_number: string; notes: string; org_id: string }) => void;
  onEdit?: (doc: BillingDocument) => void;
  onDelete?: (id: string) => void;
  onIssueCreditNote?: (doc: BillingDocument) => void;
  onConvertToInvoice?: (doc: BillingDocument) => void;
  onStatusUpdate?: (id: string, updates: Partial<BillingDocument>) => void;
  convertedInvoice?: { id: string; doc_number: string };
  onOpenDoc?: (id: string) => void;
  busy?: boolean;
}

export function BillingDocumentView({ doc, payments, settings, onBack, onRecordPayment, onEdit, onDelete, onIssueCreditNote, onConvertToInvoice, onStatusUpdate, convertedInvoice, onOpenDoc, busy }: BillingDocumentViewProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  const handleDownloadPDF = useCallback(async () => {
    if (!invoiceRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      const el = invoiceRef.current;
      const originalWidth = el.style.width;
      const originalMaxWidth = el.style.maxWidth;

      // Fix width to 800px so text renders at a readable size on A4
      el.style.width = "800px";
      el.style.maxWidth = "800px";

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      // Restore original width
      el.style.width = originalWidth;
      el.style.maxWidth = originalMaxWidth;

      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pdf = new jsPDF("p", "mm", "a4");
      const pageHeight = 297; // A4 height in mm

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${doc.doc_number}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [doc.doc_number]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="h-5 w-5" /></Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold">{doc.doc_number}</h2>
            <p className="text-sm text-muted-foreground">{DOC_TYPE_LABELS[doc.doc_type]} for {doc.client_name}</p>
          </div>
          <Badge variant="secondary" className={`${STATUS_COLORS[doc.status]} text-sm px-3 py-1`}>{statusLabel(doc.status)}</Badge>
          <Button variant="outline" className="gap-1.5" onClick={handleDownloadPDF} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            PDF
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setShowEmailModal(true)}><Mail className="h-4 w-4" />Email</Button>
          {onEdit && (
            <Button variant="outline" className="gap-1.5" onClick={() => onEdit(doc)}>
              <Pencil className="h-4 w-4" />Edit
            </Button>
          )}
          {onDelete && (
            <Button variant="outline" className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="h-4 w-4" />Delete
            </Button>
          )}
        </div>
        {/* Workflow action buttons */}
        <div className="flex items-center gap-3 flex-wrap pl-12 relative z-10">
          {doc.doc_type === "invoice" && doc.status !== "cancelled" && doc.status !== "paid" && (
            <Button className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowPaymentModal(true)}>
              <CreditCard className="h-4 w-4" />Record Payment
            </Button>
          )}
          {doc.doc_type === "proforma" && doc.status !== "cancelled" && convertedInvoice && onOpenDoc && (
            <Button className="gap-1.5 bg-primary hover:bg-primary/90" onClick={() => onOpenDoc(convertedInvoice.id)}>
              <ArrowRight className="h-4 w-4" />View Tax Invoice ({convertedInvoice.doc_number})
            </Button>
          )}
          {doc.doc_type === "proforma" && doc.status !== "cancelled" && !convertedInvoice && onConvertToInvoice && (
            <Button
              className="gap-1.5 bg-primary hover:bg-primary/90"
              disabled={busy}
              onClick={() => { if (window.confirm(`Convert ${doc.doc_number} to Tax Invoice?`)) onConvertToInvoice(doc); }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {busy ? "Converting…" : "Convert to Tax Invoice"}
            </Button>
          )}
          {doc.doc_type === "invoice" && doc.status !== "cancelled" && onIssueCreditNote && (
            <Button variant="outline" className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onIssueCreditNote(doc)}>
              <FileX2 className="h-4 w-4" />Cancel & Issue Credit Note
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Preview */}
      <Card className="p-8" ref={invoiceRef}>
        <div className="border-2 border-gray-200 rounded-xl p-8">
          {/* Company Header */}
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-start gap-4">
              {settings.logo_url && (
                <img src={settings.logo_url} alt="Logo" className="h-14 w-auto object-contain rounded" />
              )}
              <div>
                <h3 className="text-xl font-bold text-primary">{settings.company_name || "Your Company"}</h3>
                <p className="text-xs text-muted-foreground mt-1">{settings.company_address}</p>
                {(settings.company_gstin || settings.company_pan) && (
                  <p className="text-xs text-muted-foreground">
                    {settings.company_gstin && `GSTIN: ${settings.company_gstin}`}
                    {settings.company_gstin && settings.company_pan && " | "}
                    {settings.company_pan && `PAN: ${settings.company_pan}`}
                  </p>
                )}
                {(settings.company_email || settings.company_phone) && (
                  <p className="text-xs text-muted-foreground">
                    {settings.company_email && `Email: ${settings.company_email}`}
                    {settings.company_email && settings.company_phone && " | "}
                    {settings.company_phone && `Ph: ${settings.company_phone}`}
                  </p>
                )}
                {settings.company_state && (
                  <p className="text-xs text-muted-foreground">
                    State: {settings.company_state}{settings.company_state_code ? ` (${settings.company_state_code})` : ""}
                  </p>
                )}
              </div>
            </div>
            <div className={`shrink-0 self-start px-6 py-2 rounded-lg text-sm font-bold text-center whitespace-nowrap ${
              doc.doc_type === "invoice" ? "bg-primary text-primary-foreground" :
              doc.doc_type === "credit_note" ? "bg-red-500 text-white" :
              doc.doc_type === "proforma" ? "bg-sky-500 text-white" : "bg-violet-500 text-white"
            }`}>
              {DOC_TYPE_LABELS[doc.doc_type]?.toUpperCase()}
            </div>
          </div>
          <div className="h-px bg-primary mb-6" />

          {/* Bill To + Doc Details */}
          <div className="grid grid-cols-2 gap-8 mb-6">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Bill To</p>
              <p className="text-sm font-bold">{doc.client?.invoice_company_name || doc.client_name}</p>
              {doc.client?.invoice_company_name && doc.client_name !== doc.client.invoice_company_name && (
                <p className="text-xs text-muted-foreground">({doc.client.company})</p>
              )}
              {doc.client && (
                <>
                  {doc.client.billing_address && <p className="text-xs text-muted-foreground mt-1">{doc.client.billing_address}</p>}
                  <p className="text-xs text-muted-foreground">
                    {[doc.client.city, doc.client.state].filter(Boolean).join(", ")}
                    {doc.client.pin_code ? ` - ${doc.client.pin_code}` : ""}
                  </p>
                  {doc.client.billing_state_code && (
                    <p className="text-xs text-muted-foreground">State Code: {doc.client.billing_state_code}</p>
                  )}
                  {doc.client.gstin && <p className="text-xs text-muted-foreground mt-1">GSTIN: {doc.client.gstin}</p>}
                  {doc.client.pan && !doc.client.gstin && <p className="text-xs text-muted-foreground mt-1">PAN: {doc.client.pan}</p>}
                </>
              )}
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="space-y-1.5">
                <div className="flex justify-between"><span className="text-[10px] font-bold text-muted-foreground uppercase">Doc Number</span><span className="text-xs font-semibold">{doc.doc_number}</span></div>
                <div className="flex justify-between"><span className="text-[10px] font-bold text-muted-foreground uppercase">Date</span><span className="text-xs">{doc.doc_date}</span></div>
                <div className="flex justify-between"><span className="text-[10px] font-bold text-muted-foreground uppercase">Due Date</span><span className="text-xs">{doc.due_date}</span></div>
                <div className="flex justify-between"><span className="text-[10px] font-bold text-muted-foreground uppercase">Supply Type</span><span className="text-xs">{doc.supply_type === "intra_state" ? "Intra-State" : "Inter-State"}</span></div>
                <div className="flex justify-between"><span className="text-[10px] font-bold text-muted-foreground uppercase">FY</span><span className="text-xs">{formatFinancialYear(doc.financial_year)}</span></div>
                {doc.original_invoice_number && (
                  <div className="flex justify-between"><span className="text-[10px] font-bold text-red-600 uppercase">Against Invoice</span><span className="text-xs font-semibold text-red-600">{doc.original_invoice_number}</span></div>
                )}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <table className="w-full mb-6">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                {["#", "Description", "HSN/SAC", "Qty", "Rate", "Taxable",
                  doc.supply_type === "intra_state" ? "CGST" : "IGST",
                  ...(doc.supply_type === "intra_state" ? ["SGST"] : []),
                  "Total"
                ].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doc.items?.map((item, i) => (
                <tr key={i} className={i % 2 ? "bg-muted/30" : ""}>
                  <td className="px-3 py-2.5 text-xs">{i + 1}</td>
                  <td className="px-3 py-2.5 text-xs font-medium">{item.description}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.hsn_sac}</td>
                  <td className="px-3 py-2.5 text-xs">{item.qty} {item.unit}</td>
                  <td className="px-3 py-2.5 text-xs">{formatCurrencyINR(item.rate)}</td>
                  <td className="px-3 py-2.5 text-xs">{formatCurrencyINR(item.taxable)}</td>
                  <td className="px-3 py-2.5 text-xs">{formatCurrencyINR(doc.supply_type === "intra_state" ? item.cgst : item.igst)}</td>
                  {doc.supply_type === "intra_state" && <td className="px-3 py-2.5 text-xs">{formatCurrencyINR(item.sgst)}</td>}
                  <td className="px-3 py-2.5 text-xs font-semibold">{formatCurrencyINR(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary */}
          <div className="flex justify-end mb-6">
            <div className="w-72 space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrencyINR(doc.subtotal)}</span></div>
              {doc.supply_type === "intra_state" ? (
                <>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">CGST</span><span>{formatCurrencyINR(doc.total_tax / 2)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">SGST</span><span>{formatCurrencyINR(doc.total_tax / 2)}</span></div>
                </>
              ) : (
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">IGST</span><span>{formatCurrencyINR(doc.total_tax)}</span></div>
              )}
              <div className="h-px bg-border my-2" />
              <div className="flex justify-between text-base font-bold text-primary"><span>Grand Total</span><span>{formatCurrencyINR(doc.total_amount)}</span></div>
              {(() => {
                const totalTds = payments.reduce((sum, p) => sum + (p.tds_amount || 0), 0);
                const totalAdvance = payments
                  .filter(p => p.payment_mode === "advance")
                  .reduce((sum, p) => sum + (p.amount || 0), 0);
                if (totalTds > 0 || totalAdvance > 0) {
                  const netPayable = doc.total_amount - totalTds - totalAdvance;
                  return (
                    <>
                      <div className="h-px bg-border my-2" />
                      {totalAdvance > 0 && (
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Less: Advance Adjusted</span><span className="text-emerald-600">-{formatCurrencyINR(totalAdvance)}</span></div>
                      )}
                      {totalTds > 0 && (
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Less: TDS Deducted</span><span className="text-red-600">-{formatCurrencyINR(totalTds)}</span></div>
                      )}
                      <div className="flex justify-between text-base font-bold text-emerald-700"><span>Net Payable</span><span>{formatCurrencyINR(Math.max(0, netPayable))}</span></div>
                    </>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* Amount in words */}
          <div className="bg-muted/50 rounded-lg p-3 mb-6">
            <p className="text-xs text-muted-foreground"><span className="font-semibold">Amount in Words:</span> {numberToWords(doc.total_amount)}</p>
          </div>

          {/* Bank + Signature */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Bank Details</p>
              <p className="text-xs">Bank: {settings.bank_name || "—"}</p>
              <p className="text-xs">A/C: {settings.bank_account_number || "—"}</p>
              <p className="text-xs">IFSC: {settings.bank_ifsc || "—"}</p>
              {settings.bank_upi_id && <p className="text-xs">UPI: {settings.bank_upi_id}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold">For {settings.company_name || "Your Company"}</p>
              {settings.signature_url ? (
                <img src={settings.signature_url} alt="Signature" className="h-12 w-auto object-contain ml-auto mt-2 mb-2" />
              ) : (
                <div className="h-12 mt-2 mb-2" />
              )}
              <p className="text-xs text-muted-foreground">Authorized Signatory</p>
            </div>
          </div>

          {/* Terms */}
          {doc.terms_and_conditions && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Terms & Conditions</p>
              <p className="text-xs text-muted-foreground whitespace-pre-line">{doc.terms_and_conditions}</p>
            </div>
          )}

          {/* Tax-invoice thank-you note */}
          {doc.doc_type === "invoice" && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Note</p>
              <p className="text-xs text-muted-foreground">We value your business and trust.</p>
            </div>
          )}

          <p className="text-center text-[10px] text-muted-foreground mt-6 pt-4 border-t">
            This is a computer-generated document and does not require a physical signature.
          </p>
        </div>
      </Card>

      {/* Payment History for Invoices only */}
      {doc.doc_type === "invoice" && (
        <Card>
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Payment History</h3>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Total: <strong>{formatCurrencyINR(doc.total_amount)}</strong></span>
              <span className="text-emerald-600">Paid: <strong>{formatCurrencyINR(doc.amount_paid)}</strong></span>
              <span className="text-amber-600">Balance: <strong>{formatCurrencyINR(doc.balance_due)}</strong></span>
            </div>
          </div>
          {payments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">TDS</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.payment_date}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">{formatCurrencyINR(p.amount)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{p.tds_amount ? formatCurrencyINR(p.tds_amount) : "—"}</TableCell>
                    <TableCell className="capitalize">{p.payment_mode?.replace(/_/g, " ")}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{p.reference_number || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="px-5 py-8 text-center text-muted-foreground text-sm">No payments recorded yet</div>
          )}
        </Card>
      )}

      {/* Payment Dialog */}
      <RecordPaymentDialog
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        doc={doc}
        onRecordPayment={onRecordPayment}
      />

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold">Delete {DOC_TYPE_LABELS[doc.doc_type]}</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Are you sure you want to delete <strong>{doc.doc_number}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button variant="destructive" className="gap-1.5" onClick={() => { onDelete?.(doc.id); setShowDeleteConfirm(false); }}>
                <Trash2 className="h-4 w-4" />Delete
              </Button>
            </div>
          </Card>
        </div>
      )}

      <SendInvoiceEmailDialog
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        doc={doc}
        settings={settings}
        onStatusUpdate={onStatusUpdate ? (id, status) => onStatusUpdate(id, { status: status as any }) : undefined}
      />
    </div>
  );
}
