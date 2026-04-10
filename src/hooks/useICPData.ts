import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "./useOrgContext";

export interface ICPRow {
  id: string;
  org_id: string;
  product_key: string;
  industries: string[];
  company_sizes: string[];
  designations: string[];
  geographies: string[];
  languages: string[];
  budget_range: { min_paise: number; max_paise: number; currency: string };
  pain_points: string[];
  aha_moment_days: number | null;
  version: number;
  confidence_score: number;
  last_evolved_at: string;
  evolution_reason: string | null;
  evolved_by: string;
  created_at: string;
  updated_at: string;
}

export type ICPPatch = Partial<
  Pick<
    ICPRow,
    | "industries"
    | "company_sizes"
    | "designations"
    | "geographies"
    | "languages"
    | "budget_range"
    | "pain_points"
    | "aha_moment_days"
  >
>;

/** Current (highest-version) ICP for one product. */
export function useCurrentICP(productKey: string) {
  const { effectiveOrgId } = useOrgContext();
  return useQuery({
    queryKey: ["mkt-product-icp", productKey, effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No org context");
      const { data, error } = await supabase.rpc("get_current_icp", {
        _org_id: effectiveOrgId,
        _product_key: productKey,
      });
      if (error) throw error;
      return (data as ICPRow[] | null)?.[0] ?? null;
    },
    enabled: !!effectiveOrgId && !!productKey,
  });
}

/** All versions of the ICP for one product, newest first. */
export function useICPHistory(productKey: string) {
  const { effectiveOrgId } = useOrgContext();
  return useQuery({
    queryKey: ["mkt-product-icp-history", productKey, effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No org context");
      const { data, error } = await supabase.rpc("get_icp_history", {
        _org_id: effectiveOrgId,
        _product_key: productKey,
      });
      if (error) throw error;
      return (data as ICPRow[]) ?? [];
    },
    enabled: !!effectiveOrgId && !!productKey,
  });
}

/** Current ICP for every product in the org (one row per product). */
export function useAllCurrentICPs() {
  const { effectiveOrgId } = useOrgContext();
  return useQuery({
    queryKey: ["mkt-all-current-icps", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No org context");
      const { data, error } = await supabase.rpc("get_all_current_icps", {
        _org_id: effectiveOrgId,
      });
      if (error) throw error;
      return (data as ICPRow[]) ?? [];
    },
    enabled: !!effectiveOrgId,
  });
}

/** Apply a manual patch to a product's ICP — inserts a new version. */
export function useUpdateICP() {
  const queryClient = useQueryClient();
  const { effectiveOrgId } = useOrgContext();

  return useMutation({
    mutationFn: async ({
      productKey,
      icpPatch,
      reason,
    }: {
      productKey: string;
      icpPatch: ICPPatch;
      reason: string;
    }) => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mkt-evolve-icp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "manual_override",
            org_id: effectiveOrgId,
            product_key: productKey,
            icp_patch: icpPatch,
            reason,
          }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, { productKey }) => {
      queryClient.invalidateQueries({ queryKey: ["mkt-product-icp", productKey] });
      queryClient.invalidateQueries({ queryKey: ["mkt-product-icp-history", productKey] });
      queryClient.invalidateQueries({ queryKey: ["mkt-all-current-icps"] });
    },
  });
}
