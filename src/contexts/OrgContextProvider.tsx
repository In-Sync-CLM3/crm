import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthProvider";

interface OrgContextType {
  userOrgId: string | null;
  effectiveOrgId: string | null;
  isPlatformAdmin: boolean;
  isImpersonating: boolean;
  isLoading: boolean;
  setImpersonatedOrgId: (orgId: string | null) => void;
  clearImpersonation: () => void;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

const IMPERSONATION_KEY = "crm_impersonated_org_id";

interface OrgContextProviderProps {
  children: ReactNode;
}

export function OrgContextProvider({ children }: OrgContextProviderProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [userOrgId, setUserOrgId] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [impersonatedOrgId, setImpersonatedOrgIdState] = useState<string | null>(
    () => localStorage.getItem(IMPERSONATION_KEY)
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setUserOrgId(null);
      setIsPlatformAdmin(false);
      setImpersonatedOrgIdState(null);
      localStorage.removeItem(IMPERSONATION_KEY);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const fetchProfile = async () => {
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("org_id, is_platform_admin")
          .eq("id", user.id)
          .single();

        if (!mounted) return;

        if (error) {
          console.error("[OrgContext] Failed to fetch profile:", error);
          setIsLoading(false);
          return;
        }

        setUserOrgId(profile?.org_id || null);
        const admin = profile?.is_platform_admin === true;
        setIsPlatformAdmin(admin);

        // Clear any stale impersonation if user is not a platform admin
        if (!admin) {
          setImpersonatedOrgIdState(null);
          localStorage.removeItem(IMPERSONATION_KEY);
        }
      } catch (err) {
        console.error("[OrgContext] Error fetching profile:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchProfile();

    return () => { mounted = false; };
  }, [user, authLoading]);

  const setImpersonatedOrgId = (orgId: string | null) => {
    if (!isPlatformAdmin) return;
    setImpersonatedOrgIdState(orgId);
    if (orgId) {
      localStorage.setItem(IMPERSONATION_KEY, orgId);
    } else {
      localStorage.removeItem(IMPERSONATION_KEY);
    }
  };

  const clearImpersonation = () => setImpersonatedOrgId(null);

  const value: OrgContextType = {
    userOrgId,
    effectiveOrgId: impersonatedOrgId ?? userOrgId,
    isPlatformAdmin,
    isImpersonating: impersonatedOrgId !== null,
    isLoading: authLoading || isLoading,
    setImpersonatedOrgId,
    clearImpersonation,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrgContextProvider() {
  const context = useContext(OrgContext);
  if (context === undefined) {
    throw new Error("useOrgContextProvider must be used within an OrgContextProvider");
  }
  return context;
}
