import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["mkt-dashboard-channels", days],
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke(
        "mkt-dashboard-stats",
        {
          body: { days, section: "channels" },
        }
      );

      if (error) throw error;

      const list = result?.channels ?? result ?? [];
      return (Array.isArray(list) ? list : []) as ChannelData[];
    },
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

        const openRate = safePct(ch.opened, ch.delivered);
        const clickRate = safePct(ch.clicked, ch.opened);
        const replyRate = safePct(ch.replied, ch.sent);
        const deliveryRate = safePct(ch.delivered, ch.sent);

        const metrics = [
          { label: "Sent", value: ch.sent },
          { label: "Delivered", value: ch.delivered },
          { label: "Opened", value: ch.opened },
          { label: "Clicked", value: ch.clicked },
          { label: "Replied", value: ch.replied },
          { label: "Failed", value: ch.failed },
        ];

        const rates = [
          { label: "Delivery Rate", value: deliveryRate },
          { label: "Open Rate", value: openRate },
          { label: "Click Rate", value: clickRate },
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
              {/* Counts Grid */}
              <div className="grid grid-cols-3 gap-2">
                {metrics.map((m) => (
                  <div key={m.label} className="text-center">
                    <div className="text-lg font-bold">{(m.value ?? 0).toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">{m.label}</div>
                  </div>
                ))}
              </div>

              {/* Rate Progress Bars */}
              <div className="space-y-2 pt-2 border-t">
                {rates.map((rate) => (
                  <div key={rate.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">{rate.label}</span>
                      <span className="text-[10px] font-medium">{rate.value}%</span>
                    </div>
                    <Progress
                      value={rate.value}
                      className="h-1.5"
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
