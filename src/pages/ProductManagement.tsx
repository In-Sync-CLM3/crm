import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  ExternalLink,
} from "lucide-react";

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

export default function ProductManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    product_name: "",
    product_url: "",
    supabase_url: "",
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ["mkt-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mkt_products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Product[];
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
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mkt-product-manager`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "onboard", ...data }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt-products"] });
      setDialogOpen(false);
      setFormData({ product_name: "", product_url: "", supabase_url: "" });
      toast({ title: "Product onboarding started" });
    },
    onError: (err: Error) => {
      toast({ title: "Onboard failed", description: err.message, variant: "destructive" });
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
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      {p.product_name}
                    </CardTitle>
                    <Switch
                      checked={p.active}
                      onCheckedChange={(active) =>
                        toggleMutation.mutate({ id: p.id, active })
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
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
                  {p.supabase_url && (
                    <a
                      href={p.supabase_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Supabase Project
                    </a>
                  )}
                  {p.last_synced_at && (
                    <p className="text-muted-foreground">
                      Last sync: {new Date(p.last_synced_at).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
