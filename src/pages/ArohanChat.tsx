import { useState, useRef, useEffect, KeyboardEvent } from "react";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useArohanChat, ChatMessage } from "@/hooks/useArohanChat";
import { useArohanContext, CampaignStat, TechRequest } from "@/hooks/useArohanContext";
import {
  Send,
  RefreshCw,
  RotateCcw,
  Zap,
  CheckCircle2,
  Radio,
  Users,
  TrendingUp,
  Clock,
  ChevronRight,
  Wrench,
  PanelRight,
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

            {msg.actionsTriggered && msg.actionsTriggered.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/40">
                {msg.actionsTriggered.map((action, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] gap-1 py-0">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    {action.type === "icp_update"
                      ? `ICP updated — ${(action.details as { product_key?: string }).product_key ?? ""} v${(action.details as { new_version?: number }).new_version ?? "?"}`
                      : action.type === "regenerate_step"
                      ? `Regenerating ${(action.details as { step_name?: string }).step_name?.replace(/_/g, " ") ?? "step"} — ${(action.details as { product_key?: string }).product_key ?? ""}`
                      : action.type === "campaign_launch"
                      ? `Campaign launched — ${(action.details as { product_key?: string }).product_key ?? ""} · ${(action.details as { enrolled?: number }).enrolled ?? 0} enrolled`
                      : action.type === "campaign_pause"
                      ? `Campaign paused — ${(action.details as { product_key?: string }).product_key ?? ""}`
                      : action.type === "campaign_resume"
                      ? `Campaign resumed — ${(action.details as { product_key?: string }).product_key ?? ""}`
                      : action.type === "tech_request"
                      ? `Tech request logged — ${(action.details as { title?: string }).title ?? "pending"}`
                      : action.type}
                  </Badge>
                ))}
              </div>
            )}

            {msg.isSuggestion && !msg.actionsTriggered?.length && (
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
// Context panel — campaigns
// ---------------------------------------------------------------------------

function CampaignCard({ c }: { c: CampaignStat }) {
  const openRate = c.sent > 0 ? Math.round((c.opened / c.sent) * 100) : 0;
  const delivRate = c.sent > 0 ? Math.round((c.delivered / c.sent) * 100) : 0;

  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 text-xs space-y-1.5",
        c.isLive ? "border-green-400 bg-green-50/50" : "border-border bg-background"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium truncate">{c.name}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {c.isLive && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          )}
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] py-0 px-1",
              c.status === "active" ? "text-green-700 border-green-300" : "text-amber-700 border-amber-300"
            )}
          >
            {c.isLive ? "Live" : c.status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
        <div>
          <div className="font-medium text-foreground">{c.enrolled.toLocaleString()}</div>
          <div>enrolled</div>
        </div>
        <div>
          <div className="font-medium text-foreground">{c.sent.toLocaleString()}</div>
          <div>sent</div>
        </div>
        <div>
          <div className="font-medium text-foreground">{openRate}%</div>
          <div>open rate</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
        <div>
          <div className="font-medium text-foreground">{delivRate}%</div>
          <div>delivered</div>
        </div>
        <div>
          <div className="font-medium text-foreground">{c.replied}</div>
          <div>replied</div>
        </div>
        <div>
          <div className="font-medium text-foreground text-blue-600">{c.todaySent}</div>
          <div>today</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context panel
// ---------------------------------------------------------------------------

function ContextPanel({ onRefresh }: { onRefresh: () => void }) {
  const { context, isLoading } = useArohanContext();

  const funnelOrder = ["new", "enriched", "scored", "enrolled", "converted", "unsubscribed", "disqualified"];
  const funnelColors: Record<string, string> = {
    new: "text-gray-600",
    enriched: "text-blue-600",
    scored: "text-indigo-600",
    enrolled: "text-purple-600",
    converted: "text-green-600",
    unsubscribed: "text-amber-600",
    disqualified: "text-red-500",
  };

  const totalContacts = context
    ? Object.values(context.funnel).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto pr-0.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live Context</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefresh}>
          <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Campaigns */}
      <Card className="border shadow-none">
        <CardHeader className="p-2 pb-1">
          <CardTitle className="text-[11px] flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-green-500" />
            Campaigns
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-0 space-y-1.5">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : context?.campaigns.length ? (
            context.campaigns.map((c) => <CampaignCard key={c.id} c={c} />)
          ) : (
            <div className="text-xs text-muted-foreground">No sequenced campaigns.</div>
          )}
        </CardContent>
      </Card>

      {/* Contact Funnel */}
      <Card className="border shadow-none">
        <CardHeader className="p-2 pb-1">
          <CardTitle className="text-[11px] flex items-center gap-1.5">
            <Users className="h-3 w-3 text-blue-500" />
            Contact Funnel
            {totalContacts > 0 && (
              <span className="text-muted-foreground font-normal">· {totalContacts.toLocaleString()} total</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-0">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : context?.funnel ? (
            <div className="space-y-1">
              {funnelOrder
                .filter((s) => (context.funnel[s] ?? 0) > 0)
                .map((s) => {
                  const count = context.funnel[s] ?? 0;
                  const pct = totalContacts > 0 ? Math.round((count / totalContacts) * 100) : 0;
                  return (
                    <div key={s} className="flex items-center gap-2 text-[11px]">
                      <ChevronRight className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
                      <span className="capitalize w-20 text-muted-foreground">{s}</span>
                      <div className="flex-1 bg-muted rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-primary/40"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={cn("w-12 text-right font-medium", funnelColors[s] ?? "text-foreground")}>
                        {count.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No contacts yet.</div>
          )}
        </CardContent>
      </Card>

      {/* Pending Suggestions */}
      {(context?.pending?.length ?? 0) > 0 && (
        <Card className="border shadow-none border-yellow-200 bg-yellow-50/40">
          <CardHeader className="p-2 pb-1">
            <CardTitle className="text-[11px] flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-yellow-500" />
              Pending Suggestions
              <Badge variant="secondary" className="text-[9px] py-0 px-1 ml-auto">
                {context!.pending.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0 space-y-1.5">
            {context!.pending.map((s) => (
              <div key={s.id} className="rounded border border-yellow-200 bg-white p-2 text-[11px]">
                <p className="text-muted-foreground line-clamp-2">{s.message}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {s.suggestion_payload && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1 ml-auto capitalize">
                      {(s.suggestion_payload as Record<string, unknown>).type as string}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tech Requests */}
      {(context?.techRequests?.length ?? 0) > 0 && (
        <Card className="border shadow-none border-orange-200 bg-orange-50/40">
          <CardHeader className="p-2 pb-1">
            <CardTitle className="text-[11px] flex items-center gap-1.5">
              <Wrench className="h-3 w-3 text-orange-500" />
              Tech Requests
              <Badge variant="secondary" className="text-[9px] py-0 px-1 ml-auto">
                {context!.techRequests.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0 space-y-1.5">
            {context!.techRequests.map((r: TechRequest) => (
              <div key={r.id} className="rounded border border-orange-200 bg-white p-2 text-[11px]">
                <p className="font-medium text-foreground">{r.title}</p>
                <p className="text-muted-foreground line-clamp-2 mt-0.5">{r.description}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] py-0 px-1",
                      r.priority === "high" ? "text-red-700 border-red-300" :
                      r.priority === "low" ? "text-gray-500 border-gray-300" :
                      "text-orange-700 border-orange-300"
                    )}
                  >
                    {r.priority}
                  </Badge>
                  <Clock className="h-2.5 w-2.5 text-muted-foreground ml-auto" />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stats strip */}
      {context && (
        <div className="mt-auto pt-2 border-t">
          <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>
                {context.campaigns.reduce((a, c) => a + c.todaySent, 0).toLocaleString()} sent today
              </span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span>
                {(context.funnel["converted"] ?? 0).toLocaleString()} converted
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Welcome state
// ---------------------------------------------------------------------------

const STARTER_QUESTIONS = [
  "What's the current campaign performance?",
  "Which campaign is live right now and how is it doing?",
  "How many leads have converted this month?",
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
  const { refetch: refetchContext } = useArohanContext();
  const [input, setInput] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      <div className="flex h-[calc(100vh-80px)] gap-0 md:gap-4">
        {/* ── Chat column ── */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b">
            <div className="min-w-0">
              <h1 className="text-lg font-bold flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  A
                </span>
                Arohan
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                Autonomous revenue intelligence · Ask anything
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearThread}
                  className="gap-1.5 text-xs text-muted-foreground h-7"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="hidden sm:inline">New thread</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setContextOpen(true)}
                className="md:hidden gap-1.5 text-xs h-7"
                aria-label="Open live context"
              >
                <PanelRight className="h-3.5 w-3.5" />
                Context
              </Button>
            </div>
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
              Arohan can update ICPs, launch/pause campaigns, and regenerate content automatically.
            </p>
          </div>
        </div>

        {/* ── Context panel (desktop) ── */}
        <div className="hidden md:block w-72 flex-shrink-0 border-l pl-4 py-1">
          <ContextPanel onRefresh={refetchContext} />
        </div>

        {/* ── Context panel (mobile sheet) ── */}
        <Sheet open={contextOpen} onOpenChange={setContextOpen}>
          <SheetContent side="right" className="w-[88vw] sm:max-w-sm p-4 overflow-y-auto">
            <ContextPanel onRefresh={refetchContext} />
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}
