import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, XCircle, AlertTriangle, HelpCircle,
  Cloud, RefreshCw, ShieldCheck, Send, Ban, Zap,
} from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useState } from "react";
import { useNotification } from "@/hooks/useNotification";

// ─── Status detail config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  icon: React.ReactNode;
  description: string;
  bucket: "safe" | "risky" | "blocked" | "pending";
}> = {
  valid: {
    label: "Valid",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    description: "Mailbox confirmed by SMTP. Safe to send.",
    bucket: "safe",
  },
  hosted: {
    label: "Hosted",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icon: <Cloud className="h-4 w-4 text-blue-600" />,
    description: "Google Workspace / Microsoft 365 / consumer inbox. Cannot probe — sent cautiously, bounces handled reactively.",
    bucket: "safe",
  },
  dns_ok: {
    label: "DNS OK",
    color: "bg-indigo-100 text-indigo-800 border-indigo-200",
    icon: <ShieldCheck className="h-4 w-4 text-indigo-600" />,
    description: "Domain and MX records valid but mailbox unconfirmed. SMTP verifier retries every 7 days.",
    bucket: "risky",
  },
  catch_all: {
    label: "Catch-All",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
    description: "Domain accepts every address at SMTP level — cannot confirm mailbox existence. Blocked from campaigns to protect reputation.",
    bucket: "blocked",
  },
  invalid: {
    label: "Invalid",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: <XCircle className="h-4 w-4 text-red-600" />,
    description: "SMTP server rejected this address. Hard-suppressed — never sent to.",
    bucket: "blocked",
  },
  unknown: {
    label: "Unknown",
    color: "bg-gray-100 text-gray-700 border-gray-200",
    icon: <HelpCircle className="h-4 w-4 text-gray-500" />,
    description: "Server timed out. Will retry automatically.",
    bucket: "risky",
  },
  unverified: {
    label: "Unverified",
    color: "bg-slate-100 text-slate-600 border-slate-200",
    icon: <HelpCircle className="h-4 w-4 text-slate-400" />,
    description: "Not yet processed by the verifier. Will be picked up within 15 minutes.",
    bucket: "pending",
  },
};

