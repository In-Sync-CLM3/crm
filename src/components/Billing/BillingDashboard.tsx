import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Clock, AlertTriangle, IndianRupee, Plus } from "lucide-react";
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
  const invoices = useMemo(() => documents.filter(d => d.doc_type === "invoice"), [documents]);

  const totalRevenue = useMemo(() => invoices.filter(d => d.status === "paid").reduce((s, d) => s + d.total_amount, 0), [invoices]);
  const outstanding = useMemo(() => invoices.filter(d => ["sent", "partially_paid"].includes(d.status)).reduce((s, d) => s + d.balance_due, 0), [invoices]);
  const overdue = useMemo(() => invoices.filter(d => d.status === "overdue").reduce((s, d) => s + d.balance_due, 0), [invoices]);

  const thisMonth = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return invoices.filter(d => d.doc_date?.startsWith(prefix)).reduce((s, d) => s + d.total_amount, 0);
  }, [invoices]);

  // Monthly data for bar chart
  const monthlyData = useMemo(() => {
    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    const data = months.map(m => ({ month: m, amount: 0 }));
    invoices.forEach(inv => {
      const d = new Date(inv.doc_date);
      const monthIdx = (d.getMonth() - 3 + 12) % 12; // FY starts April
      if (monthIdx >= 0 && monthIdx < 12) {
        data[monthIdx].amount += inv.total_amount;
      }
    });
    return data;
  }, [invoices]);

  // Client-wise revenue for pie chart
  const pieData = useMemo(() => {
    const clientRev: Record<string, number> = {};
    invoices.forEach(d => {
      const name = d.client_name || "Unknown";
      clientRev[name] = (clientRev[name] || 0) + d.total_amount;
    });
    return Object.entries(clientRev)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name: name.split(" ").slice(0, 2).join(" "), value }));
  }, [invoices]);

  const kpiCards = [
    { label: "Total Revenue", value: formatCurrencyINR(totalRevenue), sub: "Paid invoices", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", filter: "paid" },
    { label: "Outstanding", value: formatCurrencyINR(outstanding), sub: `${invoices.filter(d => ["sent", "partially_paid"].includes(d.status)).length} invoices`, icon: Clock, color: "text-amber-600", bg: "bg-amber-50", filter: "sent" },
    { label: "Overdue", value: formatCurrencyINR(overdue), sub: `${invoices.filter(d => d.status === "overdue").length} invoices`, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", filter: "overdue" },
    { label: "This Month", value: formatCurrencyINR(thisMonth), sub: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }), icon: IndianRupee, color: "text-blue-600", bg: "bg-blue-50", filter: "all" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Billing Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Financial overview</p>
        </div>
        <Button onClick={onCreateInvoice}><Plus className="h-4 w-4 mr-1" />New Invoice</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(card => (
          <Card
            key={card.label}
            className="p-5 cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-border"
            onClick={() => onCardClick?.(card.filter)}
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
              <BarChart data={monthlyData} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#999" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#999" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(Number(v) / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v) => [formatCurrencyINR(Number(v)), "Revenue"]} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }} />
                <Bar dataKey="amount" fill="#1a5276" radius={[6, 6, 0, 0]} />
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
                documents.slice(0, 7).map(d => (
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
    </div>
  );
}
