import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Contact,
  GitBranch,
  TrendingUp,
  Package,
  CheckSquare,
  MessageSquare,
  Database,
  MessageCircle,
  Briefcase,
  CalendarDays,
  Megaphone,
  Palette,
  IndianRupee,
  LifeBuoy,
  Bot,
} from "lucide-react";
import { useNotification } from "@/hooks/useNotification";
import { OnboardingDialog } from "@/components/Onboarding/OnboardingDialog";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import SubscriptionStatusBanner from "@/components/Subscription/SubscriptionStatusBanner";
import { useModuleTracking } from "@/hooks/useModuleTracking";
import { useTopModules } from "@/hooks/useTopModules";
import { NotificationBell } from "./NotificationBell";
import { QuickDial } from "@/components/Contact/QuickDial";
import { CallbackReminderAlert } from "@/components/Contact/CallbackReminderAlert";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
 import { FloatingChatWidget } from "@/components/chat/FloatingChatWidget";

interface DashboardLayoutProps {
  children: ReactNode;
}

function DashboardLayout({ children }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const notify = useNotification();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { canAccessFeature, loading: featureAccessLoading } = useFeatureAccess();
  
  // Track module usage and get top modules
  useModuleTracking();
  const { data: topModules = [] } = useTopModules(6);

  // Fetch user profile and role data using React Query (cached)
  const { data: userData } = useQuery({
    queryKey: ["dashboard-user-data", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Batch all queries together
      const [roleRes, profileRes] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("profiles")
          .select("first_name, last_name, org_id, is_platform_admin, onboarding_completed")
          .eq("id", user.id)
          .single()
      ]);

      let orgData = null;
      if (profileRes.data?.org_id) {
        const { data } = await supabase
          .from("organizations")
          .select("logo_url, name")
          .eq("id", profileRes.data.org_id)
          .single();
        orgData = data;
      }

      return {
        role: roleRes.data?.role || null,
        profile: profileRes.data,
        org: orgData,
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Derived state from cached data
  const userRole = userData?.role || null;
  const userName = userData?.profile 
    ? `${userData.profile.first_name} ${userData.profile.last_name}` 
    : "";
  const orgLogo = userData?.org?.logo_url || "";
  const orgName = userData?.org?.name || "";
  const onboardingCompleted = userData?.profile?.onboarding_completed || false;

  // Check if user needs onboarding
  useEffect(() => {
    if (userData && !onboardingCompleted && userRole) {
      setShowOnboarding(true);
    }
  }, [userData, onboardingCompleted, userRole]);

  const handleSignOut = async () => {
    await signOut();
    notify.success("Signed out", "You've been successfully signed out");
    navigate("/login");
  };

  // Check if sections should be visible
  const showDashboardsSection = canAccessFeature("analytics") || canAccessFeature("calling") ||
    canAccessFeature("campaigns_email") || canAccessFeature("campaigns_whatsapp") || canAccessFeature("ai_insights");

  const showOperationsSection = canAccessFeature("campaigns_email") || canAccessFeature("contacts") ||
    canAccessFeature("pipeline_stages") || canAccessFeature("calling") || canAccessFeature("redefine_data_repository");

  return (
    <div className="h-screen overflow-hidden bg-background">
      {/* Mobile header */}
      <div className="lg:hidden bg-card border-b border-border px-3 py-2 flex items-center justify-between">
        {orgLogo ? (
          <img src={orgLogo} alt="Organization Logo" className="h-8 object-contain" />
        ) : (
          <h1 className="text-lg font-semibold text-primary">In-Sync</h1>
        )}
        <div className="flex items-center gap-1">
          <QuickDial />
          <NotificationBell />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-3rem)] lg:h-screen">
        {/* Sidebar - Dark Gradient Design */}
        <aside
          className={`
            fixed lg:sticky inset-y-0 left-0 z-50 lg:top-0 lg:h-screen
            w-56 bg-sidebar border-r border-sidebar-border
            transform transition-transform duration-200 ease-in-out
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
          style={{ background: 'var(--gradient-sidebar)' }}
        >
          <div className="h-full lg:h-screen flex flex-col overflow-y-auto scrollbar-hide">
            {/* Logo */}
            <div className="p-4 border-b border-sidebar-border flex flex-col items-center">
              {orgLogo ? (
                <div className="bg-white rounded-lg p-2 mb-2">
                  <img src={orgLogo} alt="Organization Logo" className="h-[100px] object-contain" />
                </div>
              ) : (
                <h1 className="text-xl font-semibold text-sidebar-primary">In-Sync</h1>
              )}
              <p className="text-base font-semibold text-sidebar-foreground truncate max-w-full">{userName}</p>
            </div>

            {/* Navigation - Compact */}
            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto scrollbar-hide">
              {/* Dashboards & Reports Section */}
              {showDashboardsSection && (
                <div className="pt-3 pb-1 px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-primary">
                    Dashboards
                  </p>
                </div>
              )}
              
              {canAccessFeature("dashboard") && (
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                  onClick={() => setSidebarOpen(false)}
                >
                  <LayoutDashboard size={16} className="shrink-0 text-sidebar-muted" />
                  <span>Dashboard</span>
                </Link>
              )}

              <Link
                to="/calendar"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <CalendarDays size={16} className="shrink-0 text-sidebar-muted" />
                <span>Calendar</span>
              </Link>

              <Link
                to="/marketing"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <TrendingUp size={16} className="shrink-0 text-sidebar-muted" />
                <span>Marketing</span>
              </Link>
              <Link
                to="/marketing/arohan"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <Bot size={16} className="shrink-0 text-sidebar-muted" />
                <span>Arohan</span>
              </Link>
              <Link
                to="/marketing/campaigns"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <Megaphone size={16} className="shrink-0 text-sidebar-muted" />
                <span>Campaigns</span>
              </Link>
              <Link
                to="/marketing/templates"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <Palette size={16} className="shrink-0 text-sidebar-muted" />
                <span>Templates</span>
              </Link>

              {/* Operations Section */}
              {showOperationsSection && (
                <div className="pt-3 pb-1 px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-primary">
                    Operations
                  </p>
                </div>
              )}
              
              {canAccessFeature("pipeline_stages") && (
                <Link
                  to="/pipeline"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                  onClick={() => setSidebarOpen(false)}
                >
                  <GitBranch size={16} className="shrink-0 text-sidebar-muted" />
                  <span>Pipeline</span>
                </Link>
              )}
              
              {canAccessFeature("contacts") && (
                <Link
                  to="/contacts"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                  onClick={() => setSidebarOpen(false)}
                >
                  <Contact size={16} className="shrink-0 text-sidebar-muted" />
                  <span>Contacts</span>
                </Link>
              )}

              {canAccessFeature("communications") && (
                <Link
                  to="/communications"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                  onClick={() => setSidebarOpen(false)}
                >
                  <MessageSquare size={16} className="shrink-0 text-sidebar-muted" />
                  <span>Campaigns</span>
                </Link>
              )}

              {canAccessFeature("redefine_data_repository") && orgName.includes("Redefine") && (
                <Link
                  to="/redefine-repository"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                  onClick={() => setSidebarOpen(false)}
                >
                  <Database size={16} className="shrink-0 text-sidebar-muted" />
                  <span>Data Repository</span>
                </Link>
              )}

              {canAccessFeature("inventory") && orgName === "C.Parekh & Co" && (
                <Link
                  to="/inventory"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                  onClick={() => setSidebarOpen(false)}
                >
                  <Package size={16} className="shrink-0 text-sidebar-muted" />
                  <span>Inventory</span>
                </Link>
              )}

              <Link
                to="/tasks"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <CheckSquare size={16} className="shrink-0 text-sidebar-muted" />
                <span>Tasks</span>
              </Link>

               <Link
                 to="/chat"
                 className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                 onClick={() => setSidebarOpen(false)}
               >
                 <MessageCircle size={16} className="shrink-0 text-sidebar-muted" />
                 <span>Messages</span>
               </Link>

              <div className="pt-3 pb-1 px-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-primary">
                  Clients & Billing
                </p>
              </div>

              <Link
                to="/clients"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <Briefcase size={16} className="shrink-0 text-sidebar-muted" />
                <span>Clients</span>
              </Link>

              <Link
                to="/billing-system"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <IndianRupee size={16} className="shrink-0 text-sidebar-muted" />
                <span>Billing & Invoicing</span>
              </Link>

              <div className="pt-3 pb-1 px-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-primary">
                  Support
                </p>
              </div>
              <Link
                to="/support-tickets"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <LifeBuoy size={16} className="shrink-0 text-sidebar-muted" />
                <span>Support Tickets</span>
              </Link>



            </nav>

            {/* Sign out - Compact */}
            <div className="p-2 border-t border-sidebar-border">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
                onClick={handleSignOut}
              >
                <LogOut size={16} className="mr-2 text-sidebar-muted" />
                Sign Out
              </Button>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content - Compact */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Desktop header with notifications */}
          <div className="hidden lg:flex items-center justify-end gap-2 px-4 py-2 border-b border-border bg-card shrink-0">
            <NotificationBell />
          </div>
          <SubscriptionStatusBanner />
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
      
      {/* Onboarding Dialog */}
      {userData && showOnboarding && userRole && (
        <OnboardingDialog
          open={showOnboarding}
          userRole={userRole}
          onComplete={() => setShowOnboarding(false)}
        />
      )}

      {/* Callback Reminder Alert */}
      <CallbackReminderAlert />

       {/* Floating Chat Widget */}
       <FloatingChatWidget />
    </div>
  );
}

export default DashboardLayout;
export { DashboardLayout };
