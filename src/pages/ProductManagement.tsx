import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Product {
  id: string;
  org_id: string;
  product_key: string;
  product_name: string;
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
}

// ---------------------------------------------------------------------------
// Step name → friendly label map
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<string, string> = {
  register: "Register",
  schema_sniff: "Schema",
  icp_infer: "ICP",
  email_templates: "Emails",
  whatsapp_templates: "WhatsApp",
  call_scripts: "Scripts",
  campaign_create: "Campaign",
  source_leads: "Leads",
  vapi_assistants: "Vapi",
};

function friendlyStepName(step_name: string): string {
  return STEP_LABELS[step_name] ?? step_name;
}

// ---------------------------------------------------------------------------
// StepProgress component
// ---------------------------------------------------------------------------

function StepIcon({ step }: { step: OnboardingStep }) {
  const now = new Date();
  const scheduledFor = step.scheduled_for ? new Date(step.scheduled_for) : null;
  const isDeferred = step.status === "pending" && scheduledFor !== null && scheduledFor > now;

  if (step.status === "complete") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />;
  }
  if (step.status === "in_progress") {
    return <RefreshCw className="h-3.5 w-3.5 text-blue-600 shrink-0 animate-spin" />;
  }
  if (step.status === "failed") {
    return (
      <XCircle
        className="h-3.5 w-3.5 text-red-600 shrink-0"
        title={step.error ?? "Step failed"}
      />
    );
  }
  if (isDeferred) {
    return (
      <Clock
        className="h-3.5 w-3.5 text-muted-foreground shrink-0"
        title={`Deferred until ${scheduledFor!.toLocaleDateString()}`}
      />
    );
  }
  if (step.status === "skipped") {
    return <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
  // plain pending
  return <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

function StepProgress({ productKey }: { productKey: string }) {
  const { data: steps, isLoading } = useQuery<OnboardingStep[]>({
    queryKey: ["mkt-onboarding-steps", productKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mkt_onboarding_steps")
        .select("*")
        .eq("product_key", productKey)
        .order("step_order", { ascending: true });
      if (error) throw error;
      return (data || []) as OnboardingStep[];
    },
    staleTime: 5_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      const active = data.some((s) => s.status === "pending" || s.status === "in_progress");
      return active ? 3000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <RefreshCw className="h-3 w-3 animate-spin" /> Loading steps…
      </div>
    );
  }

  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5 pt-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        Onboarding Steps
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-1">
            <StepIcon step={step} />
            <span
              className="text-[10px] text-muted-foreground"
              title={step.status}
            >
              {friendlyStepName(step.step_name)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReRunButton component
// ---------------------------------------------------------------------------

function ReRunButton({
  product,
  steps,
  effectiveOrgId,
}: {
  product: Product;
  steps: OnboardingStep[] | undefined;
  effectiveOrgId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  // Show if any step is failed OR all steps are complete
  const hasFailed = steps?.some((s) => s.status === "failed") ?? false;
  const allComplete =
    steps != null &&
    steps.length > 0 &&
    steps.every((s) => s.status === "complete" || s.status === "skipped");

  if (!hasFailed && !allComplete) return null;

  const handleReRun = async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mkt-product-manager`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            mode: "resume",
            org_id: effectiveOrgId,
            product_key: product.product_key,
          }),
        }
      );

      if (!res.ok) throw new Error(await res.text());

      toast({ title: "Re-run started", description: `Resuming ${product.product_name}` });
      queryClient.invalidateQueries({ queryKey: ["mkt-onboarding-steps", product.product_key] });
      queryClient.invalidateQueries({ queryKey: ["mkt-products"] });
    } catch (err) {
      toast({
        title: "Re-run failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs gap-1.5"
      disabled={loading}
      onClick={handleReRun}
    >
      {loading ? (
        <RefreshCw className="h-3 w-3 animate-spin" />
      ) : (
        <RefreshCw className="h-3 w-3" />
      )}
      Re-run
    </Button>
  );
}

// ---------------------------------------------------------------------------
// ProductCard — consumes step data from its own query
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

  const { data: steps } = useQuery<OnboardingStep[]>({
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
      const active = data.some((s) => s.status === "pending" || s.status === "in_progress");
      return active ? 3000 : false;
    },
  });

  const statusIcon = (status: string) => {
    if (status === "complete") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    if (status === "in_progress") return <Clock className="h-4 w-4 text-yellow-600" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-red-600" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const formatPaise = (paise: number | null) =>
    paise != null ? `₹${(paise / 100).toLocaleString("en-IN")}` : "—";

  return (
    <Card key={p.id}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" />
            {p.product_name}
          </CardTitle>
          <Switch
            checked={p.active}
            onCheckedChange={(active) => onToggle(p.id, active)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {/* Status row */}
        <div className="flex items-center gap-2">
          {statusIcon(p.onboarding_status)}
          <span className="capitalize">{p.onboarding_status}</span>
          <Badge
            variant={p.active ? "default" : "secondary"}
            className="ml-auto text-[10px]"
          >
            {p.active ? "Active" : "Paused"}
          </Badge>
        </div>

        {/* Step progress */}
        <StepProgress productKey={p.product_key} />

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-1 text-muted-foreground">
          <span>Key:</span>
          <span className="font-mono">{p.product_key}</span>
          <span>Trial:</span>
          <span>{p.trial_days} days</span>
          <span>Starter:</span>
          <span>{formatPaise(p.price_starter_monthly_paise)}/mo</span>
          <span>Growth:</span>
          <span>{formatPaise(p.price_growth_monthly_paise)}/mo</span>
        </div>

        {p.last_synced_at && (
          <p className="text-muted-foreground">
            Last sync: {new Date(p.last_synced_at).toLocaleString()}
          </p>
        )}

        {/* Action buttons row */}
        <div className="flex items-center gap-2 flex-wrap pt-0.5">
          {p.onboarding_status === "complete" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 flex-1"
              onClick={() => navigate(`/marketing/products/${p.product_key}/icp`)}
            >
              <Target className="h-3 w-3" />
              View / Edit ICP
            </Button>
          )}
          <ReRunButton
            product={p}
            steps={steps}
            effectiveOrgId={effectiveOrgId}
          />
        </div>
      </CardContent>
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
      const { error } = await supabase.rpc("toggle_product_active", {
        _product_id: id,
        _active: active,
      });
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      if (!effectiveOrgId) throw new Error("No org context");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mkt-product-manager`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ mode: "onboard", org_id: effectiveOrgId, ...data }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt-products"] });
      setDialogOpen(false);
      setFormData({
        product_name: "",
        product_url: "",
        supabase_url: "",
        supabase_service_role_key: "",
      });
      toast({ title: "Product onboarding started" });
    },
    onError: (err: Error) => {
      toast({ title: "Onboard failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Product Management</h1>
            <p className="text-xs text-muted-foreground">
              Multi-product registry — onboard, toggle, and sync products
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
                  <Label className="text-xs">Product Name</Label>
                  <Input
                    placeholder="e.g. VisitorVault"
                    value={formData.product_name}
                    onChange={(e) =>
                      setFormData({ ...formData, product_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Product URL</Label>
                  <Input
                    placeholder="https://visitorvault.in"
                    value={formData.product_url}
                    onChange={(e) =>
                      setFormData({ ...formData, product_url: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Supabase URL</Label>
                  <Input
                    placeholder="https://xxx.supabase.co"
                    value={formData.supabase_url}
                    onChange={(e) =>
                      setFormData({ ...formData, supabase_url: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Supabase Service Role Key</Label>
                  <Input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIs..."
                    value={formData.supabase_service_role_key}
                    onChange={(e) =>
                      setFormData({ ...formData, supabase_service_role_key: e.target.value })
                    }
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!formData.product_name || onboardMutation.isPending}
                  onClick={() => onboardMutation.mutate(formData)}
                >
                  {onboardMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Package className="h-4 w-4 mr-2" />
                  )}
                  Start Onboarding
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Loading products...
            </CardContent>
          </Card>
        ) : !products || products.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No products registered. Click "Add Product" to onboard your first product.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
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
