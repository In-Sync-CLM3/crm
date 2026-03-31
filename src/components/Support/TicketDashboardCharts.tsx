import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { differenceInHours, format, parseISO, startOfDay } from "date-fns";
import type { SupportTicket } from "@/hooks/useSupportTickets";

interface TicketDashboardChartsProps {
  tickets: SupportTicket[];
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "hsl(0, 84%, 60%)",
  high: "hsl(25, 95%, 53%)",
  medium: "hsl(45, 93%, 47%)",
  low: "hsl(142, 71%, 45%)",
};

const CATEGORY_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const SOURCE_COLORS: Record<string, string> = {
  crm: "hsl(217, 91%, 60%)",
  rmpl: "hsl(271, 91%, 65%)",
  paisaa_saarthi: "hsl(142, 71%, 45%)",
  whatsapp: "hsl(142, 76%, 36%)",
  in_sync_website: "hsl(25, 95%, 53%)",
  website: "hsl(45, 93%, 47%)",
  email: "hsl(0, 84%, 60%)",
  help_widget: "hsl(199, 89%, 48%)",
};

const STATUS_COLORS: Record<string, string> = {
  new: "hsl(217, 91%, 60%)",
  assigned: "hsl(271, 91%, 65%)",
  in_progress: "hsl(45, 93%, 47%)",
  awaiting_client: "hsl(25, 95%, 53%)",
  resolved: "hsl(142, 71%, 45%)",
  closed: "hsl(var(--muted-foreground))",
};

