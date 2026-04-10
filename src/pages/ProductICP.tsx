import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Edit, RefreshCw, Target } from "lucide-react";
import { ICPArrayEditor } from "@/components/Marketing/ICPArrayEditor";
import { ICPEvolutionTimeline } from "@/components/Marketing/ICPEvolutionTimeline";
import { useCurrentICP, useICPHistory, useUpdateICP, ICPPatch } from "@/hooks/useICPData";

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const variant = pct >= 70 ? "default" : pct >= 40 ? "secondary" : "outline";
  return <Badge variant={variant}>{pct}% confidence</Badge>;
}

const EVOLVED_BY_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  optimizer: "Auto-evolved",
  manual: "Manual edit",
  amit_suggestion: "Amit suggestion",
  system: "System",
};

export default function ProductICP() {
  const { productKey } = useParams<{ productKey: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: icp, isLoading: icpLoading } = useCurrentICP(productKey ?? "");
  const { data: history = [], isLoading: historyLoading } = useICPHistory(productKey ?? "");
  const updateICP = useUpdateICP();

  // Edit dialog state — initialised from current ICP when opened
  const [editOpen, setEditOpen] = useState(false);
  const [patch, setPatch] = useState<ICPPatch>({});
  const [editReason, setEditReason] = useState("");

  const openEdit = () => {
    if (!icp) return;
    setPatch({
      industries:      [...icp.industries],
      company_sizes:   [...icp.company_sizes],
      designations:    [...icp.designations],
      geographies:     [...icp.geographies],
      languages:       [...icp.languages],
      pain_points:     [...icp.pain_points],
      aha_moment_days: icp.aha_moment_days,
      budget_range:    { ...icp.budget_range },
    });
    setEditReason("");
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!productKey || !editReason.trim()) {
      toast({ title: "Reason required", description: "Describe why you're updating this ICP.", variant: "destructive" });
      return;
    }
    try {
      await updateICP.mutateAsync({ productKey, icpPatch: patch, reason: editReason.trim() });
      toast({ title: "ICP updated", description: `Version ${(icp?.version ?? 0) + 1} saved.` });
      setEditOpen(false);
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  if (!productKey) return null;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/marketing/products")} className="gap-1.5 -ml-1">
              <ArrowLeft className="h-4 w-4" />
              Products
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <div>
                <h1 className="text-lg font-bold leading-none">{productKey}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Ideal Customer Profile</p>
              </div>
            </div>
          </div>
          {icp && (
            <Button size="sm" onClick={openEdit} className="gap-1.5">
              <Edit className="h-3.5 w-3.5" />
              Edit ICP
            </Button>
          )}
        </div>

        {icpLoading ? (
          <Card>
            <CardContent className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading ICP…
            </CardContent>
          </Card>
        ) : !icp ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No ICP found for <span className="font-mono">{productKey}</span>. Onboarding must complete first.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Current ICP */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm">Current ICP</CardTitle>
                  <div className="flex items-center gap-2">
                    <ConfidenceBadge score={icp.confidence_score} />
                    <Badge variant="outline" className="text-xs">v{icp.version}</Badge>
                    <Badge variant="secondary" className="text-xs">
                      {EVOLVED_BY_LABELS[icp.evolved_by] ?? icp.evolved_by}
                    </Badge>
                  </div>
                </div>
                {icp.evolution_reason && (
                  <p className="text-xs text-muted-foreground italic mt-1">
                    "{icp.evolution_reason}"
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Last evolved {new Date(icp.last_evolved_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <ICPFieldDisplay label="Industries"    values={icp.industries ?? []}    color="blue" />
                <ICPFieldDisplay label="Designations"  values={icp.designations ?? []}  color="purple" />
                <ICPFieldDisplay label="Company Sizes" values={icp.company_sizes ?? []} color="green" />
                <ICPFieldDisplay label="Geographies"   values={icp.geographies ?? []}   color="orange" />
                <ICPFieldDisplay label="Languages"     values={icp.languages ?? []}     color="teal" />
                <ICPFieldDisplay label="Pain Points"   values={icp.pain_points ?? []}   color="red" />
                {icp.aha_moment_days != null && (
                  <div>
                    <p className="text-xs font-medium mb-1.5">Aha Moment</p>
                    <p className="text-sm">{icp.aha_moment_days} days</p>
                  </div>
                )}
                {(icp.budget_range.min_paise > 0 || icp.budget_range.max_paise > 0) && (
                  <div>
                    <p className="text-xs font-medium mb-1.5">Budget Range</p>
                    <p className="text-sm">
                      ₹{(icp.budget_range.min_paise / 100).toLocaleString("en-IN")} –{" "}
                      ₹{(icp.budget_range.max_paise / 100).toLocaleString("en-IN")} / mo
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Version History */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Version History</CardTitle>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Loading history…
                  </div>
                ) : (
                  <ICPEvolutionTimeline history={history} />
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit ICP — {productKey}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <ICPArrayEditor
              label="Industries"
              values={(patch.industries as string[]) ?? []}
              onChange={(v) => setPatch((p) => ({ ...p, industries: v }))}
              placeholder="e.g. Finance, Healthcare"
            />
            <ICPArrayEditor
              label="Designations / Job Titles"
              values={(patch.designations as string[]) ?? []}
              onChange={(v) => setPatch((p) => ({ ...p, designations: v }))}
              placeholder="e.g. CFO, VP Finance"
            />
            <ICPArrayEditor
              label="Company Sizes"
              values={(patch.company_sizes as string[]) ?? []}
              onChange={(v) => setPatch((p) => ({ ...p, company_sizes: v }))}
              placeholder="e.g. 50-200, 201-500"
            />
            <ICPArrayEditor
              label="Geographies"
              values={(patch.geographies as string[]) ?? []}
              onChange={(v) => setPatch((p) => ({ ...p, geographies: v }))}
              placeholder="e.g. Mumbai, Bangalore"
            />
            <ICPArrayEditor
              label="Languages"
              values={(patch.languages as string[]) ?? []}
              onChange={(v) => setPatch((p) => ({ ...p, languages: v }))}
              placeholder="e.g. en, hi"
            />
            <ICPArrayEditor
              label="Pain Points"
              values={(patch.pain_points as string[]) ?? []}
              onChange={(v) => setPatch((p) => ({ ...p, pain_points: v }))}
              placeholder="e.g. manual reconciliation, compliance gaps"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Aha Moment (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={patch.aha_moment_days ?? ""}
                  onChange={(e) =>
                    setPatch((p) => ({
                      ...p,
                      aha_moment_days: e.target.value ? parseInt(e.target.value, 10) : null,
                    }))
                  }
                  placeholder="e.g. 14"
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
            <Separator />
            <div>
              <Label className="text-xs">
                Reason for this edit <span className="text-destructive">*</span>
              </Label>
              <Input
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. Finance sector showing 3× conversion rate"
                className="h-8 text-xs mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateICP.isPending || !editReason.trim()}
            >
              {updateICP.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Save as v{(icp?.version ?? 0) + 1}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function ICPFieldDisplay({
  label,
  values,
  color,
}: {
  label: string;
  values: string[];
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue:   "border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300",
    purple: "border-purple-200 text-purple-700 dark:border-purple-800 dark:text-purple-300",
    green:  "border-green-200 text-green-700 dark:border-green-800 dark:text-green-300",
    orange: "border-orange-200 text-orange-700 dark:border-orange-800 dark:text-orange-300",
    teal:   "border-teal-200 text-teal-700 dark:border-teal-800 dark:text-teal-300",
    red:    "border-red-200 text-red-700 dark:border-red-800 dark:text-red-300",
  };
  if (!values || values.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <Badge key={v} variant="outline" className={`text-[10px] ${colorMap[color] ?? ""}`}>
            {v}
          </Badge>
        ))}
      </div>
    </div>
  );
}
