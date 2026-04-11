import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContextProvider as useOrgContext } from "@/contexts/OrgContextProvider";

export interface ChatMessage {
  id: string;
  role: "amit" | "arohan";
  content: string;
  isLoading?: boolean;
  isSuggestion?: boolean;
  actionsTriggered?: Array<{ type: string; details: Record<string, unknown> }>;
}

interface SendResult {
  reply: string;
  is_suggestion: boolean;
  actions_triggered: Array<{ type: string; details: Record<string, unknown> }>;
}

export function useArohanChat() {
  const { effectiveOrgId } = useOrgContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate once per hook instance — all messages in this session share a thread
  const threadIdRef = useRef<string>(crypto.randomUUID());

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim() || isSending || !effectiveOrgId) return;

      setError(null);

      // Add Amit's message optimistically
      const amitId = crypto.randomUUID();
      const loadingId = crypto.randomUUID();

      setMessages((prev) => [
        ...prev,
        { id: amitId, role: "amit", content: text.trim() },
        { id: loadingId, role: "arohan", content: "", isLoading: true },
      ]);

      setIsSending(true);

      try {
        // Get a fresh JWT for the request
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not authenticated");

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

        const res = await fetch(`${supabaseUrl}/functions/v1/mkt-arohan-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            org_id: effectiveOrgId,
            thread_id: threadIdRef.current,
            message: text.trim(),
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || "Arohan is unavailable. Please try again.");
        }

        const result: SendResult = await res.json();

        // Replace loading placeholder with real response
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingId
              ? {
                  id: loadingId,
                  role: "arohan",
                  content: result.reply,
                  isSuggestion: result.is_suggestion,
                  actionsTriggered: result.actions_triggered,
                }
              : m
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        // Remove the loading placeholder on error
        setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      } finally {
        setIsSending(false);
      }
    },
    [effectiveOrgId, isSending]
  );

  const clearThread = useCallback(() => {
    threadIdRef.current = crypto.randomUUID();
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isSending,
    error,
    sendMessage,
    clearThread,
    threadId: threadIdRef.current,
  };
}