export function TicketDashboardCharts({ tickets }: TicketDashboardChartsProps) {
  const stats = useMemo(() => {
    // Average resolution time (hours) for resolved/closed tickets
    const resolvedTickets = tickets.filter(
      (t) => ["resolved", "closed"].includes(t.status) && t.resolved_at
    );
    const avgResolutionHours = resolvedTickets.length
      ? resolvedTickets.reduce((sum, t) => {
          return sum + differenceInHours(new Date(t.resolved_at!), new Date(t.created_at));
        }, 0) / resolvedTickets.length
      : 0;

    // First response time (placeholder — using time to 'assigned' or 'in_progress')
    const firstResponseTickets = tickets.filter(
      (t) => !["new"].includes(t.status)
    );

    // Category breakdown
    const categoryMap: Record<string, number> = {};
    tickets.forEach((t) => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + 1;
    });
    const categoryData = Object.entries(categoryMap).map(([name, value]) => ({
      name: name.replace(/_/g, " "),
      value,
    }));

    // Priority breakdown
    const priorityMap: Record<string, number> = {};
    tickets.forEach((t) => {
      priorityMap[t.priority] = (priorityMap[t.priority] || 0) + 1;
    });
    const priorityData = Object.entries(priorityMap).map(([name, value]) => ({
      name,
      value,
      fill: PRIORITY_COLORS[name] || "hsl(var(--muted))",
    }));

    // Status breakdown
    const statusMap: Record<string, number> = {};
    tickets.forEach((t) => {
      statusMap[t.status] = (statusMap[t.status] || 0) + 1;
    });
    const statusData = Object.entries(statusMap).map(([name, value]) => ({
      name: name.replace(/_/g, " "),
      value,
      fill: STATUS_COLORS[name] || "hsl(var(--muted))",
    }));

    // Tickets created over last 30 days (daily trend)
    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    const dailyMap: Record<string, { created: number; resolved: number }> = {};
    tickets.forEach((t) => {
      const created = parseISO(t.created_at);
      if (created >= last30) {
        const key = format(startOfDay(created), "MMM d");
        if (!dailyMap[key]) dailyMap[key] = { created: 0, resolved: 0 };
        dailyMap[key].created++;
      }
      if (t.resolved_at) {
        const resolved = parseISO(t.resolved_at);
        if (resolved >= last30) {
          const key = format(startOfDay(resolved), "MMM d");
          if (!dailyMap[key]) dailyMap[key] = { created: 0, resolved: 0 };
          dailyMap[key].resolved++;
        }
      }
    });
    const trendData = Object.entries(dailyMap)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Source breakdown
    const sourceMap: Record<string, number> = {};
    tickets.forEach((t) => {
      const src = t.source || "crm";
      sourceMap[src] = (sourceMap[src] || 0) + 1;
    });
    const sourceData = Object.entries(sourceMap)
      .map(([name, value]) => ({
        name: name.replace(/_/g, " "),
        value,
        fill: SOURCE_COLORS[name] || "hsl(var(--muted))",
      }))
      .sort((a, b) => b.value - a.value);

    // Source-wise detailed breakdown
    const sourceWiseData: {
      source: string;
      sourceKey: string;
      total: number;
      open: number;
      resolved: number;
      overdue: number;
      critical: number;
      avgResolutionHours: number;
    }[] = [];
    const sourceGroups: Record<string, typeof tickets> = {};
    tickets.forEach((t) => {
      const src = t.source || "crm";
      if (!sourceGroups[src]) sourceGroups[src] = [];
      sourceGroups[src].push(t);
    });
    Object.entries(sourceGroups)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([src, srcTickets]) => {
        const open = srcTickets.filter((t) =>
          ["new", "assigned", "in_progress", "awaiting_client"].includes(t.status)
        ).length;
        const resolved = srcTickets.filter((t) =>
          ["resolved", "closed"].includes(t.status)
        ).length;
        const overdue = srcTickets.filter(
          (t) => t.due_at && new Date(t.due_at) < new Date() && !["resolved", "closed"].includes(t.status)
        ).length;
        const critical = srcTickets.filter(
          (t) => t.priority === "critical" && !["resolved", "closed"].includes(t.status)
        ).length;
        const srcResolved = srcTickets.filter(
          (t) => ["resolved", "closed"].includes(t.status) && t.resolved_at
        );
        const srcAvgHours = srcResolved.length
          ? srcResolved.reduce(
              (sum, t) => sum + differenceInHours(new Date(t.resolved_at!), new Date(t.created_at)),
              0
            ) / srcResolved.length
          : 0;
        sourceWiseData.push({
          source: src.replace(/_/g, " "),
          sourceKey: src,
          total: srcTickets.length,
          open,
          resolved,
          overdue,
          critical,
          avgResolutionHours: srcAvgHours,
        });
      });

    return { avgResolutionHours, categoryData, priorityData, statusData, sourceData, sourceWiseData, trendData, resolvedCount: resolvedTickets.length };
  }, [tickets]);

  const formatHours = (h: number) => {
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 24) return `${Math.round(h)}h`;
    return `${(h / 24).toFixed(1)}d`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* KPI Cards Row */}
      <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
        <CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Avg Resolution Time</p>
          <p className="text-3xl font-bold mt-1 text-green-600">{formatHours(stats.avgResolutionHours)}</p>
          <p className="text-xs text-muted-foreground mt-1">across {stats.resolvedCount} resolved tickets</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
        <CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Resolution Rate</p>
          <p className="text-3xl font-bold mt-1 text-blue-600">
            {tickets.length ? Math.round((stats.resolvedCount / tickets.length) * 100) : 0}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">{stats.resolvedCount} of {tickets.length} tickets</p>
        </CardContent>
      </Card>

      {/* Status Pie */}
      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-sm font-medium">By Status</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={stats.statusData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" paddingAngle={2}>
                {stats.statusData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number, name: string) => [value, name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
            {stats.statusData.map((s, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground capitalize">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.fill }} />
                {s.name} ({s.value})
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Priority Pie */}
      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-sm font-medium">By Priority</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={stats.priorityData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" paddingAngle={2}>
                {stats.priorityData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number, name: string) => [value, name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
            {stats.priorityData.map((s, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground capitalize">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.fill }} />
                {s.name} ({s.value})
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Trend Line Chart - spans full width */}
      <Card className="md:col-span-2 xl:col-span-2">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Ticket Trend (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent className="p-2 pr-4">
          {stats.trendData.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">No trend data</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={stats.trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="created" stroke="hsl(var(--primary))" name="Created" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="resolved" stroke="hsl(142, 71%, 45%)" name="Resolved" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Category Bar Chart */}
      <Card className="md:col-span-2 xl:col-span-2">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Tickets by Category</CardTitle>
        </CardHeader>
        <CardContent className="p-2 pr-4">
          {stats.categoryData.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.categoryData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="value" name="Tickets" radius={[4, 4, 0, 0]}>
                  {stats.categoryData.map((_, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Source-wise Detailed Breakdown */}
      <Card className="md:col-span-2 xl:col-span-4">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Source-wise Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-2 px-4">
          {stats.sourceWiseData.length === 0 ? (
            <div className="h-[100px] flex items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Source</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide text-center">Total</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide text-center">Open</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide text-center">Resolved</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide text-center">Overdue</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide text-center">Critical</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide text-center">Avg Resolution</th>
                    <th className="py-2 pl-3 font-medium text-muted-foreground text-xs uppercase tracking-wide text-center">Resolution %</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sourceWiseData.map((row) => {
                    const resRate = row.total ? Math.round((row.resolved / row.total) * 100) : 0;
                    return (
                      <tr key={row.sourceKey} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2.5 pr-4">
                          <span className="flex items-center gap-2 capitalize font-medium">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: SOURCE_COLORS[row.sourceKey] || "hsl(var(--muted-foreground))" }}
                            />
                            {row.source}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold">{row.total}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-blue-600 font-medium">{row.open}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-green-600 font-medium">{row.resolved}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {row.overdue > 0 ? (
                            <span className="text-destructive font-medium">{row.overdue}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {row.critical > 0 ? (
                            <span className="text-orange-600 font-medium">{row.critical}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center text-muted-foreground">
                          {row.resolved > 0 ? formatHours(row.avgResolutionHours) : "-"}
                        </td>
                        <td className="py-2.5 pl-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${resRate}%`,
                                  backgroundColor: resRate >= 80 ? "hsl(142, 71%, 45%)" : resRate >= 50 ? "hsl(45, 93%, 47%)" : "hsl(0, 84%, 60%)",
                                }}
                              />
                            </div>
                            <span className="text-xs font-medium w-8">{resRate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Source Bar Chart */}
      <Card className="md:col-span-2 xl:col-span-4">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Tickets by Source</CardTitle>
        </CardHeader>
        <CardContent className="p-2 pr-4">
          {stats.sourceData.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.sourceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="value" name="Tickets" radius={[0, 4, 4, 0]}>
                  {stats.sourceData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
