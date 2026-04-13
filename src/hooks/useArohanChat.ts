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
        // Use functions.invoke() — it auto-refreshes the session token before calling,
        // preventing 401 "Invalid JWT" errors when the cached token has expired.
        const { data: result, error: fnError } = await supabase.functions.invoke<SendResult>(
          "mkt-arohan-chat",
          {
            body: {
              org_id: effectiveOrgId,
              thread_id: threadIdRef.current,
              message: text.trim(),
            },
          }
        );

        if (fnError) throw new Error(fnError.message || "Arohan is unavailable. Please try again.");
        if (!result) throw new Error("Empty response from Arohan");

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
