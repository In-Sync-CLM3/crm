import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LoadingState } from "@/components/common/LoadingState";
import { Mail, MessageCircle, Phone, Radio } from "lucide-react";

interface ChannelAnalyticsProps {
  days: number;
}

interface ChannelData {
  channel: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  failed: number;
}

const channelIcons: Record<string, typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  call: Phone,
};

const channelColors: Record<string, string> = {
  email: "text-blue-500",
  whatsapp: "text-green-500",
  call: "text-purple-500",
};

function safePct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return parseFloat((((numerator ?? 0) / denominator) * 100).toFixed(1));
}

export function ChannelAnalytics({ days }: ChannelAnalyticsProps) {
  const { effectiveOrgId } = useOrgContext();

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["mkt-dashboard-channels", effectiveOrgId, days],
    queryFn: async () => {
      if (!effectiveOrgId) return [];

      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: actions, error } = await supabase
        .from("mkt_sequence_actions")
        .select("channel, status, delivered_at, opened_at, clicked_at, replied_at")
        .eq("org_id", effectiveOrgId)
        .gte("created_at", since);

      if (error) throw error;
      if (!actions) return [];

      const channelMap: Record<string, ChannelData> = {};

      for (const action of actions) {
        const ch = action.channel as string;
        if (!channelMap[ch]) {
          channelMap[ch] = { channel: ch, sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0 };
        }
        if (["sent", "delivered", "bounced"].includes(action.status as string)) channelMap[ch].sent++;
        if (action.delivered_at) channelMap[ch].delivered++;
        if (action.opened_at) channelMap[ch].opened++;
        if (action.clicked_at) channelMap[ch].clicked++;
        if (action.replied_at) channelMap[ch].replied++;
        if (action.status === "bounced") channelMap[ch].bounced++;
        if (action.status === "failed") channelMap[ch].failed++;
      }

      return Object.values(channelMap) as ChannelData[];
    },
    enabled: !!effectiveOrgId,
  });

  if (isLoading) return <LoadingState message="Loading channel data..." />;

  if (channels.length === 0) {
    return (
      <Card className="p-3">
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Radio className="h-10 w-10 mb-3 opacity-50" />
          <p className="text-sm">No channel performance data found.</p>
          <p className="text-xs mt-1">
            Data will appear once marketing actions (emails, WhatsApp, calls) are sent.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {channels.map((ch) => {
        const Icon = channelIcons[ch.channel.toLowerCase()] ?? Mail;
        const color = channelColors[ch.channel.toLowerCase()] ?? "text-muted-foreground";

        const deliveryRate = safePct(ch.delivered, ch.sent);
        const clickRate = safePct(ch.clicked, ch.delivered);
        const openRate = safePct(ch.opened, ch.delivered);
        const replyRate = safePct(ch.replied, ch.sent);
        const bounceRate = safePct(ch.bounced, ch.sent);

        const metrics = [
          { label: "Sent", value: ch.sent },
          { label: "Delivered", value: ch.delivered },
          { label: "Clicked", value: ch.clicked },
          { label: "Opened", value: ch.opened, dim: true },
          { label: "Replied", value: ch.replied },
          { label: "Bounced", value: ch.bounced, warn: true },
          { label: "Failed", value: ch.failed, warn: true },
        ];

        const funnelSteps = [
          { label: "Sent", value: ch.sent, pct: 100 },
          { label: "Delivered", value: ch.delivered, pct: deliveryRate },
          { label: "Clicked", value: ch.clicked, pct: clickRate },
        ];

        const rates = [
          { label: "Delivery Rate", value: deliveryRate },
          { label: "Click Rate", value: clickRate },
          { label: "Bounce Rate", value: bounceRate, warn: bounceRate > 5 },
          { label: "Open Rate (pixel)", value: openRate, dim: true },
          { label: "Reply Rate", value: replyRate },
        ];

        return (
          <Card key={ch.channel} className="p-3">
            <CardHeader className="p-0 pb-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${color}`} />
                <CardTitle className="text-sm capitalize">{ch.channel}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-3">
              {/* Funnel Progress */}
              <div className="space-y-1.5">
                {funnelSteps.map((step, i) => (
                  <div key={step.label}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {i > 0 && <span className="mr-1 opacity-40">↳</span>}
                        {step.label}
                      </span>
                      <span className="text-[10px] font-medium">
                        {(step.value ?? 0).toLocaleString()}
                        {i > 0 && <span className="text-muted-foreground ml-1">({step.pct}%)</span>}
                      </span>
                    </div>
                    <Progress
                      value={step.pct}
                      className={`h-2 ${i === 2 ? "bg-blue-100 [&>div]:bg-blue-500" : i === 1 ? "bg-emerald-100 [&>div]:bg-emerald-500" : ""}`}
                    />
                  </div>
                ))}
              </div>

              {/* Counts Grid */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t">
                {metrics.map((m) => (
                  <div key={m.label} className="text-center">
                    <div className={`text-base font-bold ${m.warn ? "text-red-500" : m.dim ? "text-muted-foreground" : ""}`}>
                      {(m.value ?? 0).toLocaleString()}
                    </div>
                    <div className={`text-[10px] ${m.warn ? "text-red-400" : m.dim ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                      {m.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Rate Progress Bars */}
              <div className="space-y-2 pt-2 border-t">
                {rates.map((rate) => (
                  <div key={rate.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] ${rate.dim ? "text-muted-foreground/60" : rate.warn ? "text-red-400" : "text-muted-foreground"}`}>
                        {rate.label}
                      </span>
                      <span className={`text-[10px] font-medium ${rate.dim ? "text-muted-foreground/60" : rate.warn ? "text-red-500" : ""}`}>
                        {rate.value}%
                      </span>
                    </div>
                    <Progress
                      value={rate.value}
                      className={`h-1.5 ${rate.dim ? "opacity-40" : rate.warn ? "[&>div]:bg-red-500" : ""}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
