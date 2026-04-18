import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageCircle, Flame } from "lucide-react";

interface HotLead {
  lead_id: string;
  full_name: string;
  company: string;
  product_key: string;
  channels: string[] | null;
  opens: number;
  clicks: number;
  replies: number;
  wa_delivered: number;
  fit_score: number;
  intent_score: number;
  db_eng_score: number;
  activity_score: number;
  total_score: number;
  last_activity: string | null;
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email:    <Mail className="h-3 w-3 text-blue-500" />,
  whatsapp: <MessageCircle className="h-3 w-3 text-emerald-500" />,
};

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1 rounded-full bg-muted overflow-hidden w-12">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1)  return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function HotLeads({ leads }: { leads: HotLead[] }) {
  if (!leads.length) return null;
  const maxScore = Math.max(...leads.map(l => Number(l.total_score)), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <CardTitle className="text-sm">Hot Leads · Most Likely to Convert</CardTitle>
        </div>
        <CardDescription className="text-[10px]">
          Ranked by fit + intent + engagement score · opens×1 · clicks×3 · replies×10
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="border-b text-[10px] text-muted-foreground">
                <th className="text-left font-medium px-4 py-2">Contact</th>
                <th className="text-left font-medium px-3 py-2">Product</th>
                <th className="text-left font-medium px-3 py-2">Channels</th>
                <th className="text-right font-medium px-3 py-2">Opens</th>
                <th className="text-right font-medium px-3 py-2">Clicks</th>
                <th className="text-right font-medium px-3 py-2">Replies</th>
                <th className="text-left font-medium px-3 py-2">Score</th>
                <th className="text-right font-medium px-4 py-2">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((lead, i) => (
                <tr key={lead.lead_id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground w-4 text-right flex-shrink-0">#{i + 1}</span>
                      <div>
                        <div className="font-medium leading-tight">
                          {lead.full_name.trim() || "Unknown"}
                        </div>
                        {lead.company && (
                          <div className="text-[9px] text-muted-foreground">{lead.company}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-mono">
                      {lead.product_key}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {(lead.channels ?? []).map(ch => (
                        <span key={ch} title={ch}>{CHANNEL_ICONS[ch] ?? <span className="text-[9px]">{ch}</span>}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(lead.opens).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-600">{Number(lead.clicks).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-600">{Number(lead.replies).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ScoreBar value={Number(lead.total_score)} max={maxScore} color="#f97316" />
                      <span className="tabular-nums text-[10px] font-bold text-orange-600">
                        {Number(lead.total_score)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {timeAgo(lead.last_activity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
