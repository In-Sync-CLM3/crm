import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { db, resetDatabase } from "@/lib/db";
import { swManager } from "@/lib/serviceWorker";
import { syncAnalytics, type SyncAttempt } from "@/services/syncAnalytics";
import { networkMonitor } from "@/services/networkMonitor";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { toast } from "sonner";

export default function SyncMonitoring() {
  const [attempts, setAttempts] = useState<SyncAttempt[]>(syncAnalytics.getAttempts());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const queueItems = useLiveQuery(() => db.syncQueue.toArray(), [], []);

  useEffect(() => {
    return syncAnalytics.subscribe(setAttempts);
  }, []);

  const stats = syncAnalytics.getStats();
  const networkStatus = networkMonitor.getStatus();

  const failedItems = (queueItems ?? []).filter(
    (i) => i.retryCount >= i.maxRetries
  );
  const pendingItems = (queueItems ?? []).filter(
    (i) => i.retryCount < i.maxRetries
  );

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await swManager.requestSync();
      toast.success("Sync completed");
    } catch (err) {
      toast.error("Sync failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetDatabase = async () => {
    if (
      !confirm(
        "Reset the offline database? This deletes all locally queued (un-synced) changes."
      )
    ) {
      return;
    }
    setIsResetting(true);
    try {
      await resetDatabase();
      toast.success("Offline database reset");
    } catch (err) {
      toast.error("Reset failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sync Monitoring</h1>
        <div className="flex gap-2">
          <Button onClick={handleManualSync} disabled={isSyncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
            Force Sync
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              syncAnalytics.clear();
              toast.success("Analytics cleared");
            }}
          >
            Clear Logs
          </Button>
          <Button
            variant="destructive"
            onClick={handleResetDatabase}
            disabled={isResetting}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Reset DB
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Attempts (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats.successRate * 100).toFixed(0)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Failed Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{failedItems.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Network</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">
              {networkStatus.quality}
            </div>
          </CardContent>
        </Card>
      </div>

      {failedItems.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{failedItems.length} item(s) failed permanently</AlertTitle>
          <AlertDescription>
            These items hit max retries. Review the errors below or reset the
            offline DB to discard them.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pending Queue ({pendingItems.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending items.</p>
          ) : (
            <ul className="divide-y">
              {pendingItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {item.type} · {item.action}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      entity: {item.entityId} · retries: {item.retryCount}/
                      {item.maxRetries}
                    </div>
                    {item.error && (
                      <div className="text-xs text-destructive mt-1">
                        {item.error}
                      </div>
                    )}
                  </div>
                  <Badge variant="secondary">queued</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Attempts</CardTitle>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attempts yet.</p>
          ) : (
            <ul className="divide-y">
              {attempts.slice(0, 30).map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{a.type}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(a.timestamp).toLocaleString()}
                      {typeof a.durationMs === "number" &&
                        ` · ${a.durationMs}ms`}
                    </div>
                    {a.error && (
                      <div className="text-xs text-destructive mt-1">
                        {a.error}
                      </div>
                    )}
                  </div>
                  <Badge
                    variant={
                      a.status === "success"
                        ? "default"
                        : a.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {a.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </div>
    </DashboardLayout>
  );
}
