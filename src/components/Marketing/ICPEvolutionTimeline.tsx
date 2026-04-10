import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ICPRow } from "@/hooks/useICPData";

interface ICPEvolutionTimelineProps {
  history: ICPRow[];
}

const EVOLVED_BY_LABELS: Record<string, { label: string; className: string }> = {
  onboarding:     { label: "Onboarding",  className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  optimizer:      { label: "Auto",        className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  manual:         { label: "Manual",      className: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  amit_suggestion:{ label: "Amit",        className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  system:         { label: "System",      className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

function ConfidenceDot({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-400";
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${color} mr-1`} />
  );
}

function ICPFieldRow({ label, values }: { label: string; values: string[] }) {
  if (!values || values.length === 0) return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="flex flex-wrap gap-1">
        {values.map((v) => (
          <Badge key={v} variant="outline" className="text-[10px]">
            {v}
          </Badge>
        ))}
      </span>
    </div>
  );
}

function TimelineEntry({ icp, isLatest }: { icp: ICPRow; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(isLatest);
  const meta = EVOLVED_BY_LABELS[icp.evolved_by] ?? { label: icp.evolved_by, className: "bg-gray-100 text-gray-700" };

  return (
    <div className="flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div className={`h-3 w-3 rounded-full border-2 mt-1 shrink-0 ${isLatest ? "border-primary bg-primary" : "border-muted-foreground bg-background"}`} />
        <div className="w-px flex-1 bg-border mt-1" />
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium">Version {icp.version}</span>
                {isLatest && (
                  <Badge className="text-[10px] py-0">Current</Badge>
                )}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.className}`}>
                  {meta.label}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                <ConfidenceDot score={icp.confidence_score} />
                {Math.round(icp.confidence_score * 100)}% confidence ·{" "}
                {new Date(icp.last_evolved_at).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </p>
            </div>
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            )}
          </div>
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5 border rounded-md p-2.5 bg-muted/30">
            {icp.evolution_reason && (
              <p className="text-[10px] text-muted-foreground italic mb-2">
                "{icp.evolution_reason}"
              </p>
            )}
            <ICPFieldRow label="Industries"    values={icp.industries ?? []} />
            <ICPFieldRow label="Designations"  values={icp.designations ?? []} />
            <ICPFieldRow label="Company Sizes" values={icp.company_sizes ?? []} />
            <ICPFieldRow label="Geographies"   values={icp.geographies ?? []} />
            <ICPFieldRow label="Languages"     values={icp.languages ?? []} />
            <ICPFieldRow label="Pain Points"   values={icp.pain_points ?? []} />
            {icp.aha_moment_days != null && (
              <div className="flex gap-2 text-xs">
                <span className="text-muted-foreground w-28 shrink-0">Aha Moment</span>
                <span>{icp.aha_moment_days} days</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ICPEvolutionTimeline({ history }: ICPEvolutionTimelineProps) {
  if (history.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        No ICP history yet.
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {history.map((icp, i) => (
        <TimelineEntry key={icp.id} icp={icp} isLatest={i === 0} />
      ))}
    </div>
  );
}
