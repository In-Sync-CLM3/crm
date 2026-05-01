import { useEffect } from "react";
import { toast } from "sonner";
import { swManager } from "@/lib/serviceWorker";

export function ServiceWorkerUpdateHandler() {
  useEffect(() => {
    const handleUpdate = () => {
      toast("New version available", {
        description: "Reload to update In-Sync CRM.",
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: async () => {
            await swManager.skipWaiting();
            window.location.reload();
          },
        },
      });
    };

    window.addEventListener("sw-update-available", handleUpdate);
    return () => window.removeEventListener("sw-update-available", handleUpdate);
  }, []);

  return null;
}

export default ServiceWorkerUpdateHandler;
