import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { WifiOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const pendingCount = useLiveQuery(() => db.syncQueue.count(), [], 0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-yellow-500/10 border-yellow-600 text-yellow-900 dark:text-yellow-200">
      <WifiOff className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span className="text-sm">
          You're offline. Changes will sync when connection returns.
          {pendingCount > 0 && ` (${pendingCount} pending)`}
        </span>
      </AlertDescription>
    </Alert>
  );
}

export default OfflineBanner;
