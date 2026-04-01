import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IndianRupee, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { LoadingState } from "@/components/common/LoadingState";
import { toast } from "sonner";

interface DueToDeptDialogProps {
  open: boolean;
  onClose: () => void;
}

interface GSTPaymentTracking {
  id: string;
  month: number;
  year: number;
  gst_collected: number;
  payment_status: "pending" | "paid" | "partial";
  amount_paid: number;
  payment_date: string | null;
  payment_reference: string | null;
  notes: string | null;
}

interface MonthBreakdown {
  monthKey: string;
  monthLabel: string;
  monthNum: number;
  year: number;
  gstCollected: number;
  amountPaid: number;
  amountDue: number;
  status: "pending" | "paid" | "partial";
}

export function DueToDeptDialog({ open, onClose }: DueToDeptDialogProps) {
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  
  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<MonthBreakdown | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | "partial">("pending");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // Fetch all paid invoices with GST
  const { data: paidInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["due-to-dept-invoices", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("client_invoices")
        .select("tax_amount, payment_received_date, invoice_date")
        .eq("org_id", effectiveOrgId)
        .eq("status", "paid")
        .neq("document_type", "quotation")
        .order("payment_received_date", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!effectiveOrgId,
  });

  // Fetch GST payment tracking records
  const { data: gstPayments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["gst-payment-tracking", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("gst_payment_tracking")
        .select("*")
        .eq("org_id", effectiveOrgId);
      
      if (error) throw error;
      return (data || []) as GSTPaymentTracking[];
    },
    enabled: open && !!effectiveOrgId,
  });

  // Mutation to save GST payment
  const savePaymentMutation = useMutation({
    mutationFn: async (data: {
      month: number;
      year: number;
      gstCollected: number;
      paymentStatus: string;
      amountPaid: number;
      paymentDate: string | null;
      paymentReference: string | null;
      notes: string | null;
    }) => {
      if (!effectiveOrgId) throw new Error("No org selected");
      
      const existing = gstPayments?.find(
        p => p.month === data.month && p.year === data.year
      );
      
      if (existing) {
        const { error } = await supabase
          .from("gst_payment_tracking")
          .update({
            gst_collected: data.gstCollected,
            payment_status: data.paymentStatus,
            amount_paid: data.amountPaid,
            payment_date: data.paymentDate,
            payment_reference: data.paymentReference,
            notes: data.notes,
          })
          .eq("id", existing.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("gst_payment_tracking")
          .insert({
            org_id: effectiveOrgId,
            month: data.month,
            year: data.year,
            gst_collected: data.gstCollected,
            payment_status: data.paymentStatus,
            amount_paid: data.amountPaid,
            payment_date: data.paymentDate,
            payment_reference: data.paymentReference,
            notes: data.notes,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gst-payment-tracking"] });
      queryClient.invalidateQueries({ queryKey: ["gst-summary-dashboard"] });
      toast.success("GST payment status updated");
      setPaymentDialogOpen(false);
      resetPaymentForm();
    },
    onError: (error) => {
      toast.error("Failed to update payment status: " + error.message);
    },
  });

  const resetPaymentForm = () => {
    setPaymentStatus("pending");
    setAmountPaid("");
    setPaymentDate("");
    setPaymentReference("");
    setPaymentNotes("");
    setSelectedMonth(null);
  };

  // Calculate monthly breakdown
  const monthlyBreakdown = useMemo(() => {
    if (!paidInvoices) return [];
    
    const monthMap = new Map<string, MonthBreakdown>();

    paidInvoices.forEach((inv) => {
      const dateToUse = inv.payment_received_date || inv.invoice_date;
      if (!dateToUse) return;
      
      const parsedDate = parseISO(dateToUse);
      const monthKey = format(parsedDate, "yyyy-MM");
      const monthLabel = format(parsedDate, "MMM yyyy");
      const monthNum = parsedDate.getMonth() + 1;
      const year = parsedDate.getFullYear();
      
      const current = monthMap.get(monthKey) || {
        monthKey,
        monthLabel,
        monthNum,
        year,
        gstCollected: 0,
        amountPaid: 0,
        amountDue: 0,
        status: "pending" as const,
      };

      current.gstCollected += inv.tax_amount || 0;
      monthMap.set(monthKey, current);
    });

    // Add payment tracking info
    monthMap.forEach((month, key) => {
      const payment = gstPayments?.find(p => p.month === month.monthNum && p.year === month.year);
      if (payment) {
        month.amountPaid = payment.amount_paid || 0;
        month.status = payment.payment_status;
      }
      month.amountDue = month.gstCollected - month.amountPaid;
      monthMap.set(key, month);
    });

    return Array.from(monthMap.values())
      .filter(m => m.status !== "paid")
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [paidInvoices, gstPayments]);

  // Calculate totals
  const totals = useMemo(() => {
    return monthlyBreakdown.reduce(
      (acc, m) => ({
        gstCollected: acc.gstCollected + m.gstCollected,
        amountPaid: acc.amountPaid + m.amountPaid,
        amountDue: acc.amountDue + m.amountDue,
      }),
      { gstCollected: 0, amountPaid: 0, amountDue: 0 }
    );
  }, [monthlyBreakdown]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleUpdatePayment = (month: MonthBreakdown) => {
    setSelectedMonth(month);
    
    const existing = gstPayments?.find(p => p.month === month.monthNum && p.year === month.year);
    if (existing) {
      setPaymentStatus(existing.payment_status);
      setAmountPaid(existing.amount_paid?.toString() || "");
      setPaymentDate(existing.payment_date || "");
      setPaymentReference(existing.payment_reference || "");
      setPaymentNotes(existing.notes || "");
    } else {
      setPaymentStatus("pending");
      setAmountPaid(month.gstCollected.toString());
      setPaymentDate("");
      setPaymentReference("");
      setPaymentNotes("");
    }
    
    setPaymentDialogOpen(true);
  };

  const handleSavePayment = () => {
    if (!selectedMonth) return;
    
    savePaymentMutation.mutate({
      month: selectedMonth.monthNum,
      year: selectedMonth.year,
      gstCollected: selectedMonth.gstCollected,
      paymentStatus,
      amountPaid: parseFloat(amountPaid) || 0,
      paymentDate: paymentDate || null,
      paymentReference: paymentReference || null,
      notes: paymentNotes || null,
    });
  };

  const isLoading = invoicesLoading || paymentsLoading;

  return (
    <>
      <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-1.5 bg-orange-100 rounded-md">
                <IndianRupee className="h-5 w-5 text-orange-600" />
              </div>
              GST Due to Department - Unpaid Months
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <LoadingState message="Loading GST data..." />
          ) : monthlyBreakdown.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p>All GST payments are up to date!</p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">GST Collected</TableHead>
                    <TableHead className="text-right">Amount Paid</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyBreakdown.map((month) => (
                    <TableRow key={month.monthKey}>
                      <TableCell className="font-medium text-green-600">{month.monthLabel}</TableCell>
                      <TableCell className="text-right">{formatCurrency(month.gstCollected)}</TableCell>
                      <TableCell className="text-right">
                        {month.amountPaid > 0 ? formatCurrency(month.amountPaid) : "₹0"}
                      </TableCell>
                      <TableCell className="text-right font-medium text-red-600">
                        {formatCurrency(month.amountDue)}
                      </TableCell>
                      <TableCell className="text-center">
                        {month.status === "partial" ? (
                          <Badge className="bg-amber-500 hover:bg-amber-600">Partial</Badge>
                        ) : (
                          <Badge className="bg-red-500 hover:bg-red-600">Unpaid</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleUpdatePayment(month)}
                        >
                          Update Payment
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals Row */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.gstCollected)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.amountPaid)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatCurrency(totals.amountDue)}</TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {monthlyBreakdown.length} months
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Update Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update GST Payment - {selectedMonth?.monthLabel}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">GST Collected</div>
              <div className="text-lg font-semibold">{selectedMonth && formatCurrency(selectedMonth.gstCollected)}</div>
            </div>

            <div className="space-y-2">
              <Label>Payment Status</Label>
              <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as "pending" | "paid" | "partial")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Amount Paid</Label>
              <Input
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="Enter amount paid"
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Reference</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Transaction ID / Challan No."
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePayment} disabled={savePaymentMutation.isPending}>
              {savePaymentMutation.isPending ? "Saving..." : "Save Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
