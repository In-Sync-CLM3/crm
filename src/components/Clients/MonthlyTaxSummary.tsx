import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Calculator } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format, parseISO } from "date-fns";
import { MonthlyPaymentsDialog } from "./MonthlyPaymentsDialog";

interface Invoice {
  id: string;
  invoice_date: string;
  invoice_number: string;
  amount: number;
  tax_amount?: number;
  gst_rate?: number;
  tds_amount?: number;
  net_received_amount?: number;
  payment_received_date?: string;
  status: string;
  currency: string;
  document_type?: string;
}

interface MonthlyTaxSummaryProps {
  invoices: Invoice[];
  currency?: string;
}

interface MonthlyData {
  month: string;
  monthKey: string;
  baseAmount: number;
  gstAmount: number;
  tdsAmount: number;
  totalInvoiced: number;
  netReceived: number;
  paidCount: number;
  totalCount: number;
  invoices: Invoice[];
}

export function MonthlyTaxSummary({ invoices, currency = "INR" }: MonthlyTaxSummaryProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<MonthlyData | null>(null);

  const monthlyData = useMemo(() => {
    // Filter: only paid invoices with payment_received_date, exclude proformas
    const paidInvoicesWithDate = invoices.filter(inv =>
      inv.document_type !== 'quotation' && inv.document_type !== 'proforma' &&
      inv.status === 'paid' && 
      inv.payment_received_date
    );
    
    const monthlyMap = new Map<string, MonthlyData>();
    
    paidInvoicesWithDate.forEach((invoice) => {
      // Group by payment_received_date for tax calculations
      const date = parseISO(invoice.payment_received_date!);
      const monthKey = format(date, "yyyy-MM");
      const monthDisplay = format(date, "MMM yyyy");
      
      const existing = monthlyMap.get(monthKey) || {
        month: monthDisplay,
        monthKey,
        baseAmount: 0,
        gstAmount: 0,
        tdsAmount: 0,
        totalInvoiced: 0,
        netReceived: 0,
        paidCount: 0,
        totalCount: 0,
        invoices: [] as Invoice[],
      };
      
      const baseAmount = invoice.amount || 0;
      const gstAmount = invoice.tax_amount || 0;
      const tdsAmount = invoice.tds_amount || 0;
      const totalInvoice = baseAmount + gstAmount;
      const netReceived = invoice.net_received_amount || (totalInvoice - tdsAmount);
      
      existing.baseAmount += baseAmount;
      existing.gstAmount += gstAmount;
      existing.tdsAmount += tdsAmount;
      existing.totalInvoiced += totalInvoice;
      existing.netReceived += netReceived;
      existing.paidCount += 1;
      existing.totalCount += 1;
      existing.invoices.push(invoice);
      
      monthlyMap.set(monthKey, existing);
    });
    
    // Sort by month descending
    return Array.from(monthlyMap.values()).sort((a, b) => 
      b.monthKey.localeCompare(a.monthKey)
    );
  }, [invoices]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calculate totals
  const totals = useMemo(() => {
    return monthlyData.reduce(
      (acc, month) => ({
        baseAmount: acc.baseAmount + month.baseAmount,
        gstAmount: acc.gstAmount + month.gstAmount,
        tdsAmount: acc.tdsAmount + month.tdsAmount,
        totalInvoiced: acc.totalInvoiced + month.totalInvoiced,
        netReceived: acc.netReceived + month.netReceived,
      }),
      { baseAmount: 0, gstAmount: 0, tdsAmount: 0, totalInvoiced: 0, netReceived: 0 }
    );
  }, [monthlyData]);

  if (monthlyData.length === 0) {
    return null;
  }

  return (
    <Card className="mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Monthly Tax Summary (by Payment Date)</CardTitle>
                <Badge variant="secondary" className="ml-2">
                  {monthlyData.length} months
                </Badge>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-4 text-sm">
                  <span className="text-muted-foreground">
                    GST: <span className="font-medium text-foreground">{formatCurrency(totals.gstAmount)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    TDS: <span className="font-medium text-foreground">{formatCurrency(totals.tdsAmount)}</span>
                  </span>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Month</TableHead>
                  <TableHead className="text-right">Base Amount</TableHead>
                  <TableHead className="text-right">GST on Payments</TableHead>
                  <TableHead className="text-right">Total Received</TableHead>
                  <TableHead className="text-right">TDS Deducted</TableHead>
                  <TableHead className="text-right">Net Received</TableHead>
                  <TableHead className="text-center">Payments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData.map((month) => (
                  <TableRow key={month.monthKey}>
                    <TableCell className="font-medium">{month.month}</TableCell>
                    <TableCell className="text-right">{formatCurrency(month.baseAmount)}</TableCell>
                    <TableCell className="text-right text-blue-600">{formatCurrency(month.gstAmount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(month.totalInvoiced)}</TableCell>
                    <TableCell className="text-right text-orange-600">{formatCurrency(month.tdsAmount)}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">{formatCurrency(month.netReceived)}</TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant="outline" 
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                        onClick={() => setSelectedMonth(month)}
                      >
                        {month.paidCount}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals Row */}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.baseAmount)}</TableCell>
                  <TableCell className="text-right text-blue-600">{formatCurrency(totals.gstAmount)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.totalInvoiced)}</TableCell>
                  <TableCell className="text-right text-orange-600">{formatCurrency(totals.tdsAmount)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCurrency(totals.netReceived)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <MonthlyPaymentsDialog
        open={!!selectedMonth}
        onOpenChange={(open) => !open && setSelectedMonth(null)}
        monthLabel={selectedMonth?.month || ""}
        invoices={selectedMonth?.invoices || []}
        currency={currency}
      />
    </Card>
  );
}
