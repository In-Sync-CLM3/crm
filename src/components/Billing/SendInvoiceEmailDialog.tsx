import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyINR } from "@/utils/billingUtils";
import { DOC_TYPE_LABELS } from "@/types/billing";
import type { BillingDocument, BillingSettings } from "@/types/billing";
import { toast } from "sonner";

interface SendInvoiceEmailDialogProps {
  open: boolean;
  onClose: () => void;
  doc: BillingDocument;
  settings: BillingSettings;
  onStatusUpdate?: (id: string, status: string) => void;
}

function buildInvoiceHtml(doc: BillingDocument, settings: BillingSettings): string {
  const docLabel = DOC_TYPE_LABELS[doc.doc_type] || "Invoice";
  const isIntraState = doc.supply_type === "intra_state";

  const itemRows = doc.items.map((item, i) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${item.description}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.hsn_sac}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.qty} ${item.unit}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrencyINR(item.rate)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrencyINR(item.taxable)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrencyINR(item.total)}</td>
    </tr>
  `).join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:700px;margin:0 auto;color:#333">
      <div style="text-align:center;margin-bottom:20px">
        <span style="display:inline-block;background:#0f9d7a;color:#fff;padding:8px 24px;border-radius:8px;font-weight:bold;font-size:14px">${docLabel.toUpperCase()}</span>
      </div>

      <div style="margin-bottom:16px">
        <h2 style="margin:0;color:#0f9d7a">${settings.company_name}</h2>
        <p style="margin:4px 0;font-size:12px;color:#666">${settings.company_address || ""}</p>
        ${settings.company_gstin ? `<p style="margin:2px 0;font-size:12px;color:#666">GSTIN: ${settings.company_gstin}</p>` : ""}
        ${settings.company_email ? `<p style="margin:2px 0;font-size:12px;color:#666">Email: ${settings.company_email}${settings.company_phone ? ` | Ph: ${settings.company_phone}` : ""}</p>` : ""}
      </div>

      <hr style="border:none;border-top:2px solid #0f9d7a;margin:16px 0" />

      <table style="width:100%;margin-bottom:16px;font-size:13px">
        <tr>
          <td style="vertical-align:top;width:50%;padding:12px;background:#f9fafb;border-radius:8px">
            <strong style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px">Bill To</strong><br/>
            <strong style="font-size:14px">${doc.client_name}</strong>
            ${doc.client?.billing_address ? `<br/><span style="color:#666;font-size:12px">${doc.client.billing_address}</span>` : ""}
            ${doc.client?.city ? `<br/><span style="color:#666;font-size:12px">${doc.client.city}${doc.client?.pin_code ? ` - ${doc.client.pin_code}` : ""}</span>` : ""}
            ${doc.client?.gstin ? `<br/><span style="color:#666;font-size:12px">GSTIN: ${doc.client.gstin}</span>` : ""}
          </td>
          <td style="width:16px"></td>
          <td style="vertical-align:top;width:50%;padding:12px">
            <table style="width:100%;font-size:13px">
              <tr><td style="color:#888;padding:2px 8px">Doc Number</td><td style="text-align:right;font-weight:bold;padding:2px 8px">${doc.doc_number}</td></tr>
              <tr><td style="color:#888;padding:2px 8px">Date</td><td style="text-align:right;padding:2px 8px">${doc.doc_date}</td></tr>
              <tr><td style="color:#888;padding:2px 8px">Due Date</td><td style="text-align:right;padding:2px 8px">${doc.due_date}</td></tr>
              <tr><td style="color:#888;padding:2px 8px">Supply Type</td><td style="text-align:right;padding:2px 8px">${isIntraState ? "Intra-State" : "Inter-State"}</td></tr>
            </table>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        <thead>
          <tr style="background:#0f9d7a;color:#fff">
            <th style="padding:8px;text-align:center">#</th>
            <th style="padding:8px;text-align:left">Description</th>
            <th style="padding:8px;text-align:center">HSN/SAC</th>
            <th style="padding:8px;text-align:center">Qty</th>
            <th style="padding:8px;text-align:right">Rate</th>
            <th style="padding:8px;text-align:right">Taxable</th>
            <th style="padding:8px;text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <table style="width:280px;margin-left:auto;font-size:13px;margin-bottom:16px">
        <tr><td style="padding:4px 8px;color:#888">Subtotal</td><td style="text-align:right;padding:4px 8px">${formatCurrencyINR(doc.subtotal)}</td></tr>
        ${isIntraState
          ? `<tr><td style="padding:4px 8px;color:#888">CGST</td><td style="text-align:right;padding:4px 8px">${formatCurrencyINR(doc.total_tax / 2)}</td></tr>
             <tr><td style="padding:4px 8px;color:#888">SGST</td><td style="text-align:right;padding:4px 8px">${formatCurrencyINR(doc.total_tax / 2)}</td></tr>`
          : `<tr><td style="padding:4px 8px;color:#888">IGST</td><td style="text-align:right;padding:4px 8px">${formatCurrencyINR(doc.total_tax)}</td></tr>`
        }
        <tr style="border-top:2px solid #0f9d7a"><td style="padding:8px;font-weight:bold;color:#0f9d7a;font-size:15px">Grand Total</td><td style="text-align:right;padding:8px;font-weight:bold;color:#0f9d7a;font-size:15px">${formatCurrencyINR(doc.total_amount)}</td></tr>
      </table>

      ${settings.bank_name ? `
      <div style="margin-top:20px;padding:12px;background:#f9fafb;border-radius:8px;font-size:12px">
        <strong style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px">Bank Details</strong><br/>
        Bank: ${settings.bank_name}<br/>
        A/C: ${settings.bank_account_number}<br/>
        IFSC: ${settings.bank_ifsc}
        ${settings.bank_upi_id ? `<br/>UPI: ${settings.bank_upi_id}` : ""}
      </div>` : ""}

      <p style="text-align:center;color:#999;font-size:11px;margin-top:24px">This is a computer-generated document and does not require a physical signature.</p>
    </div>
  `;
}

