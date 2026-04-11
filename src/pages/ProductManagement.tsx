import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Package,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Target,
  Circle,
  Minus,
  Trash2,
  RotateCcw,
  Globe,
  ExternalLink,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Product {
  id: string;
  org_id: string;
  product_key: string;
  product_name: string;
  product_url: string | null;
  supabase_url: string | null;
  active: boolean;
  onboarding_status: string;
  trial_days: number;
  price_starter_monthly_paise: number | null;
  price_growth_monthly_paise: number | null;
  last_synced_at: string | null;
  created_at: string;
}

interface OnboardingStep {
  id: string;
  org_id: string;
  product_key: string;
  step_name: string;
  step_order: number;
  status: "pending" | "in_progress" | "complete" | "failed" | "skipped";
  scheduled_for: string | null;
  completed_at: string | null;
  error: string | null;
  attempts: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_META: Record<string, { label: string; description: string }> = {
  register:           { label: "Register",  description: "Create product record" },
  schema_sniff:       { label: "Schema",    description: "Detect DB structure" },
  icp_infer:          { label: "ICP",       description: "Infer ideal customer" },
  email_templates:    { label: "Emails",    description: "Generate 15 templates" },
  whatsapp_templates: { label: "WhatsApp",  description: "Generate 4 templates" },
  call_scripts:       { label: "Scripts",   description: "Generate 4 call scripts" },
  campaign_create:    { label: "Campaign",  description: "Create outbound campaign" },
  source_leads:       { label: "Leads",     description: "Build contact pool" },
  vapi_assistants:    { label: "Vapi",      description: "Create AI voice agents" },
};

// Steps where resetting also deletes previous output — requires confirmation
const DESTRUCTIVE_RESET_STEPS = new Set([
  "icp_infer", "email_templates", "whatsapp_templates",
  "call_scripts", "campaign_create",
]);

// Steps that can't be manually reset (register is foundation; source_leads resets monthly)
const NON_RESETTABLE_STEPS = new Set(["register"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function callProductManager(token: string, body: Record<string, unknown>) {
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mkt-product-manager`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return session.access_token;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// StepStatusText — compact status label shown next to each step
// ---------------------------------------------------------------------------

function StepStatusText({ step }: { step: OnboardingStep }) {
  const now = new Date();
  const isDeferred =
    step.status === "pending" &&
    step.scheduled_for !== null &&
    new Date(step.scheduled_for) > now;

  if (step.status === "in_progress") return <span className="text-blue-500">running…</span>;
  if (step.status === "complete")    return <span className="text-green-600">done</span>;
  if (step.status === "skipped")     return <span className="text-muted-foreground">skipped</span>;
  if (isDeferred) {
    const days = daysUntil(step.scheduled_for!);
    return <span className="text-muted-foreground">in {days}d</span>;
  }
  if (step.status === "failed") {
    const msg = step.error ?? "failed";
    return (
      <span className="text-red-500 truncate max-w-[160px]" title={msg}>
        {msg.length > 35 ? msg.slice(0, 35) + "…" : msg}
      </span>
    );
  }
  return <span className="text-muted-foreground">queued</span>;
}

// ---------------------------------------------------------------------------
// StepIcon
// ---------------------------------------------------------------------------

function StepIcon({ step }: { step: OnboardingStep }) {
  const now = new Date();
  const isDeferred =
    step.status === "pending" &&
    step.scheduled_for !== null &&
    new Date(step.scheduled_for) > now;

  if (step.status === "complete")   return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  if (step.status === "in_progress") return <RefreshCw className="h-4 w-4 text-blue-500 shrink-0 animate-spin" />;
  if (step.status === "failed")     return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  if (step.status === "skipped")    return <Minus className="h-4 w-4 text-muted-foreground shrink-0" />;
  if (isDeferred)                   return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />;
}

// ---------------------------------------------------------------------------
// StepRerunButton — per-step reset + rerun
// ---------------------------------------------------------------------------

function StepRerunButton({
  step,
  product,
  effectiveOrgId,
}: {
  step: OnboardingStep;
  product: Product;
  effectiveOrgId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const now = new Date();
  const isDeferred =
    step.status === "pending" &&
    step.scheduled_for !== null &&
    new Date(step.scheduled_for) > now;
  const isActive = step.status === "in_progress" || (step.status === "pending" && !isDeferred);

  // Don't show for non-resettable steps or actively running/queued steps
  if (NON_RESETTABLE_STEPS.has(step.step_name) || isActive) return null;

  const doReset = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await callProductManager(token, {
        mode: "reset_step",
        org_id: effectiveOrgId,
        product_key: product.product_key,
        step_name: step.step_name,
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: `${STEP_META[step.step_name]?.label ?? step.step_name} reset`, description: "Step queued for re-run" });
      queryClient.invalidateQueries({ queryKey: ["mkt-onboarding-steps", product.product_key] });
      queryClient.invalidateQueries({ queryKey: ["mkt-products"] });
    } catch (err) {
      toast({ title: "Reset failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
      disabled={loading}
      onClick={!DESTRUCTIVE_RESET_STEPS.has(step.step_name) ? doReset : undefined}
    >
      {loading
        ? <RefreshCw className="h-3 w-3 animate-spin" />
        : <RotateCcw className="h-3 w-3" />}
    </Button>
  );

  // Non-destructive steps (schema_sniff, source_leads, vapi_assistants) — just run
  if (!DESTRUCTIVE_RESET_STEPS.has(step.step_name)) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="left">
            <p className="text-xs">Re-run {STEP_META[step.step_name]?.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Destructive steps — confirmation dialog
  return (
    <AlertDialog>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                disabled={loading}
              >
                {loading
                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                  : <RotateCcw className="h-3 w-3" />}
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p className="text-xs">Regenerate {STEP_META[step.step_name]?.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Regenerate {STEP_META[step.step_name]?.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete the existing {STEP_META[step.step_name]?.label.toLowerCase()} output for{" "}
            <strong>{product.product_name}</strong> and regenerate it from scratch.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={doReset}>Regenerate</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// StepList — vertical list of steps with per-step rerun
// ---------------------------------------------------------------------------

function StepList({
  steps,
  product,
  effectiveOrgId,
}: {
  steps: OnboardingStep[];
  product: Product;
  effectiveOrgId: string;
}) {
  return (
    <div className="space-y-0.5">
      {steps.map((step) => (
        <div
          key={step.id}
          className="group flex items-center gap-2 py-1 px-2 rounded-md hover:bg-muted/50 transition-colors"
        >
          <StepIcon step={step} />
          <span className="text-xs font-medium w-20 shrink-0">
            {STEP_META[step.step_name]?.label ?? step.step_name}
          </span>
          <span className="text-xs flex-1 min-w-0">
            <StepStatusText step={step} />
          </span>
          <StepRerunButton step={step} product={product} effectiveOrgId={effectiveOrgId} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeleteProductButton
// ---------------------------------------------------------------------------

function DeleteProductButton({ product, effectiveOrgId }: { product: Product; effectiveOrgId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await callProductManager(token, {
        mode: "delete", org_id: effectiveOrgId, product_key: product.product_key,
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: `${product.product_name} removed` });
      queryClient.invalidateQueries({ queryKey: ["mkt-products"] });
      queryClient.removeQueries({ queryKey: ["mkt-onboarding-steps", product.product_key] });
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {product.product_name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently deletes the product and all generated ICP, templates, campaigns, and scripts.
            You can re-onboard from scratch.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// ProductCard
// ---------------------------------------------------------------------------

function ProductCard({
  p,
  effectiveOrgId,
  onToggle,
}: {
  p: Product;
  effectiveOrgId: string;
  onToggle: (id: string, active: boolean) => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resuming, setResuming] = useState(false);

  const { data: steps, isLoading: stepsLoading } = useQuery<OnboardingStep[]>({
    queryKey: ["mkt-onboarding-steps", p.product_key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mkt_onboarding_steps")
        .select("*")
        .eq("product_key", p.product_key)
        .order("step_order", { ascending: true });
      if (error) throw error;
      return (data || []) as OnboardingStep[];
    },
    staleTime: 5_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      return data.some((s) => s.status === "pending" || s.status === "in_progress") ? 3000 : false;
    },
  });

  const completedCount = steps?.filter((s) => s.status === "complete" || s.status === "skipped").length ?? 0;
  const totalCount = steps?.length ?? 9;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  const hasFailed = steps?.some((s) => s.status === "failed") ?? false;
  const isInProgress = p.onboarding_status === "in_progress";

  const statusConfig: Record<string, { label: string; className: string }> = {
    complete:    { label: "Complete",    className: "bg-green-100 text-green-700 border-green-200" },
    in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700 border-blue-200" },
    failed:      { label: "Failed",      className: "bg-red-100 text-red-700 border-red-200" },
    pending:     { label: "Pending",     className: "bg-muted text-muted-foreground" },
  };
  const sc = statusConfig[p.onboarding_status] ?? statusConfig.pending;

  const handleResume = async () => {
    setResuming(true);
    try {
      const token = await getToken();
      const res = await callProductManager(token, {
        mode: "resume", org_id: effectiveOrgId, product_key: p.product_key,
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Resume started", description: p.product_name });
      queryClient.invalidateQueries({ queryKey: ["mkt-onboarding-steps", p.product_key] });
      queryClient.invalidateQueries({ queryKey: ["mkt-products"] });
    } catch (err) {
      toast({ title: "Resume failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setResuming(false);
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="font-semibold text-sm truncate">{p.product_name}</h3>
            </div>
            {p.product_url && (
              <a
                href={p.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-0.5 w-fit"
              >
                <Globe className="h-3 w-3" />
                {p.product_url.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-5 ${sc.className}`}
            >
              {sc.label}
            </Badge>
            <Switch
              checked={p.active}
              onCheckedChange={(active) => onToggle(p.id, active)}
              className="scale-75 origin-right"
            />
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{completedCount} of {totalCount} steps complete</span>
            <span>{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
        </div>
      </div>

      {/* ── Step list ── */}
      <CardContent className="flex-1 px-2 py-2">
        {stepsLoading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading steps…
          </div>
        ) : steps && steps.length > 0 ? (
          <StepList steps={steps} product={p} effectiveOrgId={effectiveOrgId} />
        ) : (
          <p className="text-xs text-muted-foreground px-2 py-3">No steps yet</p>
        )}
      </CardContent>

      {/* ── Footer ── */}
      <div className="px-4 pb-4 pt-2 border-t flex items-center gap-2 flex-wrap">
        {p.onboarding_status === "complete" && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 flex-1"
            onClick={() => navigate(`/marketing/products/${p.product_key}/icp`)}
          >
            <Target className="h-3.5 w-3.5" /> View ICP
          </Button>
        )}
        {(hasFailed || isInProgress) && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 flex-1"
            disabled={resuming || isInProgress}
            onClick={handleResume}
          >
            {resuming ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isInProgress ? "Running…" : "Resume"}
          </Button>
        )}
        <div className="ml-auto">
          <DeleteProductButton product={p} effectiveOrgId={effectiveOrgId} />
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProductManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { effectiveOrgId } = useOrgContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    product_name: "",
    product_url: "",
    git_repo_url: "",
    supabase_url: "",
    supabase_service_role_key: "",
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ["mkt-products", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_products")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Product[];
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.some((p) => p.onboarding_status === "in_progress") ? 4000 : false;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("toggle_product_active", { _product_id: id, _active: active });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt-products"] });
      toast({ title: "Product updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const onboardMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const token = await getToken();
      if (!effectiveOrgId) throw new Error("No org context");
      const res = await callProductManager(token, { mode: "onboard", org_id: effectiveOrgId, ...data });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt-products"] });
      setDialogOpen(false);
      setFormData({ product_name: "", product_url: "", git_repo_url: "", supabase_url: "", supabase_service_role_key: "" });
      toast({ title: "Onboarding started" });
    },
    onError: (err: Error) => {
      toast({ title: "Onboard failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Products</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Onboard products for Arohan to market autonomously
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Product
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Onboard New Product</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <Label className="text-xs">Product Name *</Label>
                  <Input
                    placeholder="e.g. Field Sync"
                    value={formData.product_name}
                    onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Product URL *</Label>
                  <Input
                    placeholder="https://fieldsync.in"
                    value={formData.product_url}
                    onChange={(e) => setFormData({ ...formData, product_url: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Arohan reads the landing page to infer your ICP
                  </p>
                </div>
                <div>
                  <Label className="text-xs">GitHub Repo URL</Label>
                  <Input
                    placeholder="https://github.com/owner/repo"
                    value={formData.git_repo_url}
                    onChange={(e) => setFormData({ ...formData, git_repo_url: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Optional — Arohan reads the README for additional ICP context
                  </p>
                </div>
                <div className="border-t pt-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Optional — connect your product DB for richer ICP
                  </p>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Supabase URL</Label>
                      <Input
                        placeholder="https://xxx.supabase.co"
                        value={formData.supabase_url}
                        onChange={(e) => setFormData({ ...formData, supabase_url: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Service Role Key</Label>
                      <Input
                        type="password"
                        placeholder="eyJhbGciOiJIUzI1NiIs…"
                        value={formData.supabase_service_role_key}
                        onChange={(e) => setFormData({ ...formData, supabase_service_role_key: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!formData.product_name || !formData.product_url || onboardMutation.isPending}
                  onClick={() => onboardMutation.mutate(formData)}
                >
                  {onboardMutation.isPending
                    ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Starting…</>
                    : <><Package className="h-4 w-4 mr-2" /> Start Onboarding</>}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Product grid */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading products…
          </div>
        ) : !products || products.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No products yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add a product to let Arohan build its marketing engine
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                p={p}
                effectiveOrgId={effectiveOrgId ?? ""}
                onToggle={(id, active) => toggleMutation.mutate({ id, active })}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
