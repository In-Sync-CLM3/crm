import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, BarChart3, Globe } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Step-1 quota per campaign — matches mkt_engine_config.sequence_settings.step1_target
const STEP1_TARGET = 1000;

interface CampaignStat {
  campaign_id: string;
  name: string;
  product_key: string;
  status: string;
  sequence_priority: number | null;
  created_at: string;
  active_enrollments: number;
  total_enrollments: number;
  step1_sent: number;
  step1_failed: number;
  step1_skipped: number;
  total_opens: number;
  total_clicks: number;
  total_replies: number;
}

interface Ga4Row {
  product_key: string;
  campaign_slug: string | null;
  date: string;
  sessions: number;
  active_users: number;
  engaged_sessions: number;
}

function pct(num: number, den: number) {
  if (!den) return '—';
  return `${((num / den) * 100).toFixed(1)}%`;
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'active' ? 'default' : status === 'paused' ? 'secondary' : 'outline';
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

// ── Arohan Sequences Tab ─────────────────────────────────────────────────────

function ArohanSequencesTab({ orgId }: { orgId: string }) {
  const { data: stats = [], isLoading } = useQuery<CampaignStat[]>({
    queryKey: ['mkt-campaign-stats', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mkt_campaign_stats', { p_org_id: orgId });
      if (error) throw error;
      return (data as CampaignStat[]) || [];
    },
    enabled: !!orgId,
    refetchInterval: 60_000,
  });

  const totalEnrolled = stats.reduce((s, c) => s + c.total_enrollments, 0);
  const totalSent     = stats.reduce((s, c) => s + c.step1_sent, 0);
  const totalFailed   = stats.reduce((s, c) => s + c.step1_failed, 0);
  const totalOpens    = stats.reduce((s, c) => s + c.total_opens, 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Enrolled</CardDescription>
            <CardTitle className="text-2xl">{totalEnrolled.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Step-1 Sent</CardDescription>
            <CardTitle className="text-2xl text-green-600">{totalSent.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Step-1 Failed</CardDescription>
            <CardTitle className="text-2xl text-red-500">{totalFailed.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Opens</CardDescription>
            <CardTitle className="text-2xl">{totalOpens.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Per-campaign table */}
      <Card>
        <CardHeader>
          <CardTitle>Sequence Campaigns</CardTitle>
          <CardDescription>Step-1 = first email per enrolled contact. Quota = {STEP1_TARGET} per campaign.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead>Step-1 Progress</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Open %</TableHead>
                <TableHead className="text-right">Click %</TableHead>
                <TableHead className="text-right">Replies</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((c) => {
                const sent    = Number(c.step1_sent);
                const failed  = Number(c.step1_failed);
                const opens   = Number(c.total_opens);
                const clicks  = Number(c.total_clicks);
                const replies = Number(c.total_replies);
                const progress = Math.min(100, (sent / STEP1_TARGET) * 100);
                return (
                  <TableRow key={c.campaign_id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.product_key}</div>
                    </TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-right">{Number(c.total_enrollments).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{Number(c.active_enrollments).toLocaleString()}</TableCell>
                    <TableCell className="min-w-[160px]">
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="flex-1 h-2" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {sent.toLocaleString()} / {STEP1_TARGET.toLocaleString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-right ${failed > 0 ? 'text-red-500' : ''}`}>
                      {failed.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">{pct(opens, sent)}</TableCell>
                    <TableCell className="text-right">{pct(clicks, sent)}</TableCell>
                    <TableCell className="text-right">{replies.toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── GA4 Landing Traffic Tab ──────────────────────────────────────────────────

function Ga4TrafficTab({ orgId }: { orgId: string }) {
  const { data: rows = [], isLoading } = useQuery<Ga4Row[]>({
    queryKey: ['mkt-ga4-traffic', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mkt_ga4_traffic')
        .select('product_key, campaign_slug, date, sessions, active_users, engaged_sessions')
        .eq('org_id', orgId)
        .order('date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No GA4 traffic data yet</p>
          <p className="text-sm mt-1">Data syncs daily at 4 AM UTC. First results will appear after your emails generate landing page visits.</p>
        </CardContent>
      </Card>
    );
  }

  // Aggregate by product_key
  const byProduct = rows.reduce<Record<string, { sessions: number; users: number; engaged: number; dates: Set<string>; campaigns: Set<string> }>>((acc, r) => {
    if (!acc[r.product_key]) acc[r.product_key] = { sessions: 0, users: 0, engaged: 0, dates: new Set(), campaigns: new Set() };
    acc[r.product_key].sessions += r.sessions;
    acc[r.product_key].users   += r.active_users;
    acc[r.product_key].engaged += r.engaged_sessions;
    acc[r.product_key].dates.add(r.date);
    if (r.campaign_slug) acc[r.product_key].campaigns.add(r.campaign_slug);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Landing Page Traffic</CardTitle>
        <CardDescription>From utm_source=insync_engine — synced daily from GA4</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Active Users</TableHead>
              <TableHead className="text-right">Engaged Sessions</TableHead>
              <TableHead className="text-right">Engagement %</TableHead>
              <TableHead className="text-right">Days Tracked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(byProduct).map(([pk, m]) => (
              <TableRow key={pk}>
                <TableCell className="font-medium">{pk}</TableCell>
                <TableCell className="text-right">{m.sessions.toLocaleString()}</TableCell>
                <TableCell className="text-right">{m.users.toLocaleString()}</TableCell>
                <TableCell className="text-right">{m.engaged.toLocaleString()}</TableCell>
                <TableCell className="text-right">{pct(m.engaged, m.sessions)}</TableCell>
                <TableCell className="text-right">{m.dates.size}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function CampaignAnalyticsTab() {
  const { effectiveOrgId } = useOrgContext();
  const [tab, setTab] = useState('arohan');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Campaign Analytics</h2>
        <p className="text-muted-foreground">Arohan sequence performance and landing page traffic</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="arohan">
            <Bot className="h-4 w-4 mr-2" />
            Arohan Sequences
          </TabsTrigger>
          <TabsTrigger value="ga4">
            <Globe className="h-4 w-4 mr-2" />
            Landing Traffic
          </TabsTrigger>
          <TabsTrigger value="legacy">
            <BarChart3 className="h-4 w-4 mr-2" />
            Legacy Bulk
          </TabsTrigger>
        </TabsList>

        <TabsContent value="arohan">
          {effectiveOrgId && <ArohanSequencesTab orgId={effectiveOrgId} />}
        </TabsContent>

        <TabsContent value="ga4">
          {effectiveOrgId && <Ga4TrafficTab orgId={effectiveOrgId} />}
        </TabsContent>

        <TabsContent value="legacy">
          <LegacyBulkTab orgId={effectiveOrgId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Legacy Bulk Tab (kept for historical reference) ──────────────────────────

function LegacyBulkTab({ orgId }: { orgId: string | null }) {
  const { data: emailCampaigns = [], isLoading } = useQuery({
    queryKey: ['legacy-email-campaigns', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('email_bulk_campaigns')
        .select('id, name, status, sent_count, failed_count, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Legacy Bulk Email Campaigns</CardTitle>
        <CardDescription>Pre-Arohan one-off bulk sends — historical reference only</CardDescription>
      </CardHeader>
      <CardContent>
        {emailCampaigns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No legacy campaigns found</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emailCampaigns.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name || '—'}</TableCell>
                  <TableCell className="text-right">{c.sent_count || 0}</TableCell>
                  <TableCell className="text-right">{c.failed_count || 0}</TableCell>
                  <TableCell><StatusBadge status={c.status || 'unknown'} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
