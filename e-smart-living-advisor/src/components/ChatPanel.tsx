import { useRef, useEffect, useState } from "react";
import { Send, Upload, X, Sparkles, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import LayoutUpload from "./LayoutUpload";
import * as api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { parseDimensionUpdates } from "@/utils/roomParsing";

const STREAMING_ID = "__streaming__";
const ANALYZING_ID = "__analyzing__";

/** Convert technical error messages to user-friendly ones */
function getFriendlyErrorMessage(error: string): string {
  const lowerError = error.toLowerCase();
  
  // API unavailable / OpenAI key issues
  if (lowerError.includes("openai_api_key") || lowerError.includes("temporarily unavailable") || lowerError.includes("503")) {
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
  
  // Network errors
  if (lowerError.includes("network") || lowerError.includes("fetch") || lowerError.includes("backend running")) {
    return "I can't reach the server right now. Please check your connection and try again.";
  }
  
  // Timeout errors
  if (lowerError.includes("timeout") || lowerError.includes("timed out")) {
    return "The request took too long. Please try again.";
  }
  
  // Generic fallback
  if (lowerError.includes("failed") || lowerError.includes("error")) {
    return "Something went wrong. Please try again or rephrase your message.";
  }
  
  // Return original if no match (might be user-friendly already)
  return error;
}

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
  /** Called whenever recommendations are present in advisor response (updates plan as conversation progresses) */
  onPlanGenerated?: (response: api.AdvisorChatResponse | null) => void;
  /** Called with analysis and optional image URL (for image uploads) so the original plan can be shown */
  onLayoutAnalyzed?: (analysis: api.LayoutAnalysis, imageUrl?: string) => void;
  /** When user returns from layout editor after confirm, chat should use this layout_id */
  initialLayoutId?: string | null;
  /** Called with layout from each advisor response so "Your layout" stays in sync with what the chat uses */
  onLayoutFromChat?: (layout: api.LayoutAnalysis | null) => void;
  /** Current layout state from Index (for bidirectional sync) */
  currentLayout?: api.LayoutAnalysis | null;
  /** Called when chat parses dimension updates from user message, updates Index state */
  onLayoutUpdate?: (layout: api.LayoutAnalysis | null) => void;
}

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
        <span className="inline-block w-2 h-4 ml-0.5 bg-primary animate-pulse align-middle" aria-hidden />
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
 * Main chat panel component for interacting with the Smart Living AI buddy.
 * Handles message display, streaming responses, layout uploads, and dimension parsing.
 */
const ChatPanel = ({ onPlanGenerated, onLayoutAnalyzed, initialLayoutId, onLayoutFromChat, currentLayout, onLayoutUpdate }: ChatPanelProps) => {
  const { user } = useAuth();
  const customerId = user?.customer_id || "";
  
  // Safeguard: ProtectedRoute should ensure user exists, but double-check
  if (!customerId) {
    console.error("ChatPanel: No customer_id available - user not authenticated");
  }

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "assistant",
      content:
        "Hi, I'm your Smart Living AI buddy from e&. I can design a secure, connected, and entertainment-ready home for you. Tell me about your home, or upload your floor plan to get started.",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [hasUploadedLayout, setHasUploadedLayout] = useState(false);
  const [layoutId, setLayoutId] = useState<string | null>(initialLayoutId ?? null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false); // Separate state for upload loading
  const [preparingPlan, setPreparingPlan] = useState(false); // State for plan preparation
  const [error, setError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
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

  const updateAutoScrollFlag = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 64;
  };

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (!shouldAutoScrollRef.current) return;

    requestAnimationFrame(() => {
      // Scroll ONLY within the chat container (prevents window/page scroll jumps)
      el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  const toChatMessages = (msgs: Message[]): api.ChatMessage[] =>
    msgs
      .filter((m) => m.id !== STREAMING_ID)
      .map((m) => ({ role: m.type === "user" ? "user" : "assistant", content: m.content }));

  const runStream = async (payload: api.AdvisorChatRequest) => {
    if (!payload.customer_id) {
      setError("Please sign in to continue");
      return;
    }
    
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
          // Only update plan when action is "offer_plan" (LLM decided to show recommendations)
          // This ensures plan only appears after user preferences are understood, not based on CRM profile alone
          if (final && final.action === "offer_plan") {
            // Show preparing plan overlay
            setPreparingPlan(true);
            console.log("ChatPanel: Updating plan (action=offer_plan)", {
              productCount: final.recommended_products?.length || 0,
              action: final.action,
              timestamp: Date.now(),
            });
            // Small delay to show the preparing message, then generate plan
            setTimeout(() => {
              onPlanGenerated?.({ ...final, _updatedAt: Date.now() } as typeof final & { _updatedAt: number });
              setPreparingPlan(false);
            }, 800); // Brief delay to show the message
          } else if (final && final.recommended_products && final.recommended_products.length > 0) {
            // If we have recommendations but action is "ask", don't show plan yet
            // Plan will appear when LLM decides action="offer_plan" after understanding preferences
            console.log("ChatPanel: Recommendations available but action=ask, not showing plan yet", {
              productCount: final.recommended_products.length,
              action: final.action,
            });
          }
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
        // Only update plan when action is "offer_plan" (LLM decided to show recommendations)
        // This ensures plan only appears after user preferences are understood, not based on CRM profile alone
        if (res && res.action === "offer_plan") {
          // Show preparing plan overlay
          setPreparingPlan(true);
          console.log("ChatPanel: Updating plan (non-streaming, action=offer_plan)", {
            productCount: res.recommended_products?.length || 0,
            action: res.action,
            timestamp: Date.now(),
          });
          // Small delay to show the preparing message, then generate plan
          setTimeout(() => {
            onPlanGenerated?.({ ...res, _updatedAt: Date.now() } as typeof res & { _updatedAt: number });
            setPreparingPlan(false);
          }, 800); // Brief delay to show the message
        } else if (res && res.recommended_products && res.recommended_products.length > 0) {
          // If we have recommendations but action is "ask", don't show plan yet
          console.log("ChatPanel: Recommendations available but action=ask, not showing plan yet", {
            productCount: res.recommended_products.length,
            action: res.action,
          });
        }
        // LLM now handles layout updates - prioritize LLM's updated layout over parser fallback
        if (onLayoutFromChat && res.layout && typeof res.layout === "object" && (res.layout as { layout_id?: string }).layout_id) {
          // LLM has processed the message and may have updated the layout
          // Use LLM's updated layout (it's authoritative and handles all natural language)
          onLayoutFromChat(res.layout as unknown as api.LayoutAnalysis);
          // Clear parser fallback since LLM update is authoritative
          lastLocalUpdateRef.current = null;
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Sorry, I couldn't get a response. Please try again.";
        // Map technical errors to user-friendly messages
        const userFriendlyMsg = getFriendlyErrorMessage(errorMsg);
        setError(userFriendlyMsg);
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== ANALYZING_ID)
            .map((m) =>
            m.id === STREAMING_ID
              ? { ...m, id: Date.now().toString(), content: userFriendlyMsg, streaming: false }
              : m
          )
        );
      }
    }
  };

  const handleUpload = async (file: File) => {
    setError(null);
    setUploading(true); // Use separate upload state
    setLoading(true); // Also set general loading to disable inputs
    
    // Don't add analyzing message immediately - wait for analysis to complete
    // This prevents showing messages during upload
    
    try {
      const analysis = await api.analyzeLayout(file);
      await api.upsertLayoutCache(analysis as unknown as Record<string, unknown>);
      setLayoutId(analysis.layout_id);
      setHasUploadedLayout(true);
      const imageUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      onLayoutAnalyzed?.(analysis, imageUrl);
      
      // Only add messages after successful upload
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
        customer_id: customerId,
        messages: conversationSoFar,
        layout_id: analysis.layout_id,
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Upload failed";
      const userFriendlyMsg = getFriendlyErrorMessage(errorMsg);
      setError(userFriendlyMsg);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== STREAMING_ID && m.id !== ANALYZING_ID),
        {
          id: Date.now().toString(),
          type: "assistant",
          content: "Sorry, I couldn't process that layout. Please try uploading again or describe your home to me.",
        },
      ]);
    } finally {
      setUploading(false);
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || loading || uploading) return; // Prevent sending during upload

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
        // This ensures panel → chat sync is preserved
        api.upsertLayoutCache(currentLayout as unknown as Record<string, unknown>).catch(() => {});
      }
    }

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
        customer_id: customerId,
        messages: nextMessages,
        layout_id: layoutToUse?.layout_id ?? layoutId ?? undefined,
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Request failed";
      const userFriendlyMsg = getFriendlyErrorMessage(errorMsg);
      setError(userFriendlyMsg);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== STREAMING_ID),
        {
          id: Date.now().toString(),
          type: "assistant",
          content: userFriendlyMsg,
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

  const handleNewChat = () => {
    // Reset chat conversation but keep layout visible
    setMessages([
      {
        id: "1",
        type: "assistant",
        content:
          "Hi, I'm your Smart Living AI buddy from e&. I can design a secure, connected, and entertainment-ready home for you. Tell me about your home, or upload your floor plan to get started.",
      },
    ]);
    setInputValue("");
    setLoading(false);
    setUploading(false);
    setPreparingPlan(false);
    setError(null);
    lastLocalUpdateRef.current = null;
    
    // Clear plan but keep layout (user can still see uploaded plan and details)
    onPlanGenerated?.(null);
    // Note: We keep layoutId and hasUploadedLayout so the layout remains visible
    // The layout will still be available for the new conversation
  };

  return (
    <div className="card-premium p-4 h-full flex flex-col relative">
      {/* Upload Loading Overlay */}
      {uploading && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-xl">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Upload className="w-6 h-6 text-primary animate-pulse" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Analyzing your floor plan</p>
              <p className="text-xs text-muted-foreground mt-1">Please wait while we process your layout...</p>
            </div>
          </div>
        </div>
      )}

      {/* Preparing Plan Loading Overlay */}
      {preparingPlan && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-xl">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary animate-pulse" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Preparing your smart home plan</p>
              <p className="text-xs text-muted-foreground mt-1">We're customizing recommendations just for you...</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm" />
          <h2 className="text-lg font-semibold text-foreground">AI Concierge</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNewChat}
          disabled={loading || uploading || preparingPlan}
          className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
          title="Start a new chat"
        >
          <MessageSquarePlus className="w-4 h-4 mr-1.5" />
          New Chat
        </Button>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20 flex items-start gap-2 animate-fade-in">
          <div className="w-4 h-4 rounded-full bg-destructive/20 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-[10px]">!</span>
          </div>
          <div className="flex-1">
            <p className="font-medium mb-0.5">Oops!</p>
            <p>{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-destructive/60 hover:text-destructive shrink-0"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div
        ref={messagesContainerRef}
        onScroll={updateAutoScrollFlag}
        className={`flex-1 overflow-y-auto space-y-4 mb-3 pr-1 scroll-smooth ${uploading || preparingPlan ? "opacity-50 pointer-events-none" : ""}`}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`animate-fade-in ${message.type === "assistant" ? "" : "flex justify-end"}`}
          >
            <div
              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                message.type === "assistant"
                  ? "bg-secondary/80 text-foreground border border-border/50"
                  : "bg-primary text-primary-foreground shadow-button/30"
              }`}
            >
              <MessageContent content={message.content} streaming={message.streaming} />
            </div>
          </div>
        ))}
      </div>

      {!hasUploadedLayout && <LayoutUpload onUpload={handleUpload} disabled={loading || uploading || preparingPlan} />}

      <div className={`relative ${uploading || preparingPlan ? 'opacity-50 pointer-events-none' : ''}`}>
        <input
          type="text"
          placeholder="Tell me about your home, or upload a layout…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading || uploading || preparingPlan}
          className="w-full bg-secondary/80 rounded-full py-3 pl-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 border border-border/50 transition-all disabled:opacity-60"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={loading || uploading || preparingPlan}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-button transition-all"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default ChatPanel;