const BUCKET_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bgColor: string; statuses: string[] }> = {
  safe: {
    label: "Safe to Send",
    icon: <Send className="h-5 w-5 text-emerald-600" />,
    color: "text-emerald-700",
    bgColor: "bg-emerald-50 border-emerald-200",
    statuses: ["valid", "hosted"],
  },
  risky: {
    label: "Risky / Unconfirmed",
    icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
    color: "text-amber-700",
    bgColor: "bg-amber-50 border-amber-200",
    statuses: ["dns_ok", "unknown"],
  },
  blocked: {
    label: "Blocked",
    icon: <Ban className="h-5 w-5 text-red-500" />,
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
    statuses: ["invalid", "catch_all"],
  },
  pending: {
    label: "Pending Verification",
    icon: <Zap className="h-5 w-5 text-slate-400" />,
    color: "text-slate-600",
    bgColor: "bg-slate-50 border-slate-200",
    statuses: ["unverified"],
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const EmailVerification = () => {
  const { effectiveOrgId: orgId } = useOrgContext();
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
        valid: 0, invalid: 0, catch_all: 0,
        hosted: 0, dns_ok: 0, unknown: 0, unverified: 0,
      };

      for (const row of data || []) {
        const s = row.email_verification_status || "unverified";
        counts[s] = (counts[s] || 0) + 1;
      }

      const total = data?.length || 0;
      return { counts, total };
    },
    enabled: !!orgId,
    refetchInterval: 30_000,
  });

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !session) {
        notify.error("Session expired — please reload and try again.");
        return;
      }
      const { error } = await supabase.functions.invoke("mkt-email-verifier");
      if (error) throw error;
      notify.success("Verification batch started — refresh in a minute to see results.");
      setTimeout(() => refetch(), 5_000);
    } catch {
      notify.error("Failed to trigger verifier. Check that the SMTP service is running.");
    } finally {
      setRunning(false);
    }
  };

  const total = stats?.total || 0;
  const counts = stats?.counts || {};

  // Bucket totals
  const bucketTotals = Object.fromEntries(
    Object.entries(BUCKET_CONFIG).map(([k, cfg]) => [
      k,
      cfg.statuses.reduce((s, st) => s + (counts[st] || 0), 0),
    ])
  );

  const safeRate = total > 0 ? Math.round((bucketTotals.safe / total) * 100) : 0;
  const blockedRate = total > 0 ? Math.round((bucketTotals.blocked / total) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Email Verification</h1>
              <p className="text-sm text-gray-500">
                SMTP verifier at 204.168.237.119 · runs every 15 min ·{" "}
                {total > 0 ? `${total.toLocaleString()} contacts with email` : "loading…"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={handleRunNow} disabled={running}>
              {running ? "Running…" : "Run Now"}
            </Button>
          </div>
        </div>

        {/* Outcome buckets — the headline numbers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(BUCKET_CONFIG).map(([key, cfg]) => {
            const count = bucketTotals[key] || 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <Card key={key} className={`border ${cfg.bgColor}`}>
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center gap-2 mb-2">{cfg.icon}
                    <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <div className={`text-3xl font-bold ${cfg.color}`}>
                    {isLoading ? "—" : count.toLocaleString()}
                  </div>
                  {total > 0 && (
                    <div className="mt-1.5">
                      <div className="h-1 rounded-full bg-white/60 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: key === "safe" ? "#10b981" : key === "blocked" ? "#ef4444" : key === "risky" ? "#f59e0b" : "#94a3b8",
                          }}
                        />
                      </div>
                      <div className={`text-xs mt-0.5 ${cfg.color} opacity-80`}>{pct}% of list</div>
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1.5">
                    {cfg.statuses.map(s => STATUS_CONFIG[s]?.label).join(" + ")}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Summary health bar */}
        {total > 0 && (
          <Card>
            <CardContent className="pt-4 pb-4 px-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">List Health</span>
                <span className="text-sm text-muted-foreground">
                  <span className="font-bold text-emerald-600">{safeRate}% safe</span>
                  {" · "}
                  <span className="font-bold text-red-600">{blockedRate}% blocked</span>
                  {" · "}
                  {(counts["unverified"] || 0).toLocaleString()} pending
                </span>
              </div>
              <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex">
                {[
                  { key: "safe",    color: "#10b981" },
                  { key: "risky",   color: "#f59e0b" },
                  { key: "blocked", color: "#ef4444" },
                  { key: "pending", color: "#cbd5e1" },
                ].map(({ key, color }) => {
                  const pct = (bucketTotals[key] / total) * 100;
                  return pct > 0 ? (
                    <div key={key} style={{ width: `${pct}%`, backgroundColor: color }} />
                  ) : null;
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {[
                  { label: "Safe", color: "#10b981" },
                  { label: "Risky", color: "#f59e0b" },
                  { label: "Blocked", color: "#ef4444" },
                  { label: "Pending", color: "#cbd5e1" },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    {label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detailed status breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const count = counts[key] || 0;
                const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
                return (
                  <div key={key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Badge className={`${cfg.color} border text-[10px] w-20 justify-center shrink-0`}>
                      {cfg.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-600 leading-snug">{cfg.description}</p>
                    </div>
                    <div className="text-right shrink-0 w-20">
                      <div className="text-sm font-bold tabular-nums">{count.toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground">{pct}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* How it works now */}
        <Card className="border-indigo-100 bg-indigo-50/30">
          <CardContent className="pt-4 pb-4 px-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
              <ShieldCheck className="h-4 w-4" /> How verification works
            </div>
            <ul className="text-xs text-indigo-800 space-y-1 pl-6 list-disc">
              <li><strong>Consumer + hosted inboxes</strong> (Gmail, Outlook, G-Suite, M365) — marked <em>hosted</em> without probing. Bounces handled reactively via Resend webhooks.</li>
              <li><strong>Business domains</strong> — full SMTP handshake via self-hosted verifier. Returns <em>valid</em>, <em>invalid</em>, <em>catch_all</em>, or <em>dns_ok</em>.</li>
              <li><strong>Blocked from campaigns</strong>: <em>invalid</em> (hard rejected) and <em>catch_all</em> (domain accepts everything — mailbox unconfirmable, generates deferred bounces).</li>
              <li><strong>Retried every 7 days</strong>: <em>dns_ok</em> contacts whose SMTP handshake was inconclusive.</li>
              <li>Any hard bounce from Resend auto-suppresses the contact immediately.</li>
            </ul>
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
};

export default EmailVerification;
