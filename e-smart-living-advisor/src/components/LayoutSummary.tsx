import { Home, DoorOpen, FileText, MapPin, ImageIcon, AlertCircle, ChevronDown, ChevronUp, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import type { LayoutAnalysis, LayoutRoom } from "@/lib/api";
import { CONFIDENCE_THRESHOLD, ROOM_TYPES, ROOM_TYPE_LABELS } from "@/utils/constants";
import { Button } from "@/components/ui/button";

function roomTypeLabel(type: string): string {
  return ROOM_TYPE_LABELS[type?.toLowerCase()] ?? type ?? "Room";
}

/**
 * Props for LayoutSummary component
 */
interface LayoutSummaryProps {
  layout: LayoutAnalysis;
  /** Object URL of the uploaded floor plan image (original shared plan) */
  imageUrl?: string | null;
  /** When set, room name/type/width/length are editable; changes are reported and used for next advisor message */
  onLayoutChange?: (updated: LayoutAnalysis) => void;
}

/**
 * Displays and allows editing of layout details (rooms, dimensions, entry points).
 * Supports bidirectional synchronization with chat panel.
 */
const LayoutSummary = ({ layout, imageUrl, onLayoutChange }: LayoutSummaryProps) => {
  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default for smoother experience
  const layoutType = (layout.layout_type || "home").replace(/^./, (c) => c.toUpperCase());
  const rooms = layout.rooms ?? [];
  const entryPoints = layout.entry_points ?? [];
  const notes = layout.notes ?? [];
  const confidence = layout.confidence ?? 1;
  const isConfident = confidence >= CONFIDENCE_THRESHOLD;
  const editable = typeof onLayoutChange === "function";

  // Calculate total area for summary
  const calculateTotalArea = () => {
    const currentRooms = layout.rooms ?? [];
    const numericAreas = currentRooms.map((r) => {
      const w = typeof r.width === "number" ? r.width : parseFloat(String(r.width ?? "").replace(/[^\d.]/g, "") || "0");
      const l = typeof r.length === "number" ? r.length : parseFloat(String(r.length ?? "").replace(/[^\d.]/g, "") || "0");
      if (!Number.isNaN(w) && !Number.isNaN(l) && w > 0 && l > 0) {
        return w * l;
      }
      const storedArea = typeof r.area === "number" ? r.area : parseFloat(String(r.area ?? "").replace(/[^\d.]/g, "") || "0");
      return Number.isNaN(storedArea) ? 0 : storedArea;
    }).filter((n) => !Number.isNaN(n) && n > 0);
    const roomsTotalArea = numericAreas.length > 0 ? numericAreas.reduce((a, b) => a + b, 0) : 0;
    
    if (layout.total_area) {
      const totalMatch = String(layout.total_area).match(/[\d.]+/);
      if (totalMatch) {
        return parseFloat(totalMatch[0]);
      }
    }
    return roomsTotalArea > 0 ? roomsTotalArea : null;
  };

  const totalArea = calculateTotalArea();
  const areaUnit = layout.measurement_units === "ft" ? "sq ft" : "m²";

  // BIDIRECTIONAL SYNC: Panel → Chat
  // When user edits room (name, type, width, length), update layout state
  // This ensures ChatPanel receives updated layout for next message
  const updateRoom = (index: number, patch: Partial<LayoutRoom>) => {
    if (!onLayoutChange) return;
    const nextRooms = rooms.map((r, i) => {
      if (i !== index) return r;
      const next = {
        ...r,        // Preserve all existing fields first
        ...patch,    // Apply the update
        // Explicitly preserve room_type — only override if patch contains it
        room_type: patch.room_type ?? r.room_type ?? "other",
      };
      // Keep both "room" and "name" in sync when either is changed
      if (patch.room !== undefined || patch.name !== undefined) {
        const newName = patch.room ?? patch.name ?? r.room ?? r.name ?? "";
        next.room = newName;
        next.name = newName;
      }
      // Always recalculate area from current width/length
      const w = typeof next.width === "number" ? next.width : (typeof r.width === "number" ? r.width : undefined);
      const ln = typeof next.length === "number" ? next.length : (typeof r.length === "number" ? r.length : undefined);
      if (w != null && ln != null && w > 0 && ln > 0) {
        next.area = w * ln;
      } else if (w == null || ln == null) {
        // If either dimension is missing, clear area
        next.area = undefined;
      }
      return next;
    });
    // Update state → ChatPanel receives updated currentLayout prop
    onLayoutChange({ ...layout, rooms: nextRooms });
  };

  return (
    <div className="card-premium p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Home className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Your layout</h3>
            <p className="text-xs text-muted-foreground">What we detected from your floor plan</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-8 w-8 p-0"
          aria-label={isExpanded ? "Collapse layout" : "Expand layout"}
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Collapsed Summary View */}
      {!isExpanded && (
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Type:</span>
            <span className="font-medium text-foreground capitalize">{layoutType}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Spaces:</span>
            <span className="font-medium text-foreground">
              {rooms.length} {rooms.length === 1 ? 'space' : 'spaces'}
              {rooms.length > 0 && (() => {
                const bedrooms = rooms.filter(r => (r.room_type ?? '').toLowerCase() === 'bedroom').length;
                const bathrooms = rooms.filter(r => (r.room_type ?? '').toLowerCase() === 'bathroom').length;
                const living = rooms.filter(r => (r.room_type ?? '').toLowerCase() === 'living').length;
                const kitchen = rooms.filter(r => (r.room_type ?? '').toLowerCase() === 'kitchen').length;
                const details = [];
                if (bedrooms > 0) details.push(`${bedrooms} bed${bedrooms > 1 ? 's' : ''}`);
                if (bathrooms > 0) details.push(`${bathrooms} bath${bathrooms > 1 ? 's' : ''}`);
                if (living > 0) details.push(`${living} living`);
                if (kitchen > 0) details.push(`${kitchen} kitchen`);
                return details.length > 0 ? (
                  <span className="text-xs text-muted-foreground ml-1 font-normal">
                    ({details.join(', ')})
                  </span>
                ) : null;
              })()}
            </span>
          </div>
          {totalArea && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total area:</span>
              <span className="font-medium text-foreground">
                {totalArea % 1 === 0 ? totalArea : totalArea.toFixed(1)} {areaUnit}
              </span>
            </div>
          )}
          {!isConfident && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Needs confirmation</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded Full View */}
      {isExpanded && (
        <>
      {!isConfident && (
        <div className="mb-4 flex gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Please confirm</p>
            <p className="text-muted-foreground mt-0.5">
              We’re not fully confident about this layout. Check the rooms and sizes below and tell us what to correct in the chat.
            </p>
          </div>
        </div>
      )}

      {imageUrl ? (() => {
        const isPDF = layout.source_filename?.toLowerCase().endsWith('.pdf') || imageUrl.toLowerCase().includes('.pdf') || imageUrl.toLowerCase().includes('application/pdf');
        
        return (
          <div className="mb-4 rounded-xl overflow-hidden border border-border/50 bg-muted/30">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Original shared plan
              </p>
              {isPDF && (
                <a
                  href={imageUrl}
                  download={layout.source_filename || 'floor-plan.pdf'}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                  title="Download PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              )}
            </div>
            {isPDF ? (
              <div className="relative w-full bg-background" style={{ minHeight: '500px', height: '600px' }}>
                <iframe
                  src={imageUrl}
                  className="w-full h-full border-0 rounded-b-xl"
                  title="Floor plan PDF"
                />
              </div>
            ) : (
              <div className="relative min-h-[200px] max-h-[400px] flex items-center justify-center p-4">
                <img
                  src={imageUrl}
                  alt="Your floor plan"
                  className="max-w-full max-h-[380px] w-auto h-auto object-contain rounded-lg shadow-sm"
                />
              </div>
            )}
          </div>
        );
      })() : (
        layout.source_filename && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <ImageIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">Uploaded: {layout.source_filename}</span>
          </div>
        )
      )}

      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Layout type
          </p>
          {editable ? (
            <Select
              value={layout.layout_type || "unknown"}
              onValueChange={(v) => onLayoutChange?.({ ...layout, layout_type: v })}
            >
              <SelectTrigger className="h-8 w-[140px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="apartment">Apartment</SelectItem>
                <SelectItem value="villa">Villa</SelectItem>
                <SelectItem value="office">Office</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm font-medium text-foreground capitalize">{layoutType}</p>
          )}
        </div>

        {rooms.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Spaces ({rooms.length} {rooms.length === 1 ? 'space' : 'spaces'}) {editable && <span className="text-muted-foreground font-normal">(edit below)</span>}
            </p>
            <ul className="space-y-2">
              {rooms.map((r, i) => {
                const str = (v: unknown) => (typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "");
                const wNum = typeof r.width === "number" ? r.width : parseFloat(String(r.width ?? "").replace(/[^\d.]/g, "") || "0");
                const lNum = typeof r.length === "number" ? r.length : parseFloat(String(r.length ?? "").replace(/[^\d.]/g, "") || "0");
                const w = str(r.width);
                const l = str(r.length);
                const h = str(r.height);
                // Calculate area: in editable mode, always compute from current width×length for accuracy
                // In read-only mode, prefer stored area if available
                let area: number | null = null;
                if (editable) {
                  // Always compute from current values in editable mode
                  if (!Number.isNaN(wNum) && !Number.isNaN(lNum) && wNum > 0 && lNum > 0) {
                    area = wNum * lNum;
                  }
                } else {
                  // Read-only: prefer stored area, fallback to computed
                  if (typeof r.area === "number" && r.area > 0) {
                    area = r.area;
                  } else if (!Number.isNaN(wNum) && !Number.isNaN(lNum) && wNum > 0 && lNum > 0) {
                    area = wNum * lNum;
                  }
                }
                const sizeConfident = (r.size_confidence ?? r.confidence) == null || (r.size_confidence ?? r.confidence) >= CONFIDENCE_THRESHOLD;
                const roomName = r.room ?? r.name ?? "Room";

                if (editable) {
                  return (
                    <li
                      key={r.room_id ?? i}
                      className="text-sm text-foreground bg-secondary/50 rounded-lg px-3 py-2 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                        <Input
                          className="h-8 flex-1 text-sm font-medium"
                          value={roomName}
                          onChange={(e) => updateRoom(i, { room: e.target.value, name: e.target.value })}
                          placeholder="Room name"
                        />
                        <Select
                          value={r.room_type ?? "other"}
                          onValueChange={(v) => updateRoom(i, { room_type: v })}
                        >
                          <SelectTrigger className="h-8 w-[100px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROOM_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {roomTypeLabel(t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pl-5 text-xs">
                        <span className="text-muted-foreground">W</span>
                        <Input
                          type="text"
                          className="h-7 w-14 text-xs"
                          placeholder="—"
                          value={Number.isNaN(wNum) || wNum === 0 ? "" : wNum}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value.replace(/[^\d.]/g, ""));
                            updateRoom(i, { width: Number.isNaN(v) || v === 0 ? undefined : v });
                          }}
                        />
                        <span className="text-muted-foreground">× L</span>
                        <Input
                          type="text"
                          className="h-7 w-14 text-xs"
                          placeholder="—"
                          value={Number.isNaN(lNum) || lNum === 0 ? "" : lNum}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value.replace(/[^\d.]/g, ""));
                            updateRoom(i, { length: Number.isNaN(v) || v === 0 ? undefined : v });
                          }}
                        />
                        {area != null && area > 0 && (
                          <span className="font-medium text-foreground ml-1">
                            = {area % 1 === 0 ? area : area.toFixed(1)} {layout.measurement_units ? `${layout.measurement_units}²` : "sq"}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                }

                const dims = [w, l, h].filter(Boolean);
                const wlh = dims.length >= 2 ? dims.join(" × ") : dims[0] || null;
                const areaStr = typeof area === "number" ? `${area} ${layout.measurement_units ?? ""}²` : area;
                return (
                  <li
                    key={r.room_id ?? i}
                    className="text-sm text-foreground bg-secondary/50 rounded-lg px-3 py-2.5 space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="font-medium">{roomName}</span>
                      <span className="text-muted-foreground text-xs">
                        {roomTypeLabel(r.room_type)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pl-5 text-xs">
                      {wlh && (
                        <span className={sizeConfident ? "text-foreground" : "text-amber-600 dark:text-amber-400"}>
                          W×L×H: {wlh}
                          {!sizeConfident && "?"}
                        </span>
                      )}
                      {areaStr && (
                        <span className="font-medium text-foreground">
                          Total: {areaStr}
                        </span>
                      )}
                      {!wlh && !areaStr && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {(() => {
              // Calculate sum of room areas - always compute from current width×length for accuracy
              // Use layout.rooms directly to ensure we read the latest data
              const currentRooms = layout.rooms ?? [];
              const numericAreas = currentRooms.map((r) => {
                // Get numeric width and length
                const w = typeof r.width === "number" ? r.width : parseFloat(String(r.width ?? "").replace(/[^\d.]/g, "") || "0");
                const l = typeof r.length === "number" ? r.length : parseFloat(String(r.length ?? "").replace(/[^\d.]/g, "") || "0");
                // Calculate area from dimensions (preferred) or use stored area as fallback
                if (!Number.isNaN(w) && !Number.isNaN(l) && w > 0 && l > 0) {
                  return w * l;
                }
                // Fallback to stored area if dimensions not available
                const storedArea = typeof r.area === "number" ? r.area : parseFloat(String(r.area ?? "").replace(/[^\d.]/g, "") || "0");
                return Number.isNaN(storedArea) ? 0 : storedArea;
              }).filter((n) => !Number.isNaN(n) && n > 0);
              const roomsTotalArea = numericAreas.length > 0 ? numericAreas.reduce((a, b) => a + b, 0) : 0;
              
              // Prefer layout.total_area if available (includes unassigned space), otherwise use sum of rooms
              let totalArea: number | null = null;
              let areaUnit = layout.measurement_units === "ft" ? "sq ft" : "m²";
              
              if (layout.total_area) {
                // Parse total_area string (e.g. "2400 sq ft" or "2400")
                const totalMatch = String(layout.total_area).match(/[\d.]+/);
                if (totalMatch) {
                  totalArea = parseFloat(totalMatch[0]);
                  // Extract unit from total_area if present
                  const unitMatch = String(layout.total_area).match(/(sq\s*ft|sq\s*m|m²|ft²)/i);
                  if (unitMatch) {
                    const unit = unitMatch[0].toLowerCase();
                    areaUnit = unit.includes("ft") ? "sq ft" : "m²";
                  }
                }
              }
              
              // Fallback: use sum of room areas
              if (totalArea == null || totalArea === 0) {
                totalArea = roomsTotalArea > 0 ? roomsTotalArea : null;
              }
              
              // Calculate unassigned space (walls, corridors, circulation)
              let unassignedSpace: number | null = null;
              if (totalArea != null && totalArea > 0 && roomsTotalArea > 0) {
                unassignedSpace = Math.max(0, totalArea - roomsTotalArea);
              } else if (layout.unassigned_space) {
                // Use provided unassigned_space if available
                const unassignedMatch = String(layout.unassigned_space).match(/[\d.]+/);
                if (unassignedMatch) {
                  unassignedSpace = parseFloat(unassignedMatch[0]);
                }
              }
              
              return (
                <div className="mt-3 space-y-2">
                  {totalArea != null && totalArea > 0 && (
                    <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 flex justify-between items-center">
                      <span className="text-xs font-medium text-foreground uppercase tracking-wide">Total floor area</span>
                      <span className="text-sm font-semibold text-foreground">{totalArea % 1 === 0 ? totalArea : totalArea.toFixed(1)} {areaUnit}</span>
                    </div>
                  )}
                  {roomsTotalArea > 0 && (
                    <div className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2 flex justify-between items-center">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Spaces total</span>
                      <span className="text-sm text-foreground">{roomsTotalArea % 1 === 0 ? roomsTotalArea : roomsTotalArea.toFixed(1)} {areaUnit}</span>
                    </div>
                  )}
                  {unassignedSpace != null && unassignedSpace > 0 && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex justify-between items-center">
                      <span className="text-xs font-medium text-foreground uppercase tracking-wide">Unassigned space</span>
                      <span className="text-sm font-medium text-foreground">
                        {unassignedSpace % 1 === 0 ? unassignedSpace : unassignedSpace.toFixed(1)} {areaUnit}
                        <span className="text-xs text-muted-foreground ml-1">(walls, corridors)</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {entryPoints.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Entry points
            </p>
            <ul className="flex flex-wrap gap-2">
              {entryPoints.map((ep, i) => (
                <li
                  key={i}
                  className="inline-flex items-center gap-1.5 bg-secondary/50 rounded-full px-3 py-1.5 text-xs font-medium text-foreground"
                >
                  <DoorOpen className="w-3 h-3 text-primary" />
                  {typeof ep === "string" ? ep : (ep && typeof ep === "object" && "label" in ep ? (ep as { label: string }).label : String(ep))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {notes.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Notes
            </p>
            <ul className="space-y-1">
              {notes.map((note, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <FileText className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}

        {layout.source_filename && (
          <p className="text-xs text-muted-foreground truncate pt-1 border-t border-border/50">
            Source: {layout.source_filename}
          </p>
        )}
      </div>
        </>
      )}
    </div>
  );
};

export default LayoutSummary;
