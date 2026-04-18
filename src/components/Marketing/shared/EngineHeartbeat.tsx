import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";

interface EngineDailyRow {
  date: string;
  channel: string;
  sent: number;
}

interface Props {
  rows: EngineDailyRow[];
  days: number;
  totalEmail: number;
  totalWa: number;
  totalVisits: number;
  activeCampaigns: number;
}

function buildTimeline(rows: EngineDailyRow[], days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    const email = rows.find(r => r.date === iso && r.channel === "email");
    const wa    = rows.find(r => r.date === iso && r.channel === "whatsapp");
    return { label, email: Number(email?.sent ?? 0), whatsapp: Number(wa?.sent ?? 0) };
  });
}

function trend(rows: EngineDailyRow[]): { label: string; color: string } {
  const last7  = rows.filter(r => new Date(r.date) >= new Date(Date.now() - 7  * 86400_000)).reduce((s, r) => s + Number(r.sent), 0);
  const prev7  = rows.filter(r => {
    const d = new Date(r.date).getTime();
    return d >= Date.now() - 14 * 86400_000 && d < Date.now() - 7 * 86400_000;
  }).reduce((s, r) => s + Number(r.sent), 0);
  if (!prev7) return { label: "—", color: "text-muted-foreground" };
  const pct = ((last7 - prev7) / prev7) * 100;
  if (pct > 5)  return { label: `↗ +${pct.toFixed(0)}% vs prior 7d`, color: "text-emerald-600" };
  if (pct < -5) return { label: `↘ ${pct.toFixed(0)}% vs prior 7d`, color: "text-red-500" };
  return { label: `→ Steady vs prior 7d`, color: "text-amber-600" };
}

export function EngineHeartbeat({ rows, days, totalEmail, totalWa, totalVisits, activeCampaigns }: Props) {
  const timeline = buildTimeline(rows, days);
  const t = trend(rows);

  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm">Marketing Engine · {days}d Output</CardTitle>
            <CardDescription className="text-[10px] mt-0.5">
              {activeCampaigns} active campaign{activeCampaigns !== 1 ? "s" : ""} ·{" "}
              {totalEmail.toLocaleString()} emails · {totalWa.toLocaleString()} WhatsApp ·{" "}
              {totalVisits > 0 ? `${totalVisits.toLocaleString()} landing visits` : "no landing data yet"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 text-[10px]">
            <span className={`font-medium ${t.color}`}>{t.label}</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-sm bg-blue-400" /> Email
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400" /> WhatsApp
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={timeline} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gEmail" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gWa" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <Tooltip
              contentStyle={{ fontSize: 11, padding: "4px 8px", borderRadius: 6 }}
              labelStyle={{ fontSize: 10, fontWeight: 600 }}
              formatter={(v: number, name: string) => [v.toLocaleString(), name === "email" ? "Email" : "WhatsApp"]}
            />
            <Area type="monotone" dataKey="email"    stackId="1" stroke="#3b82f6" strokeWidth={1.5} fill="url(#gEmail)" dot={false} />
            <Area type="monotone" dataKey="whatsapp" stackId="1" stroke="#10b981" strokeWidth={1.5} fill="url(#gWa)"   dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
