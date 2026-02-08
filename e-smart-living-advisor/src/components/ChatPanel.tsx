import { useRef, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import LayoutUpload from "./LayoutUpload";
import * as api from "@/lib/api";
// Constants are defined locally below
import { parseDimensionUpdates } from "@/utils/roomParsing";

interface Message {
  id: string;
  type: "assistant" | "user";
  content: string;
  streaming?: boolean;
}

/**
 * Props for ChatPanel component
 */
interface ChatPanelProps {
  /** Called when advisor offers a plan (action === "offer_plan") */
  onPlanGenerated?: (response: api.AdvisorChatResponse) => void;
  /** Called with analysis and optional image URL (for image uploads) so the original plan can be shown */
  onLayoutAnalyzed?: (analysis: api.LayoutAnalysis, imageUrl?: string) => void;
  /** When user returns from layout editor after confirm, chat should use this layout_id */
  initialLayoutId?: string | null;
  /** Called with layout from each advisor response so "Your layout" stays in sync with what the chat uses */
  onLayoutFromChat?: (layout: api.LayoutAnalysis) => void;
  /** Current layout state from Index (for bidirectional sync) */
  currentLayout?: api.LayoutAnalysis | null;
  /** Called when chat parses dimension updates from user message, updates Index state */
  onLayoutUpdate?: (layout: api.LayoutAnalysis) => void;
}

const DEMO_CUSTOMER_ID = "CUST_1001";
const STREAMING_ID = "__streaming__";
const ANALYZING_ID = "__analyzing__";

/** Renders message content with basic **bold** support (streaming-friendly, no extra deps). */
function MessageContent({ content, streaming }: { content: string; streaming?: boolean }) {
  const safe = typeof content === "string" ? content : "";
  const parts = safe.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
      {streaming && (
        <span className="inline-flex gap-1 ml-1.5 align-middle" aria-hidden>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
        </span>
      )}
    </p>
  );
}

/** Normalize room name: fix common typos, lowercase, trim, remove articles */
function normalizeRoomName(name: string): string {
  const typoMap: Record<string, string> = {
    "carage": "garage",
    "garage": "garage",
    "garaje": "garage",
    "bedrom": "bedroom",
    "bathrom": "bathroom",
    "kichen": "kitchen",
    "livng": "living",
  };
  let normalized = name.toLowerCase().trim();
  
  // Remove articles at the start ("a", "an", "the")
  normalized = normalized.replace(/^(a|an|the)\s+/i, "");
  
  // Fix typos
  for (const [typo, correct] of Object.entries(typoMap)) {
    if (normalized.includes(typo)) {
      normalized = normalized.replace(typo, correct);
    }
  }
  return normalized.replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim();
}

/** Estimate dimensions from area (e.g., 50 sq ft -> reasonable width×length) */
function estimateDimensionsFromArea(area: number): { width: number; length: number } {
  // Validate bounds: reasonable room sizes (1-100000 sq ft)
  const clampedArea = Math.max(1, Math.min(100000, area));
  
  // Try to find reasonable dimensions: prefer square-ish or slightly rectangular
  const sqrt = Math.sqrt(clampedArea);
  // Round to reasonable values
  if (clampedArea <= 100) {
    // Small rooms: try to make square-ish
    const w = Math.round(sqrt * 0.8 * 10) / 10;
    const l = Math.round((clampedArea / w) * 10) / 10;
    return { width: Math.max(w, 1), length: Math.max(l, 1) };
  } else {
    // Larger rooms: slightly rectangular (e.g., 1.2:1 ratio)
    const w = Math.round(sqrt * 0.9 * 10) / 10;
    const l = Math.round((clampedArea / w) * 10) / 10;
    return { width: Math.max(w, 1), length: Math.max(l, 1) };
  }
}