const EMAIL_CACHE_KEY = "billing_email_cc_cache";

function loadCachedCC(clientId: string): string {
  try {
    const cache = JSON.parse(localStorage.getItem(EMAIL_CACHE_KEY) || "{}");
    return cache[clientId] || "";
  } catch { return ""; }
}

function saveCachedCC(clientId: string, cc: string) {
  try {
    const cache = JSON.parse(localStorage.getItem(EMAIL_CACHE_KEY) || "{}");
    cache[clientId] = cc;
    localStorage.setItem(EMAIL_CACHE_KEY, JSON.stringify(cache));
  } catch { /* ignore */ }
}

export function SendInvoiceEmailDialog({ open, onClose, doc, settings, onStatusUpdate }: SendInvoiceEmailDialogProps) {
  const docLabel = DOC_TYPE_LABELS[doc.doc_type] || "Invoice";
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    to: doc.client?.email || "",
    cc: loadCachedCC(doc.client_id),
    subject: `${docLabel} ${doc.doc_number} from ${settings.company_name || ""}`.trim(),
    message: `Dear ${doc.client_name},\n\nPlease find the details of ${docLabel.toLowerCase()} ${doc.doc_number} for ${formatCurrencyINR(doc.total_amount)}.\n\nKindly arrange payment by ${doc.due_date}.\n\nRegards,\n${settings.company_name || ""}`,
  });

  const handleSend = async () => {
    if (!form.to || !form.subject) {
      toast.error("Please enter recipient email and subject");
      return;
    }
    setSending(true);
    try {
      // Save CC for this client for future use
      if (doc.client_id) saveCachedCC(doc.client_id, form.cc);

      const invoiceHtml = buildInvoiceHtml(doc, settings);
      const messageHtml = form.message.replace(/\n/g, "<br/>");
      const fullHtml = `${messageHtml}<br/><br/><hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>${invoiceHtml}`;

      const ccList = form.cc.split(",").map(e => e.trim()).filter(Boolean);

      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          to: form.to,
          subject: form.subject,
          htmlContent: fullHtml,
          ...(ccList.length > 0 ? { cc: ccList } : {}),
        },
      });

      if (error) throw error;

      // Update doc status to "sent" if currently draft
      if (doc.status === "draft" && onStatusUpdate) {
        onStatusUpdate(doc.id, "sent");
      }

      toast.success(`${docLabel} emailed to ${form.to}`);
      onClose();
    } catch (err: any) {
      console.error("Email send error:", err);
      toast.error(err.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send {docLabel} via Email</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Document</span><strong>{doc.doc_number}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Client</span><strong>{doc.client_name}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><strong className="text-primary">{formatCurrencyINR(doc.total_amount)}</strong></div>
          </div>

          <div className="space-y-1.5">
            <Label>To <span className="text-red-500">*</span></Label>
            <Input type="email" value={form.to} onChange={e => setForm({ ...form, to: e.target.value })} placeholder="client@example.com" />
          </div>

          <div className="space-y-1.5">
            <Label>CC <span className="text-muted-foreground text-xs">(comma separated)</span></Label>
            <Input value={form.cc} onChange={e => setForm({ ...form, cc: e.target.value })} placeholder="accounts@client.com, manager@client.com" />
          </div>

          <div className="space-y-1.5">
            <Label>Subject <span className="text-red-500">*</span></Label>
            <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={5} />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
