import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Clock, AlertTriangle, IndianRupee, Plus, FileX2 } from "lucide-react";
import { formatCurrencyINR, statusLabel } from "@/utils/billingUtils";
import { DOC_TYPE_LABELS, DOC_TYPE_COLORS, STATUS_COLORS } from "@/types/billing";
import type { BillingDocument } from "@/types/billing";

const PIE_COLORS = ["#1a5276", "#2e86c1", "#3498db", "#85c1e9", "#aed6f1"];

interface BillingDashboardProps {
  documents: BillingDocument[];
  onCreateInvoice: () => void;
  onViewDocument: (id: string) => void;
  onCardClick?: (filter: string) => void;
}

export function BillingDashboard({ documents, onCreateInvoice, onViewDocument, onCardClick }: BillingDashboardProps) {
  // All billable documents (invoices + proformas)
  const billable = useMemo(() => documents.filter(d => d.doc_type === "invoice" || d.doc_type === "proforma"), [documents]);
  const invoices = useMemo(() => documents.filter(d => d.doc_type === "invoice"), [documents]);
  const creditNotes = useMemo(() => documents.filter(d => d.doc_type === "credit_note"), [documents]);

  // Revenue = paid invoices + paid proformas
  const totalRevenue = useMemo(() =>
    billable.filter(d => d.status === "paid").reduce((s, d) => s + d.total_amount, 0),
  [billable]);

  const outstanding = useMemo(() =>
    billable.filter(d => ["sent", "partially_paid"].includes(d.status)).reduce((s, d) => s + d.balance_due, 0),
  [billable]);

  const overdue = useMemo(() =>
    billable.filter(d => d.status === "overdue").reduce((s, d) => s + d.balance_due, 0),
  [billable]);

  const totalCreditNotes = useMemo(() =>
    creditNotes.reduce((s, d) => s + d.total_amount, 0),
  [creditNotes]);

  // This month: all billable documents generated this month (exclude draft/cancelled)
  const thisMonthPrefix = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const thisMonthDocs = useMemo(() =>
    billable.filter(d => d.doc_date?.startsWith(thisMonthPrefix) && !["draft", "cancelled"].includes(d.status)),
  [billable, thisMonthPrefix]);
  const thisMonth = useMemo(() =>
    thisMonthDocs.reduce((s, d) => s + d.total_amount, 0),
  [thisMonthDocs]);

  // Monthly data for bar chart — includes both invoices and proformas
  const monthlyData = useMemo(() => {
    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    const data = months.map(m => ({ month: m, invoices: 0, proformas: 0 }));
    billable.forEach(doc => {
      const d = new Date(doc.doc_date);
      const monthIdx = (d.getMonth() - 3 + 12) % 12; // FY starts April
      if (monthIdx >= 0 && monthIdx < 12) {
        if (doc.doc_type === "invoice") {
          data[monthIdx].invoices += doc.total_amount;
        } else {
          data[monthIdx].proformas += doc.total_amount;
        }
      }
    });
    return data;
  }, [billable]);

  // Client-wise revenue for pie chart — includes both invoices and proformas
  const pieData = useMemo(() => {
    const clientRev: Record<string, number> = {};
    billable.forEach(d => {
      const name = d.client_name || "Unknown";
      clientRev[name] = (clientRev[name] || 0) + d.total_amount;
    });
    return Object.entries(clientRev)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name: name.split(" ").slice(0, 2).join(" "), value }));
  }, [billable]);

  const thisMonthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Document lists for each card dialog
  const cardDocMap = useMemo<Record<string, BillingDocument[]>>(() => ({
    paid: billable.filter(d => d.status === "paid"),
    sent: billable.filter(d => ["sent", "partially_paid"].includes(d.status)),
    overdue: billable.filter(d => d.status === "overdue"),
    this_month: thisMonthDocs,
    credit_notes: creditNotes,
  }), [billable, thisMonthDocs, creditNotes]);

  const [dialogCard, setDialogCard] = useState<string | null>(null);
  const dialogDocs = dialogCard ? (cardDocMap[dialogCard] || []) : [];

  const kpiCards = [
    { label: "Total Revenue", value: formatCurrencyINR(totalRevenue), sub: "Paid documents", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", filter: "paid" },
    { label: "Outstanding", value: formatCurrencyINR(outstanding), sub: `${billable.filter(d => ["sent", "partially_paid"].includes(d.status)).length} documents`, icon: Clock, color: "text-amber-600", bg: "bg-amber-50", filter: "sent" },
    { label: "Overdue", value: formatCurrencyINR(overdue), sub: `${billable.filter(d => d.status === "overdue").length} documents`, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", filter: "overdue" },
    { label: "This Month", value: formatCurrencyINR(thisMonth), sub: thisMonthLabel, icon: IndianRupee, color: "text-blue-600", bg: "bg-blue-50", filter: "this_month" },
    { label: "Credit Notes", value: formatCurrencyINR(totalCreditNotes), sub: `${creditNotes.length} issued`, icon: FileX2, color: "text-red-600", bg: "bg-red-50", filter: "credit_notes" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Billing Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Financial overview</p>
        </div>
        <Button onClick={onCreateInvoice}><Plus className="h-4 w-4 mr-1" />New Proforma Invoice</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {kpiCards.map(card => (
          <Card
            key={card.label}
            className="p-5 cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-border"
            onClick={() => setDialogCard(card.filter)}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
              </div>
              <div className={`p-2.5 rounded-xl ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#999" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#999" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(Number(v) / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v, name) => [formatCurrencyINR(Number(v)), name === "invoices" ? "Tax Invoices" : "Proforma Invoices"]} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }} />
                <Bar dataKey="invoices" fill="#1a5276" radius={[6, 6, 0, 0]} name="Tax Invoices" stackId="revenue" />
                <Bar dataKey="proformas" fill="#3498db" radius={[6, 6, 0, 0]} name="Proforma Invoices" stackId="revenue" />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Client-wise Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrencyINR(Number(v))} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Documents */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Documents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No documents yet. Create your first invoice.</TableCell>
                </TableRow>
              ) : (
                documents.slice(0, 10).map(d => (
                  <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onViewDocument(d.id)}>
                    <TableCell className="font-semibold text-primary">{d.doc_number}</TableCell>
                    <TableCell><Badge variant="secondary" className={DOC_TYPE_COLORS[d.doc_type]}>{DOC_TYPE_LABELS[d.doc_type]}</Badge></TableCell>
                    <TableCell>{d.client_name}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrencyINR(d.total_amount)}</TableCell>
                    <TableCell><Badge variant="secondary" className={STATUS_COLORS[d.status]}>{statusLabel(d.status)}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{d.doc_date}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Card Detail Dialog */}
      <Dialog open={!!dialogCard} onOpenChange={(o) => !o && setDialogCard(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              {kpiCards.find(c => c.filter === dialogCard)?.label} ({dialogDocs.length})
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {dialogCard === "this_month" ? thisMonthLabel : "All matching documents"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {dialogDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No records found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Doc #</TableHead>
                    <TableHead className="text-xs">Client</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dialogDocs.map(d => (
                    <TableRow
                      key={d.id}
                      className="cursor-pointer hover:bg-muted/50 h-8"
                      onClick={() => { setDialogCard(null); onViewDocument(d.id); }}
                    >
                      <TableCell className="text-xs font-medium text-primary">{d.doc_number}</TableCell>
                      <TableCell className="text-xs">{d.client_name || "-"}</TableCell>
                      <TableCell className="text-xs">{d.doc_date}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{formatCurrencyINR(d.total_amount)}</TableCell>
                      <TableCell><Badge variant="secondary" className={`text-xs ${STATUS_COLORS[d.status]}`}>{statusLabel(d.status)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