/** Match room name with priority: exact > specific > fuzzy */
function matchRoomName(mentioned: string, existing: string): { match: boolean; priority: number } {
  const normMentioned = normalizeRoomName(mentioned);
  const normExisting = normalizeRoomName(existing);
  
  // Priority 1: Exact match
  if (normMentioned === normExisting) {
    return { match: true, priority: 1 };
  }
  
  // Priority 2: One contains the other exactly (e.g., "kitchen/dining" contains "kitchen")
  if (normMentioned.includes(normExisting) || normExisting.includes(normMentioned)) {
    // Prefer more specific match (longer name)
    const specificity = Math.abs(normMentioned.length - normExisting.length);
    return { match: true, priority: 2 - (specificity / 100) }; // More specific = higher priority
  }
  
  // Priority 3: Word-based fuzzy match (require words > 3 chars to avoid "bed" matching "bedroom")
  const mentionedWords = normMentioned.split(/\s+|\//).filter(w => w.length > 3);
  const existingWords = normExisting.split(/\s+|\//).filter(w => w.length > 3);
  
  if (mentionedWords.length > 0 && existingWords.length > 0) {
    const matchingWords = mentionedWords.filter(w => existingWords.some(ew => ew.includes(w) || w.includes(ew)));
    if (matchingWords.length > 0) {
      // More matching words = higher priority
      return { match: true, priority: 3 - (matchingWords.length / 10) };
    }
  }
  
  return { match: false, priority: 0 };
}


/**
 * Main chat panel component for interacting with the Smart Living Advisor.
 * Handles message display, streaming responses, layout uploads, and dimension parsing.
 */
const ChatPanel = ({ onPlanGenerated, onLayoutAnalyzed, initialLayoutId, onLayoutFromChat, currentLayout, onLayoutUpdate }: ChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "assistant",
      content:
        "Hi, I'm your Smart Living Advisor from e&. I can design a secure, connected, and entertainment-ready home for you. Tell me about your home, or upload your floor plan to get started.",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [hasUploadedLayout, setHasUploadedLayout] = useState(false);
  const [layoutId, setLayoutId] = useState<string | null>(initialLayoutId ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Track the most recent locally updated layout to prevent backend from overwriting user changes
  const lastLocalUpdateRef = useRef<api.LayoutAnalysis | null>(null);

  useEffect(() => {
    if (initialLayoutId) setLayoutId(initialLayoutId);
  }, [initialLayoutId]);

  // Sync layoutId when currentLayout changes (e.g. from panel edits or chat updates)
  useEffect(() => {
    if (currentLayout?.layout_id && currentLayout.layout_id !== layoutId) {
      setLayoutId(currentLayout.layout_id);
    }
  }, [currentLayout?.layout_id, layoutId]);

  // Only scroll to bottom when user sends a message, not on every render or LLM response
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  const userSentMessageRef = useRef(false);

  useEffect(() => {
    // Only auto-scroll when user sends a message, not on initial load or LLM streaming
    if (userSentMessageRef.current) {
      scrollToBottom();
      userSentMessageRef.current = false;
    }
  }, [messages]);

  const toChatMessages = (msgs: Message[]): api.ChatMessage[] =>
    msgs
      .filter((m) => m.id !== STREAMING_ID)
      .map((m) => ({ role: m.type === "user" ? "user" : "assistant", content: m.content }));

  const runStream = async (payload: api.AdvisorChatRequest) => {
    let finalReceived = false;
    setMessages((prev) => [...prev, { id: STREAMING_ID, type: "assistant", content: "", streaming: true }]);

    try {
      await api.advisorChatStream(payload, {
        onPartial(chunk) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === STREAMING_ID ? { ...m, content: m.content + chunk } : m
            )
          );
        },
        onFinal(final) {
          finalReceived = true;
          setMessages((prev) =>
            prev
              .filter((m) => m.id !== ANALYZING_ID)
              .map((m) =>
                m.id === STREAMING_ID
                  ? { ...m, id: Date.now().toString(), content: final.answer, streaming: false }
                  : m
              )
          );
          if (final.action === "offer_plan") onPlanGenerated?.(final);
          // LLM now handles layout updates - prioritize LLM's updated layout over parser fallback
          if (onLayoutFromChat && final.layout && typeof final.layout === "object" && (final.layout as { layout_id?: string }).layout_id) {
            // LLM has processed the message and may have updated the layout
            // Use LLM's updated layout (it's authoritative and handles all natural language)
            onLayoutFromChat(final.layout as unknown as api.LayoutAnalysis);
            // Clear parser fallback since LLM update is authoritative
            lastLocalUpdateRef.current = null;
          }
        },
      });
    } catch {
      // fallback: use non-streaming API so response is always shown
    }

    if (!finalReceived) {
      try {
        const res = await api.advisorChat(payload);
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== ANALYZING_ID)
            .map((m) =>
              m.id === STREAMING_ID
                ? { ...m, id: Date.now().toString(), content: res.answer, streaming: false }
                : m
            )
        );
        if (res.action === "offer_plan") onPlanGenerated?.(res);
        // LLM now handles layout updates - prioritize LLM's updated layout over parser fallback
        if (onLayoutFromChat && res.layout && typeof res.layout === "object" && (res.layout as { layout_id?: string }).layout_id) {
          // LLM has processed the message and may have updated the layout
          // Use LLM's updated layout (it's authoritative and handles all natural language)
          onLayoutFromChat(res.layout as unknown as api.LayoutAnalysis);
          // Clear parser fallback since LLM update is authoritative
          lastLocalUpdateRef.current = null;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Sorry, I couldn't get a response. Please try again.";
        setError(msg);
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== ANALYZING_ID)
            .map((m) =>
            m.id === STREAMING_ID
              ? { ...m, id: Date.now().toString(), content: msg, streaming: false }
              : m
          )
        );
      }
    }
  };

  const handleUpload = async (file: File) => {
    setError(null);
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: ANALYZING_ID, type: "assistant", content: "Analyzing your floor plan — reading room names and dimensions exactly as labeled..." },
    ]);
    try {
      const analysis = await api.analyzeLayout(file);
      await api.upsertLayoutCache(analysis as unknown as Record<string, unknown>);
      setLayoutId(analysis.layout_id);
      setHasUploadedLayout(true);
      const imageUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      onLayoutAnalyzed?.(analysis, imageUrl);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== ANALYZING_ID),
        { id: Date.now().toString(), type: "user", content: `Uploaded: ${file.name}` },
      ]);

      const messagesWithoutAnalyzing = messages.filter((m) => m.id !== ANALYZING_ID);
      const conversationSoFar = [
        ...toChatMessages(messagesWithoutAnalyzing),
        { role: "user" as const, content: `Uploaded: ${file.name}` },
      ];
      await runStream({
        customer_id: DEMO_CUSTOMER_ID,
        messages: conversationSoFar,
        layout_id: analysis.layout_id,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== STREAMING_ID && m.id !== ANALYZING_ID),
        {
          id: Date.now().toString(),
          type: "assistant",
          content: "Sorry, I couldn't process that layout. Please try again or describe your home.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || loading) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setError(null);

    // BIDIRECTIONAL SYNC: Chat → Panel
    // LLM now handles layout updates - parser is fallback only for immediate UI feedback
    // If parser detects changes, update UI immediately, but LLM response will be authoritative
    let layoutToUse = currentLayout;
    if (currentLayout && onLayoutUpdate) {
      // Fallback parser for immediate UI feedback (LLM will return authoritative update)
      const parserUpdated = parseDimensionUpdates(userMessage, currentLayout);
      if (parserUpdated) {
        layoutToUse = parserUpdated;
        // Store parser result as fallback (LLM update takes priority when received)
        lastLocalUpdateRef.current = parserUpdated;
        // Update state immediately → LayoutSummary re-renders with new room
        onLayoutUpdate(parserUpdated);
        // Update backend cache so advisor uses the updated layout
        try {
          await api.upsertLayoutCache(parserUpdated as unknown as Record<string, unknown>);
        } catch {
          // Cache update failed, but continue with message send
        }
      } else if (currentLayout) {
        // No parser updates, but ensure cache has latest layout from panel edits
        // This ensures panel → chat sync is preserved (must await before sending chat)
        try {
          await api.upsertLayoutCache(currentLayout as unknown as Record<string, unknown>);
        } catch {
          // Cache update failed, but continue with message send
        }
      }
    }

    userSentMessageRef.current = true; // Mark that user sent a message to trigger scroll
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), type: "user", content: userMessage },
    ]);

    setLoading(true);
    try {
      const nextMessages = [
        ...toChatMessages(messages),
        { role: "user" as const, content: userMessage },
      ];
      await runStream({
        customer_id: DEMO_CUSTOMER_ID,
        messages: nextMessages,
        layout_id: layoutToUse?.layout_id ?? layoutId ?? undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== STREAMING_ID),
        {
          id: Date.now().toString(),
          type: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="card-premium p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm" />
        <h2 className="text-lg font-semibold text-foreground">AI Concierge</h2>
      </div>

      {error && (
        <div className="mb-3 p-2.5 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 mb-3 pr-1 scroll-smooth">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`animate-fade-in ${message.type === "assistant" ? "" : "flex justify-end"}`}
          >
            <div
              className={`max-w-[88%] w-fit rounded-2xl px-3.5 py-2.5 shadow-sm ${
                message.type === "assistant"
                  ? "bg-secondary/80 text-foreground border border-border/50"
                  : "bg-primary text-primary-foreground shadow-button/30"
              }`}
            >
              <MessageContent content={message.content} streaming={message.streaming} />
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {!hasUploadedLayout && <LayoutUpload onUpload={handleUpload} disabled={loading} loading={loading} />}

      <div className="relative">
        <input
          type="text"
          placeholder="Tell me about your home, or upload a layout…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading}
          className="w-full bg-secondary/80 rounded-full py-3 pl-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 border border-border/50 transition-all disabled:opacity-60"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={loading}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-button transition-all"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default ChatPanel;
