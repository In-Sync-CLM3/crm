import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Lock } from "lucide-react";

interface Milestone {
  id: string;
  milestone_key: string;
  milestone_name: string;
  trigger_condition: string;
  unlocks: string[];
  reached: boolean;
  reached_at: string | null;
}

export function MilestoneTracker() {
  const { data: milestones, isLoading } = useQuery({
    queryKey: ["mkt-milestones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mkt_milestones")
        .select("*")
        .order("milestone_key", { ascending: true });
      if (error) throw error;
      return (data || []) as Milestone[];
    },
  });

  const { data: customerCount } = useQuery({
    queryKey: ["mkt-customer-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("status", "customer");
      if (error) return 0;
      return count || 0;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Loading milestones...
        </CardContent>
      </Card>
    );
  }

  if (!milestones || milestones.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No milestones configured. Run the database migration to seed milestone data.
        </CardContent>
      </Card>
    );
  }

  const reachedCount = milestones.filter((m) => m.reached).length;
  const totalCount = milestones.length;
  const progressPct = totalCount > 0 ? (reachedCount / totalCount) * 100 : 0;

  // Find next milestone
  const nextMilestone = milestones.find((m) => !m.reached);
  const thresholds: Record<string, number> = {
    M1: 1, M2: 5, M3: 10, M4: 25, M5: 50, M6: 100, M7: 200,
  };
  const nextThreshold = nextMilestone
    ? thresholds[nextMilestone.milestone_key] || 0
    : 0;
  const awayCount = Math.max(0, nextThreshold - (customerCount || 0));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Milestone Progress</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {reachedCount}/{totalCount} reached
          </Badge>
        </div>
        <Progress value={progressPct} className="h-2 mt-2" />
        {nextMilestone && (
          <p className="text-xs text-muted-foreground mt-1">
            Next: <span className="font-medium">{nextMilestone.milestone_name}</span>
            {awayCount > 0 && ` — ${awayCount} client${awayCount !== 1 ? "s" : ""} away`}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {milestones.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-3 p-2 rounded-md text-xs ${
                m.reached
                  ? "bg-green-50 dark:bg-green-950/20"
                  : m === nextMilestone
                  ? "bg-blue-50 dark:bg-blue-950/20"
                  : "opacity-50"
              }`}
            >
              {m.reached ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              ) : m === nextMilestone ? (
                <Circle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{m.milestone_key}</span>
                  <span className="text-muted-foreground">{m.milestone_name}</span>
                  {m.reached && m.reached_at && (
                    <span className="text-muted-foreground ml-auto">
                      {new Date(m.reached_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground mt-0.5">
                  {m.trigger_condition}
                </div>
                {m.unlocks && m.unlocks.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.unlocks.map((u) => (
                      <Badge
                        key={u}
                        variant={m.reached ? "default" : "outline"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {u.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
