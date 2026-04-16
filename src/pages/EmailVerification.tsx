import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Cloud, RefreshCw, ShieldCheck } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useState } from "react";
import { useNotification } from "@/hooks/useNotification";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  valid: {
    label: "Valid",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
    description: "Mailbox exists and accepts mail. Safe to contact.",
  },
  invalid: {
    label: "Invalid",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: <XCircle className="h-5 w-5 text-red-600" />,
    description: "Mail server rejected this address. Suppressed from campaigns.",
  },
  catch_all: {
    label: "Catch-All",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
    description: "Domain accepts all addresses. Cannot confirm if specific mailbox exists.",
  },
  hosted: {
    label: "Hosted",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icon: <Cloud className="h-5 w-5 text-blue-600" />,
    description: "Google Workspace or Microsoft 365 — cannot probe. Treat as valid.",
  },
  dns_ok: {
    label: "DNS OK",
    color: "bg-indigo-100 text-indigo-800 border-indigo-200",
    icon: <ShieldCheck className="h-5 w-5 text-indigo-600" />,
    description: "Domain and MX records are valid. Full SMTP probe pending (runs when port 25 opens).",
  },
  unknown: {
    label: "Unknown",
    color: "bg-gray-100 text-gray-700 border-gray-200",
    icon: <HelpCircle className="h-5 w-5 text-gray-500" />,
    description: "Server timed out or did not respond. May retry later.",
  },
};

const EmailVerification = () => {
  const { orgId } = useOrgContext();
  const notify = useNotification();
  const [running, setRunning] = useState(false);

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["email-verification-stats", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("email_verification_status")
        .eq("org_id", orgId!)
        .not("email", "is", null);

      if (error) throw error;

      const counts: Record<string, number> = {
        valid: 0,
        invalid: 0,
        catch_all: 0,
        hosted: 0,
        dns_ok: 0,
        unknown: 0,
        unverified: 0,
      };

      for (const row of data || []) {
        const status = row.email_verification_status || "unverified";
        counts[status] = (counts[status] || 0) + 1;
      }

      const total = data?.length || 0;
      return { counts, total };
    },
    enabled: !!orgId,
    refetchInterval: 30000,
  });

  const handleRunNow = async () => {
    setRunning(true);
    try {
      // Refresh session before invoking — edge function gateway requires a valid JWT
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !session) {
        notify.error("Session expired — please reload the page and try again.");
        return;
      }
      const { error } = await supabase.functions.invoke("mkt-email-verifier");
      if (error) throw error;
      notify.success("Verification batch started — refresh in a minute to see results.");
      setTimeout(() => refetch(), 5000);
    } catch (err) {
      notify.error("Failed to trigger verifier. Check that the SMTP service is running.");
    } finally {
      setRunning(false);
    }
  };

  const total = stats?.total || 0;
  const counts = stats?.counts || {};

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Email Verification</h1>
              <p className="text-sm text-gray-500">Self-hosted SMTP verifier · runs every 15 minutes</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={handleRunNow} disabled={running}>
              {running ? "Running..." : "Run Now"}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <Card key={key} className="border">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  {cfg.icon}
                  <span className="text-xs font-medium text-gray-600">{cfg.label}</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {isLoading ? "—" : (counts[key] || 0).toLocaleString()}
                </div>
                {total > 0 && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {Math.round(((counts[key] || 0) / total) * 100)}%
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <Card className="border bg-gray-50">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <HelpCircle className="h-5 w-5 text-gray-400" />
                <span className="text-xs font-medium text-gray-500">Unverified</span>
              </div>
              <div className="text-2xl font-bold text-gray-500">
                {isLoading ? "—" : (counts["unverified"] || 0).toLocaleString()}
              </div>
              {total > 0 && (
                <div className="text-xs text-gray-400 mt-0.5">
                  {Math.round(((counts["unverified"] || 0) / total) * 100)}% pending
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status legend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What each status means</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <div key={key} className="flex items-start gap-3">
                  <Badge className={`${cfg.color} border text-xs mt-0.5 shrink-0`}>{cfg.label}</Badge>
                  <p className="text-sm text-gray-600">{cfg.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Service info */}
        <Card className="border-indigo-100 bg-indigo-50/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-indigo-700">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>
                SMTP verifier running at <strong>verify.crm.in-sync.co.in:3000</strong> (204.168.237.119) ·
                Verifies up to 200 emails per run (10 parallel) · Invalid emails are auto-suppressed from campaigns
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default EmailVerification;
