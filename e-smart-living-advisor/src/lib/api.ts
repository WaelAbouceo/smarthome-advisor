/**
 * Backend API client.
 * In dev (Vite): use relative "" so /api is proxied to localhost:8000 (no CORS).
 * Otherwise: VITE_API_URL or http://localhost:8000.
 */
const getBaseUrl = (): string => {
  const env = import.meta.env?.VITE_API_URL;
  if (typeof env === "string" && env.trim()) return env.trim().replace(/\/$/, "");
  if (import.meta.env?.DEV) return ""; // proxy /api -> backend in vite.config
  return "http://localhost:8000";
};

const base = () => getBaseUrl();

function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const full = url.startsWith("http") ? url : `${base()}${url}`;
  return fetch(full, init).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `API request failed: ${msg}. Is the backend running on ${base() || "localhost:8000"}?`
    );
  });
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface AdvisorChatRequest {
  customer_id: string;
  messages: ChatMessage[];
  layout_id?: string | null;
  stream?: boolean;
}

export interface RecommendationItem {
  room: string;
  product_id: string;
  why: string;
}

/** LLM decides from context: "ask" = question to user, "offer_plan" = show personalized plan */
export type AdvisorAction = "ask" | "offer_plan";

export interface AdvisorChatResponse {
  answer: string;
  persona: Record<string, unknown>;
  layout: Record<string, unknown>;
  recommended_products: RecommendationItem[];
  recommended_bundle_id: string | null;
  estimated_monthly: number | null;
  /** When "offer_plan", show the plan panel; when "ask", keep conversation only */
  action?: AdvisorAction;
}

/** Room in layout: editor uses room_id, source, status; dimensions may be string or number */
export interface LayoutRoom {
  room_id?: string;
  room?: string;
  name?: string;
  room_type: string;
  estimated_size?: string;
  size_confidence?: number;
  width?: string | number;
  length?: string | number;
  height?: string;
  area?: string | number;
  confidence?: number;
  source?: "ocr" | "geometry" | "user" | "llm";
  status?: "suggested" | "confirmed";
  bbox?: [number, number, number, number];
  polygon?: [number, number][];
}

export interface LayoutAnalysis {
  layout_id: string;
  layout_type: string;
  rooms: LayoutRoom[];
  entry_points: string[] | Array<{ id: string; label: string; pos?: [number, number]; confidence?: number }>;
  notes: string[];
  confidence: number;
  source_filename?: string;
  measurement_units?: string;
  total_area?: string;
  mentioned_spaces_area?: string;
  unassigned_space?: string;
  layout_confidence?: number;
}

export interface ProductCatalog {
  version?: string;
  currency?: string;
  products: Array<{
    product_id: string;
    name: string;
    category: string;
    price_monthly?: number;
    price_one_time?: number;
    notes?: string;
  }>;
  bundles: Array<{
    bundle_id: string;
    name: string;
    items: string[];
    bundle_monthly: number;
    bundle_notes?: string;
  }>;
}

export async function health(): Promise<{ status: string }> {
  const r = await apiFetch("/api/v1/health");
  if (!r.ok) throw new Error(`Health check failed: ${r.status}`);
  return r.json();
}

export async function analyzeLayout(file: File): Promise<LayoutAnalysis> {
  const form = new FormData();
  form.append("file", file);
  const r = await apiFetch("/api/v1/layout/analyze", { method: "POST", body: form });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `Layout analyze failed: ${r.status}`);
  }
  return r.json();
}

/** Create a layout draft for the editor (room_id, source, status on each room). Use save/confirm next. */
export async function createLayoutDraft(file: File): Promise<LayoutAnalysis> {
  const form = new FormData();
  form.append("file", file);
  const r = await apiFetch("/api/v1/layout/draft", { method: "POST", body: form });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `Layout draft failed: ${r.status}`);
  }
  return r.json();
}

