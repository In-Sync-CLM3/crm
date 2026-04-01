import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState } from "@/components/common/LoadingState";
import { Megaphone } from "lucide-react";

interface CampaignPerformanceProps {
  days: number;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  leads: number;
  enrollments: number;
  actions: number;
  budget: number;
  spent: number;
  created_at: string;
}

function formatRupees(paise: number): string {
  const r = Math.round((paise ?? 0) / 100);
  if (Math.abs(r) >= 100000) return `\u20B9${(r / 100000).toFixed(2)}L`;
  return `\u20B9${r.toLocaleString("en-IN")}`;
}

function statusBadge(status: string) {
  const lower = status.toLowerCase();
  if (lower === "active") {
    return (
      <Badge className="bg-green-500 hover:bg-green-600 text-white">
        Active
      </Badge>
    );
  }
  if (lower === "paused") {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600 text-white">
        Paused
      </Badge>
    );
  }
  return <Badge variant="secondary">{status}</Badge>;
}

export function CampaignPerformance({ days }: CampaignPerformanceProps) {
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["mkt-dashboard-campaigns", days],
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke(
        "mkt-dashboard-stats",
        {
          body: { days, section: "campaigns" },
        }
      );

      if (error) throw error;

      const list = result?.campaigns ?? result ?? [];
      return (Array.isArray(list) ? list : []) as Campaign[];
    },
  });

  if (isLoading) return <LoadingState message="Loading campaigns..." />;

  if (campaigns.length === 0) {
    return (
      <Card className="p-3">
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Megaphone className="h-10 w-10 mb-3 opacity-50" />
          <p className="text-sm">No campaigns found for this period.</p>
          <p className="text-xs mt-1">
            Campaigns will appear here once they are created in the marketing engine.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-3">
      <CardHeader className="p-0 pb-3">
        <CardTitle className="text-sm">Campaign Performance</CardTitle>
        <p className="text-[10px] text-muted-foreground">
          All campaigns in the last {days} days, sorted by newest first
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs text-center">Status</TableHead>
              <TableHead className="text-xs text-right">Leads</TableHead>
              <TableHead className="text-xs text-right">Enrollments</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
              <TableHead className="text-xs text-right">Budget</TableHead>
              <TableHead className="text-xs text-right">Spent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.id}>
                <TableCell className="text-xs font-medium max-w-[200px] truncate">
                  {campaign.name}
                </TableCell>
                <TableCell className="text-xs capitalize">
                  {campaign.type}
                </TableCell>
                <TableCell className="text-xs text-center">
                  {statusBadge(campaign.status)}
                </TableCell>
                <TableCell className="text-xs text-right">
                  {(campaign.leads ?? 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-right">
                  {(campaign.enrollments ?? 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-right">
                  {(campaign.actions ?? 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-right">
                  {formatRupees(campaign.budget)}
                </TableCell>
                <TableCell className="text-xs text-right">
                  {formatRupees(campaign.spent)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
