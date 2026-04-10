import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, ChevronRight, RefreshCw } from "lucide-react";
import { useCurrentICP } from "@/hooks/useICPData";

interface ICPPanelProps {
  productKey: string;
  productName: string;
  compact?: boolean;
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const variant =
    pct >= 70 ? "default" : pct >= 40 ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="text-[10px] tabular-nums">
      {pct}% confidence
    </Badge>
  );
}

function EvolvedByLabel({ value }: { value: string }) {
  const labels: Record<string, string> = {
    onboarding: "Onboarding",
    optimizer: "Auto",
    manual: "Manual",
    amit_suggestion: "Amit",
    system: "System",
  };
  return (
    <span className="text-muted-foreground">
      {labels[value] ?? value}
    </span>
  );
}

export function ICPPanel({ productKey, productName, compact = false }: ICPPanelProps) {
  const navigate = useNavigate();
  const { data: icp, isLoading } = useCurrentICP(productKey);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center text-xs text-muted-foreground gap-2">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Loading ICP…
        </CardContent>
      </Card>
    );
  }

  if (!icp) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-xs text-muted-foreground">
          No ICP yet for {productName}.{" "}
          <button
            className="underline hover:text-foreground"
            onClick={() => navigate(`/marketing/products/${productKey}/icp`)}
          >
            Create one
          </button>
        </CardContent>
      </Card>
    );
  }

  const chips = (items: string[] | null | undefined, colorClass: string) =>
    (items ?? []).slice(0, compact ? 3 : 7).map((item) => (
      <Badge key={item} variant="outline" className={`text-[10px] ${colorClass}`}>
        {item}
      </Badge>
    ));

  const industries = icp.industries ?? [];
  const designations = icp.designations ?? [];
  const companySizes = icp.company_sizes ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            {productName}
          </CardTitle>
          <div className="flex items-center gap-2">
            <ConfidenceBadge score={icp.confidence_score} />
            <Badge variant="outline" className="text-[10px]">
              v{icp.version}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {industries.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1">Industries</p>
            <div className="flex flex-wrap gap-1">
              {chips(industries, "border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300")}
              {industries.length > (compact ? 3 : 7) && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  +{industries.length - (compact ? 3 : 7)}
                </Badge>
              )}
            </div>
          </div>
        )}
        {designations.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1">Designations</p>
            <div className="flex flex-wrap gap-1">
              {chips(designations, "border-purple-200 text-purple-700 dark:border-purple-800 dark:text-purple-300")}
              {designations.length > (compact ? 3 : 7) && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  +{designations.length - (compact ? 3 : 7)}
                </Badge>
              )}
            </div>
          </div>
        )}
        {companySizes.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1">Company Sizes</p>
            <div className="flex flex-wrap gap-1">
              {chips(companySizes, "border-green-200 text-green-700 dark:border-green-800 dark:text-green-300")}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-1 border-t">
          <p className="text-muted-foreground text-[10px]">
            Evolved by <EvolvedByLabel value={icp.evolved_by} /> ·{" "}
            {new Date(icp.last_evolved_at).toLocaleDateString("en-IN")}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-0.5 px-1"
            onClick={() => navigate(`/marketing/products/${productKey}/icp`)}
          >
            Edit <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
