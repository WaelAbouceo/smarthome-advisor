import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Check, AlertCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LayoutAnalysis, LayoutRoom } from "@/lib/api";
import {
  saveLayoutDraft,
  confirmLayoutDraft,
  upsertLayoutCache,
} from "@/lib/api";

const ROOM_TYPES = [
  "living",
  "bedroom",
  "bathroom",
  "kitchen",
  "entry",
  "workspace",
  "meeting",
  "other",
];

function confidenceLevel(c: number | undefined): "High" | "Med" | "Low" {
  if (c == null) return "Med";
  if (c >= 0.8) return "High";
  if (c >= 0.5) return "Med";
  return "Low";
}

function ensureRoomIds(rooms: LayoutRoom[]): LayoutRoom[] {
  return rooms.map((r, i) => ({
    ...r,
    room_id: r.room_id ?? `r${i + 1}`,
    name: r.name ?? r.room ?? "Room",
    source: r.source ?? "llm",
    status: r.status ?? "suggested",
  }));
}

export default function LayoutEditorPage() {
  const { state } = useLocation() as { state?: { layout: LayoutAnalysis; imageUrl?: string | null } };
  const navigate = useNavigate();
  const [layout, setLayout] = useState<LayoutAnalysis | null>(() => {
    const l = state?.layout;
    if (!l) return null;
    return {
      ...l,
      rooms: ensureRoomIds(l.rooms ?? []),
    };
  });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageUrl = state?.imageUrl ?? null;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const updateRoom = useCallback((roomId: string, patch: Partial<LayoutRoom>) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const rooms = prev.rooms.map((r) => {
        if ((r.room_id ?? "") !== roomId) return r;
        const next = { ...r, ...patch };
        const w = typeof next.width === "number" ? next.width : (typeof r.width === "number" ? r.width : undefined);
        const ln = typeof next.length === "number" ? next.length : (typeof r.length === "number" ? r.length : undefined);
        if (w != null && ln != null) next.area = w * ln;
        return next;
      });
      setDirty(true);
      return { ...prev, rooms };
    });
  }, []);

  const autosave = useCallback(() => {
    if (!layout || !dirty) return;
    const id = layout.layout_id;
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      setError(null);
      try {
        await saveLayoutDraft(id, layout);
        setDirty(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [layout, dirty]);

  useEffect(() => {
    autosave();
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [autosave]);

  const handleConfirm = async () => {
    if (!layout) return;
    setConfirming(true);
    setError(null);
    try {
      const confirmed = await confirmLayoutDraft(layout.layout_id);
      await upsertLayoutCache(confirmed as unknown as Record<string, unknown>);
      navigate("/", { state: { layoutId: confirmed.layout_id, layout: confirmed, fromLayoutConfirm: true } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  };

  if (!layout) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-4">
        <p className="text-muted-foreground mb-4">No layout to edit.</p>
        <Button variant="outline" onClick={() => navigate("/layout/upload")}>
          Upload floor plan
        </Button>
      </div>
    );
  }

  const rooms = layout.rooms ?? [];
  const units = layout.measurement_units ?? "ft";
  const totalAreaStr = layout.total_area ?? null;
  const mentionedStr = layout.mentioned_spaces_area ?? null;
  const unassignedStr = layout.unassigned_space ?? null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Layout editor</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {dirty && <span>Unsaved changes</span>}
          {saving && <span>Saving…</span>}
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Canvas 70% */}
        <div className="flex-[0_0_70%] border-r border-border flex flex-col items-center justify-center p-4 bg-muted/20">
          {imageUrl ? (
            <div className="max-w-full max-h-full overflow-auto rounded-lg border border-border bg-background">
              <img
                src={imageUrl}
                alt="Floor plan"
                className="max-w-full h-auto block"
                style={{ maxHeight: "calc(100vh - 180px)" }}
              />
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">No plan image (upload an image for overlay)</div>
          )}
        </div>

        {/* Room list 30% */}
        <div className="flex-[0_0_30%] flex flex-col min-w-0">
          <div className="px-3 py-2 border-b border-border text-sm font-medium text-foreground">
            Rooms
          </div>
          <ScrollArea className="flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>W × L</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead className="w-[70px]">Conf.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((r) => {
                  const rid = r.room_id ?? "";
                  const w = typeof r.width === "number" ? r.width : (r.width ? parseFloat(String(r.width).replace(/[^\d.]/g, "")) : undefined);
                  const ln = typeof r.length === "number" ? r.length : (r.length ? parseFloat(String(r.length).replace(/[^\d.]/g, "")) : undefined);
                  const area = typeof r.area === "number" ? r.area : (w != null && ln != null ? w * ln : r.area);
                  const conf = r.size_confidence ?? r.confidence ?? 0.7;
                  const isSelected = selectedRoomId === rid;
                  return (
                    <TableRow
                      key={rid}
                      data-state={isSelected ? "selected" : undefined}
                      className={isSelected ? "bg-primary/10" : ""}
                      onClick={() => setSelectedRoomId(rid)}
                    >
                      <TableCell className="p-1">
                        <Input
                          className="h-8 text-sm"
                          value={r.name ?? r.room ?? ""}
                          onChange={(e) => updateRoom(rid, { name: e.target.value, room: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Select
                          value={r.room_type ?? "other"}
                          onValueChange={(v) => updateRoom(rid, { room_type: v })}
                        >
                          <SelectTrigger className="h-8 text-sm" onClick={(e) => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROOM_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-1">
                        <div className="flex gap-1 items-center">
                          <Input
                            type="text"
                            className="h-8 w-14 text-sm"
                            placeholder="W"
                            value={w != null ? String(w) : ""}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value.replace(/[^\d.]/g, ""));
                              updateRoom(rid, { width: Number.isNaN(v) ? undefined : v });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-muted-foreground">×</span>
                          <Input
                            type="text"
                            className="h-8 w-14 text-sm"
                            placeholder="L"
                            value={ln != null ? String(ln) : ""}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value.replace(/[^\d.]/g, ""));
                              updateRoom(rid, { length: Number.isNaN(v) ? undefined : v });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="p-1 text-sm">
                        {area != null && !Number.isNaN(area)
                          ? `${area % 1 === 0 ? area : area.toFixed(1)} ${units}²`
                          : "—"}
                      </TableCell>
                      <TableCell className="p-1">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${
                            confidenceLevel(conf) === "High"
                              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                              : confidenceLevel(conf) === "Low"
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {confidenceLevel(conf)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>

      {/* Bottom bar */}
      <footer className="border-t border-border px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-muted/30">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Rooms: {rooms.length}
            {totalAreaStr && ` · Total: ${totalAreaStr}`}
          </span>
          {unassignedStr && (
            <span className="text-muted-foreground">Unassigned: {unassignedStr}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="flex items-center gap-1 text-destructive text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={saving || !dirty}
            onClick={() => {
              if (layout) saveLayoutDraft(layout.layout_id, layout).then(() => setDirty(false)).catch(() => {});
            }}
          >
            <Save className="w-4 h-4 mr-1" />
            Save draft
          </Button>
          <Button size="sm" disabled={confirming} onClick={handleConfirm}>
            <Check className="w-4 h-4 mr-1" />
            Confirm layout
          </Button>
        </div>
      </footer>
    </div>
  );
}
