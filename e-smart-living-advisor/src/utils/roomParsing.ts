/**
 * Room parsing utilities for extracting dimension updates from user messages.
 * Handles various formats like "Living Room: 20 × 21 ft", "add garage 50*100", etc.
 */

import type { LayoutAnalysis, LayoutRoom } from "@/lib/api";
import {
  ROOM_NAME_TYPOS,
  MIN_ROOM_AREA,
  MAX_ROOM_AREA,
  MIN_ASPECT_RATIO,
  MAX_ASPECT_RATIO,
} from "./constants";

/**
 * Normalize room name: fix common typos, lowercase, trim, remove articles
 */
export function normalizeRoomName(name: string): string {
  let normalized = name.toLowerCase().trim();

  // Remove articles at the start ("a", "an", "the")
  normalized = normalized.replace(/^(a|an|the)\s+/i, "");

  // Fix typos
  for (const [typo, correct] of Object.entries(ROOM_NAME_TYPOS)) {
    if (normalized.includes(typo)) {
      normalized = normalized.replace(typo, correct);
    }
  }

  return normalized.replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim();
}

/**
 * Estimate dimensions from area (e.g., 50 sq ft -> reasonable width×length)
 */
export function estimateDimensionsFromArea(area: number): { width: number; length: number } {
  // Validate bounds: reasonable room sizes
  const clampedArea = Math.max(MIN_ROOM_AREA, Math.min(MAX_ROOM_AREA, area));

  // Try to find reasonable dimensions: prefer square-ish or slightly rectangular
  const sqrt = Math.sqrt(clampedArea);

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

/**
 * Match room name with priority: exact > specific > fuzzy
 */
export function matchRoomName(
  mentioned: string,
  existing: string
): { match: boolean; priority: number } {
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
    return { match: true, priority: 2 - specificity / 100 }; // More specific = higher priority
  }

  // Priority 3: Word-based fuzzy match (require words > 3 chars to avoid "bed" matching "bedroom")
  const mentionedWords = normMentioned.split(/\s+|\//).filter((w) => w.length > 3);
  const existingWords = normExisting.split(/\s+|\//).filter((w) => w.length > 3);

  if (mentionedWords.length > 0 && existingWords.length > 0) {
    const matchingWords = mentionedWords.filter((w) =>
      existingWords.some((ew) => ew.includes(w) || w.includes(ew))
    );
    if (matchingWords.length > 0) {
      // More matching words = higher priority
      return { match: true, priority: 3 - matchingWords.length / 10 };
    }
  }

  return { match: false, priority: 0 };
}

/**
 * Infer room type from room name keywords
 */
function inferRoomType(normalizedName: string): string {
  if (normalizedName.includes("garage")) return "other";
  if (normalizedName.includes("storage")) return "other";
  if (normalizedName.includes("bedroom")) return "bedroom";
  if (normalizedName.includes("bathroom")) return "bathroom";
  if (normalizedName.includes("kitchen")) return "kitchen";
  if (normalizedName.includes("living")) return "living";
  if (normalizedName.includes("office")) return "workspace";
  return "other";
}

/**
 * Capitalize room name for display
 */
function capitalizeRoomName(normalizedName: string): string {
  return normalizedName
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Parse dimension updates from user message.
 * Supports formats like:
 * - "Living Room: 20 × 21 ft"
 * - "Kitchen: 18×21"
 * - "add garage 50*100"
 * - "add storage room of 50 sq ft"
 * - "Kitchen / Dining (300 sq ft)"
 */
export function parseDimensionUpdates(
  message: string,
  currentLayout: LayoutAnalysis | null | undefined
): LayoutAnalysis | null {
  if (!currentLayout) return null;

  const rooms = currentLayout.rooms ?? [];
  const measurementUnits = currentLayout.measurement_units || "ft";

  // Patterns for "missing [room]" or "we are missing [room]" - detect rooms that should exist but don't
  // Examples: "missing a garage", "we are missing a storage room", "missing garage and storage"
  const missingRoomPatterns = [
    /(?:we\s+are\s+)?missing\s+(?:a\s+|an\s+)?([^,\s]+(?:\s+[^,\s]+)*?)(?:\s+and\s+(?:a\s+|an\s+)?([^,\s]+(?:\s+[^,\s]+)*?))?/gi,
    /(?:we\s+)?don'?t\s+have\s+(?:a\s+|an\s+)?([^,\s]+(?:\s+[^,\s]+)*?)(?:\s+and\s+(?:a\s+|an\s+)?([^,\s]+(?:\s+[^,\s]+)*?))?/gi,
  ];

  // Patterns for width×length: "Room Name: W × L ft" or "Room Name: W×L" or "add Room Name 50*100"
  const dimensionPatterns = [
    /(?:add\s+(?:a\s+|an\s+|an?\s+)?)?([^:]+?)\s*:?\s*(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)\s*(?:ft|sq\s*ft|m|sq\s*m|→)?/gi,
    /(?:add\s+(?:a\s+|an\s+|an?\s+)?)?([^:]+?)\s*:?\s*(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*(?:ft|sq\s*ft|m|sq\s*m|→)?/gi,
  ];

  // Patterns for area-only: "add storage room of 50 sq ft" or "add an extra storage room of 50 ft"
  const areaOnlyPatterns = [
    /(?:add\s+(?:a\s+|an\s+)?(?:extra\s+)?)?([^:]+?)\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:sq\s*)?ft\b/gi,
    /(?:add\s+(?:a\s+|an\s+)?(?:extra\s+)?)?([^:]+?)\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:sq\s*)?m\b/gi,
  ];

  let updated = false;
  const updatedRooms = [...rooms];
  const processedRooms = new Set<number>(); // Track which existing rooms were updated
  const processedNewRooms = new Set<string>(); // Track new rooms we've added (by normalized name)

  // First pass: try to match existing rooms with dimension patterns (width×length)
  for (let i = 0; i < updatedRooms.length; i++) {
    const room = updatedRooms[i];
    const roomName = (room.room ?? room.name ?? "").toLowerCase();

    for (const pattern of dimensionPatterns) {
      pattern.lastIndex = 0; // Reset regex
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const mentionedName = match[1].trim();
        const width = parseFloat(match[2]);
        const length = parseFloat(match[3]);
        if (Number.isNaN(width) || Number.isNaN(length)) continue;

        const matchResult = matchRoomName(mentionedName, roomName);
        if (matchResult.match) {
          updated = true;
          processedRooms.add(i);
          updatedRooms[i] = {
            ...room,
            width,
            length,
            area: width * length,
            source: "user" as const,
            status: "confirmed" as const,
          };
          break; // Found match, move to next room
        }
      }
    }
  }

  // Second pass: detect new rooms with dimension patterns (width×length)
  for (const pattern of dimensionPatterns) {
    pattern.lastIndex = 0; // Reset regex
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const mentionedName = match[1].trim();
      const width = parseFloat(match[2]);
      const length = parseFloat(match[3]);
      if (Number.isNaN(width) || Number.isNaN(length)) continue;

      const normMentioned = normalizeRoomName(mentionedName);

      // Check if this room already exists (was processed in first pass)
      const exists = updatedRooms.some((r) => {
        const existingName = normalizeRoomName(r.room ?? r.name ?? "");
        return (
          normMentioned === existingName ||
          normMentioned.includes(existingName) ||
          existingName.includes(normMentioned)
        );
      });

      // If room doesn't exist and message suggests adding (has "add" or no colon), add it
      const msgLower = message.toLowerCase();
      const isAddRequest = msgLower.includes("add");
      const hasColon = message.includes(":");

      if (!exists && !processedNewRooms.has(normMentioned) && (isAddRequest || (!hasColon && width > 0 && length > 0))) {
        updated = true;
        processedNewRooms.add(normMentioned);

        const nextRoomId = `r${updatedRooms.length + 1}`;
        const roomType = inferRoomType(normMentioned);
        const displayName = capitalizeRoomName(normMentioned);

        updatedRooms.push({
          room_id: nextRoomId,
          room: displayName,
          name: displayName,
          room_type: roomType,
          width,
          length,
          area: width * length,
          source: "user" as const,
          status: "confirmed" as const,
        });
        break; // Added new room, move to next pattern
      }
    }
  }

  // Third pass: detect area-only updates for EXISTING rooms (e.g., "Kitchen / Dining (300 sq ft)")
  const areaUpdatePatterns = [
    /([^:(]+?)\s*[:(]\s*(\d+(?:\.\d+)?)\s*(?:sq\s*)?ft\b/gi,
    /([^:(]+?)\s+(\d+(?:\.\d+)?)\s*(?:sq\s*)?ft\b/gi,
  ];

  for (const pattern of areaUpdatePatterns) {
    pattern.lastIndex = 0; // Reset regex
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const mentionedName = match[1].trim();
      const area = parseFloat(match[2]);
      if (Number.isNaN(area) || area <= 0) continue;

      const normMentioned = normalizeRoomName(mentionedName);

      // Try to match existing rooms
      for (let i = 0; i < updatedRooms.length; i++) {
        if (processedRooms.has(i)) continue; // Already updated in first pass

        const room = updatedRooms[i];
        const roomName = (room.room ?? room.name ?? "").toLowerCase();
        const normRoom = normalizeRoomName(roomName);

        // Fuzzy match: check if mentioned name matches existing room
        if (
          normMentioned === normRoom ||
          normMentioned.includes(normRoom) ||
          normRoom.includes(normMentioned) ||
          normMentioned.split(/\s+|\//).some((word) => word.length > 2 && normRoom.includes(word)) ||
          normRoom.split(/\s+|\//).some((word) => word.length > 2 && normMentioned.includes(word))
        ) {
          updated = true;
          processedRooms.add(i);

          // Estimate dimensions from area, preserving aspect ratio if possible
          const currentWidth =
            typeof room.width === "number"
              ? room.width
              : parseFloat(String(room.width ?? "").replace(/[^\d.]/g, "") || "0");
          const currentLength =
            typeof room.length === "number"
              ? room.length
              : parseFloat(String(room.length ?? "").replace(/[^\d.]/g, "") || "0");

          let width: number, length: number;
          if (!Number.isNaN(currentWidth) && !Number.isNaN(currentLength) && currentWidth > 0 && currentLength > 0) {
            // Preserve aspect ratio
            const aspectRatio = currentWidth / currentLength;
            // Clamp aspect ratio to reasonable bounds
            const clampedRatio = Math.max(MIN_ASPECT_RATIO, Math.min(MAX_ASPECT_RATIO, aspectRatio));
            length = Math.sqrt(area / clampedRatio);
            width = area / length;
            // Round to reasonable values
            width = Math.round(width * 10) / 10;
            length = Math.round(length * 10) / 10;
          } else {
            // No existing dimensions, estimate from area
            const estimated = estimateDimensionsFromArea(area);
            width = estimated.width;
            length = estimated.length;
          }

          updatedRooms[i] = {
            ...room,
            width,
            length,
            area,
            source: "user" as const,
            status: "confirmed" as const,
          };
          break; // Found match, move to next pattern
        }
      }
    }
  }

  // Fourth pass: detect area-only NEW rooms (e.g., "add storage room of 50 sq ft")
  for (const pattern of areaOnlyPatterns) {
    pattern.lastIndex = 0; // Reset regex
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const mentionedName = match[1].trim();
      const area = parseFloat(match[2]);
      if (Number.isNaN(area) || area <= 0) continue;

      // Validate area bounds
      if (area < MIN_ROOM_AREA || area > MAX_ROOM_AREA) continue;

      const normMentioned = normalizeRoomName(mentionedName);

      // Check if room already exists
      const exists = updatedRooms.some((r) => {
        const existingName = normalizeRoomName(r.room ?? r.name ?? "");
        return (
          normMentioned === existingName ||
          normMentioned.includes(existingName) ||
          existingName.includes(normMentioned)
        );
      });

      if (!exists && !processedNewRooms.has(normMentioned)) {
        updated = true;
        processedNewRooms.add(normMentioned);

        const estimated = estimateDimensionsFromArea(area);
        const nextRoomId = `r${updatedRooms.length + 1}`;
        const roomType = inferRoomType(normMentioned);
        const displayName = capitalizeRoomName(normMentioned);

        updatedRooms.push({
          room_id: nextRoomId,
          room: displayName,
          name: displayName,
          room_type: roomType,
          width: estimated.width,
          length: estimated.length,
          area,
          source: "user" as const,
          status: "confirmed" as const,
        });
        break; // Added new room, move to next pattern
      }
    }
  }

  // Fifth pass: detect "missing [room]" statements (e.g., "missing a garage and storage room")
  // When user says "missing X", add it with estimated dimensions if it doesn't exist
  for (const pattern of missingRoomPatterns) {
    pattern.lastIndex = 0; // Reset regex
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const roomNames = [match[1], match[2]].filter(Boolean).map((n) => n.trim());
      
      for (const mentionedName of roomNames) {
        if (!mentionedName) continue;
        
        const normMentioned = normalizeRoomName(mentionedName);
        
        // Check if room already exists
        const exists = updatedRooms.some((r) => {
          const existingName = normalizeRoomName(r.room ?? r.name ?? "");
          return (
            normMentioned === existingName ||
            normMentioned.includes(existingName) ||
            existingName.includes(normMentioned)
          );
        });

        // If room doesn't exist, add it with estimated dimensions
        if (!exists && !processedNewRooms.has(normMentioned)) {
          updated = true;
          processedNewRooms.add(normMentioned);

          // Estimate reasonable dimensions for common room types
          let estimatedArea = 100; // Default 100 sq ft
          if (normMentioned.includes("garage")) {
            estimatedArea = 200; // Garages are typically larger
          } else if (normMentioned.includes("storage")) {
            estimatedArea = 50; // Storage rooms are typically smaller
          } else if (normMentioned.includes("closet")) {
            estimatedArea = 30;
          }

          const estimated = estimateDimensionsFromArea(estimatedArea);
          const nextRoomId = `r${updatedRooms.length + 1}`;
          const roomType = inferRoomType(normMentioned);
          const displayName = capitalizeRoomName(normMentioned);

          updatedRooms.push({
            room_id: nextRoomId,
            room: displayName,
            name: displayName,
            room_type: roomType,
            width: estimated.width,
            length: estimated.length,
            area: estimatedArea,
            source: "user" as const,
            status: "confirmed" as const,
          });
        }
      }
    }
  }

  if (!updated) return null;

  // Preserve total_area (don't increase it when adding rooms)
  return {
    ...currentLayout,
    rooms: updatedRooms,
  };
}
