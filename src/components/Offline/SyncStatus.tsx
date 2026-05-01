import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Cloud, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { swManager, type SWStatus } from "@/lib/serviceWorker";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";

export function SyncStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [swStatus, setSwStatus] = useState<SWStatus>({
    registered: false,
    supported: false,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  const pendingCount = useLiveQuery(async () => {
    const items = await db.syncQueue.toArray();
    return items.filter((i) => i.retryCount < i.maxRetries).length;
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    swManager.getStatus().then(setSwStatus);
    const unsubscribe = swManager.onSyncStatusChange(setSwStatus);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
    };
  }, []);

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

  const renderBadge = () => {
    if (!isOnline) {
      return (
        <Badge variant="outline" className="gap-1">
          <WifiOff className="w-3 h-3" />
          Offline
        </Badge>
      );
    }
    if (pendingCount && pendingCount > 0) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Cloud className="w-3 h-3" />
          {pendingCount} Pending
        </Badge>
      );
    }
    return (
      <Badge variant="default" className="gap-1">
        <Wifi className="w-3 h-3" />
        Synced
      </Badge>
    );
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>{renderBadge()}</TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1 text-xs">
              <div>Status: {isOnline ? "Online" : "Offline"}</div>
              {swStatus.registered && <div>Background Sync: Enabled</div>}
              {pendingCount !== undefined && pendingCount > 0 && (
                <div>Pending: {pendingCount} items</div>
              )}
              {swStatus.lastSync && (
                <div>Last Sync: {swStatus.lastSync.toLocaleTimeString()}</div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        {pendingCount !== undefined && pendingCount > 0 && isOnline && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="h-8 w-8"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sync Now</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

export default SyncStatus;
