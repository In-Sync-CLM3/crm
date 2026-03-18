import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "./useOrgContext";

interface UserRoleResult {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
}

/**
 * Hook to check if the current user has admin or super_admin role
 * Uses server-side verification through user_roles table
 */
export function useUserRole(): UserRoleResult {
  const { effectiveOrgId, isLoading: orgLoading } = useOrgContext();

  const { data, isLoading } = useQuery({
    queryKey: ["userRole", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) {
        return { isAdmin: false, isSuperAdmin: false };
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { isAdmin: false, isSuperAdmin: false };
      }

      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", effectiveOrgId)
        .in("role", ["admin", "super_admin"]);

      if (error) {
        console.error("[useUserRole] Error fetching roles:", error);
        return { isAdmin: false, isSuperAdmin: false };
      }

      const isSuperAdmin = roles?.some((r) => r.role === "super_admin") || false;
      const isAdmin = roles?.some((r) => r.role === "admin") || isSuperAdmin;

      return { isAdmin, isSuperAdmin };
    },
    enabled: !!effectiveOrgId && !orgLoading,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    isAdmin: data?.isAdmin || false,
    isSuperAdmin: data?.isSuperAdmin || false,
    loading: isLoading || orgLoading,
  };
}
