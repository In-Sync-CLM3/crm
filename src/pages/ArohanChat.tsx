import { useState, useRef, useEffect, KeyboardEvent } from "react";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useArohanChat, ChatMessage } from "@/hooks/useArohanChat";
import {
  Send,
  RefreshCw,
  RotateCcw,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isAmit = msg.role === "amit";

  return (
    <div className={cn("flex gap-2", isAmit ? "justify-end" : "justify-start")}>
      {!isAmit && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold mt-1">
          A
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
          isAmit
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        )}
      >
        {msg.isLoading ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </span>
        ) : (
          <>
            <p className="whitespace-pre-wrap">{msg.content}</p>

            {/* Action chips */}
            {msg.actionsTriggered && msg.actionsTriggered.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/40">
                {msg.actionsTriggered.map((action, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="text-[10px] gap-1 py-0"
                  >
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    {action.type === "icp_update"
                      ? `ICP updated — ${(action.details as { product_key?: string }).product_key ?? ""} v${(action.details as { new_version?: number }).new_version ?? "?"}`
                      : action.type === "regenerate_step"
                      ? `Regenerating ${(action.details as { step_name?: string }).step_name?.replace(/_/g, " ") ?? "step"} — ${(action.details as { product_key?: string }).product_key ?? ""}`
                      : action.type === "campaign_launch"
                      ? `Campaign launched — ${(action.details as { product_key?: string }).product_key ?? ""} · ${(action.details as { enrolled?: number }).enrolled ?? 0} leads enrolled`
                      : action.type === "campaign_pause"
                      ? `Campaign paused — ${(action.details as { product_key?: string }).product_key ?? ""} · ${(action.details as { paused?: number }).paused ?? 0} enrollments halted`
                      : action.type === "campaign_resume"
                      ? `Campaign resumed — ${(action.details as { product_key?: string }).product_key ?? ""} · ${(action.details as { resumed?: number }).resumed ?? 0} enrollments restarted`
                      : action.type}
                  </Badge>
                ))}
              </div>
            )}

            {/* Suggestion indicator */}
            {msg.isSuggestion && (
              <Badge variant="outline" className="mt-1.5 text-[10px] gap-1">
                <Zap className="h-3 w-3 text-yellow-500" />
                Suggestion detected
              </Badge>
            )}
          </>
        )}
      </div>

      {isAmit && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold mt-1">
          M
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Welcome state
// ---------------------------------------------------------------------------

const STARTER_QUESTIONS = [
  "What's the current ICP for our products?",
  "Which campaign is performing best this month?",
  "I think we should add CFOs to the target designations for VisitorVault.",
  "What's blocking us from hitting M3 milestone?",
];

function WelcomeScreen({ onStarter }: { onStarter: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold mb-4">
        A
      </div>
      <h2 className="text-lg font-semibold mb-1">Arohan — Revenue Intelligence</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-8">
        Ask me about ICP strategy, campaign performance, lead quality, or suggest
        refinements. I'll apply approved changes automatically.
      </p>
      <div className="grid gap-2 w-full max-w-sm">
        {STARTER_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onStarter(q)}
            className="text-left px-3 py-2.5 rounded-lg border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ArohanChat() {
  const { messages, isSending, error, sendMessage, clearThread } = useArohanChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput("");
    sendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStarter = (q: string) => {
    setInput(q);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-80px)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                A
              </span>
              Arohan
            </h1>
            <p className="text-xs text-muted-foreground">
              Autonomous revenue intelligence · Ask anything
            </p>
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearThread}
              className="gap-1.5 text-xs text-muted-foreground h-7"
            >
              <RotateCcw className="h-3 w-3" />
              New thread
            </Button>
          )}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 py-4">
          {messages.length === 0 ? (
            <WelcomeScreen onStarter={handleStarter} />
          ) : (
            <div className="space-y-4 px-1">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {error && (
                <p className="text-xs text-destructive text-center py-2">{error}</p>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="pt-3 border-t">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Arohan or suggest a change… (Enter to send, Shift+Enter for newline)"
              className="min-h-[60px] max-h-[160px] resize-none text-sm"
              disabled={isSending}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              size="sm"
              className="h-10 w-10 p-0 shrink-0"
            >
              {isSending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Arohan can update ICPs automatically when you make a clear suggestion.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