/** Save current editor state. Idempotent. */
export async function saveLayoutDraft(layoutId: string, layout: LayoutAnalysis): Promise<{ ok: boolean; layout_id: string }> {
  const r = await apiFetch(`/api/v1/layout/${layoutId}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `Layout save failed: ${r.status}`);
  }
  return r.json();
}

/** Confirm layout and return locked layout. Then call upsertLayoutCache and proceed to recommendations. */
export async function confirmLayoutDraft(layoutId: string): Promise<LayoutAnalysis> {
  const r = await apiFetch(`/api/v1/layout/${layoutId}/confirm`, { method: "POST" });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `Layout confirm failed: ${r.status}`);
  }
  return r.json();
}

/**
 * Use the LLM to turn a text description of the home/office into a structured layout.
 * Call upsertLayoutCache with the result and use layout_id in subsequent advisor chat.
 */
export async function layoutFromDescription(description: string): Promise<LayoutAnalysis> {
  const r = await apiFetch("/api/v1/layout/from_description", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: description.trim() }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `Layout from description failed: ${r.status}`);
  }
  return r.json();
}

export async function upsertLayoutCache(layout: Record<string, unknown>): Promise<{ ok: boolean; layout_id: string }> {
  const r = await apiFetch("/api/v1/advisor/layout_cache/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `Layout cache upsert failed: ${r.status}`);
  }
  return r.json();
}

/** Parse error message from JSON { detail: "..." } or plain text */
async function errorMessage(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { detail?: string };
    if (typeof j?.detail === "string") return j.detail;
  } catch {
    /* ignore */
  }
  return t || `Request failed: ${res.status}`;
}

export async function advisorChat(payload: AdvisorChatRequest): Promise<AdvisorChatResponse> {
  const r = await apiFetch("/api/v1/advisor/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, stream: false }),
  });
  if (!r.ok) {
    throw new Error(await errorMessage(r));
  }
  return r.json();
}

export interface StreamCallbacks {
  onPartial: (chunk: string) => void;
  onFinal: (final: AdvisorChatResponse) => void;
}

/**
 * Stream advisor response via SSE. Calls onPartial for each chunk, onFinal with the full response at end.
 */
export async function advisorChatStream(
  payload: AdvisorChatRequest,
  callbacks: StreamCallbacks
): Promise<void> {
  const baseUrl = base();
  const url = baseUrl ? `${baseUrl}/api/v1/advisor/chat/stream` : "/api/v1/advisor/chat/stream";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`API request failed: ${msg}. Is the backend running?`);
  });

  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try {
      const j = JSON.parse(t) as { detail?: string };
      if (typeof j?.detail === "string") msg = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(msg || `Advisor stream failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  function parseDataLine(line: string): void {
    if (!line.startsWith("data: ")) return;
    try {
      let data: unknown = JSON.parse(line.slice(6));
      if (typeof data === "string") data = JSON.parse(data);
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      if (typeof d.partial_content === "string") callbacks.onPartial(d.partial_content);
      if (d.end_of_stream === true && d.final) callbacks.onFinal(d.final as AdvisorChatResponse);
    } catch {
      // skip invalid json
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE uses double newline (can be \n\n or \r\n\r\n)
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    for (const block of events) {
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("data: ")) parseDataLine(line);
      }
    }
  }
  for (const line of buffer.split(/\r?\n/)) {
    if (line.startsWith("data: ")) parseDataLine(line);
  }
}

export async function getProductCatalog(): Promise<ProductCatalog> {
  const r = await apiFetch("/api/v1/products/catalog");
  if (!r.ok) throw new Error(`Products catalog failed: ${r.status}`);
  return r.json();
}

// Admin API functions
export interface AdminUsersResponse {
  total: number;
  users: Array<Record<string, unknown>>;
}

export interface AdminPromptsResponse {
  prompts_dir: string;
  total: number;
  prompts: Record<string, string>;
}

export interface AdminBusinessRulesResponse {
  rule_based_recommender: {
    file: string;
    code: string;
    description: string;
  };
  rag_retriever: {
    file: string;
    code: string;
    description: string;
  };
  knowledge_base: Record<string, unknown>;
  llm_recommender: {
    file: string;
    description: string;
    note: string;
  };
}

export async function getAdminUsers(): Promise<AdminUsersResponse> {
  const r = await apiFetch("/api/v1/admin/users");
  if (!r.ok) throw new Error(`Admin users failed: ${r.status}`);
  return r.json();
}

export async function getAdminProducts(): Promise<ProductCatalog> {
  const r = await apiFetch("/api/v1/admin/products");
  if (!r.ok) throw new Error(`Admin products failed: ${r.status}`);
  return r.json();
}

export async function getAdminPrompts(): Promise<AdminPromptsResponse> {
  const r = await apiFetch("/api/v1/admin/prompts");
  if (!r.ok) throw new Error(`Admin prompts failed: ${r.status}`);
  return r.json();
}

export async function getAdminBusinessRules(): Promise<AdminBusinessRulesResponse> {
  const r = await apiFetch("/api/v1/admin/business-rules");
  if (!r.ok) throw new Error(`Admin business rules failed: ${r.status}`);
  return r.json();
}
