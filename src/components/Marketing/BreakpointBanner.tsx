import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

interface BreakpointLog {
  id: string;
  action_name: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function BreakpointBanner() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data: breakpoints = [] } = useQuery({
    queryKey: ["mkt-breakpoints"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mkt_engine_logs")
        .select("id, action_name, details, created_at")
        .eq("log_type", "breakpoint")
        .is("resolved_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch breakpoints:", error);
        return [];
      }
      return (data ?? []) as BreakpointLog[];
    },
    refetchInterval: 30_000,
  });

  const visible = breakpoints.filter((bp) => !dismissed.has(bp.id));

  if (visible.length === 0) return null;

  function handleDismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
  }

  return (
    <div className="space-y-2 mb-4">
      {visible.map((bp) => {
        const details = bp.details as Record<string, unknown> | null;
        const pausedComponent = details?.paused_component as string | undefined;
        const message = details?.message as string | undefined;

        return (
          <div
            key={bp.id}
            className="flex items-start gap-3 rounded-lg bg-red-500 text-white px-4 py-3"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  Breakpoint: {bp.action_name ?? "Unknown Action"}
                </span>
                {pausedComponent && (
                  <span className="text-xs bg-red-600 rounded px-2 py-0.5">
                    Paused: {pausedComponent}
                  </span>
                )}
              </div>
              {message && (
                <p className="text-xs mt-1 opacity-90">{message}</p>
              )}
              <p className="text-[10px] mt-1 opacity-75">
                Triggered {format(new Date(bp.created_at), "MMM d, yyyy h:mm a")}
              </p>
            </div>
            <button
              onClick={() => handleDismiss(bp.id)}
              className="shrink-0 hover:bg-red-600 rounded p-1 transition-colors"
              aria-label="Dismiss breakpoint"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
