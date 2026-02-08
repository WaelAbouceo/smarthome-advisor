/**
 * Application-wide constants
 */

// Chat panel constants
export const DEMO_CUSTOMER_ID = "CUST_1001";
export const STREAMING_ID = "__streaming__";
export const ANALYZING_ID = "__analyzing__";

// Layout confidence threshold
export const CONFIDENCE_THRESHOLD = 0.75;

// Room types
export const ROOM_TYPES = [
  "living",
  "bedroom",
  "bathroom",
  "kitchen",
  "entry",
  "workspace",
  "meeting",
  "other",
] as const;

export const ROOM_TYPE_LABELS: Record<string, string> = {
  living: "Living",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  entry: "Entry",
  workspace: "Workspace",
  meeting: "Meeting",
  other: "Other",
};

// Room name normalization
export const ROOM_NAME_TYPOS: Record<string, string> = {
  carage: "garage",
  garage: "garage",
  garaje: "garage",
  bedrom: "bedroom",
  bathrom: "bathroom",
  kichen: "kitchen",
  livng: "living",
};

// Dimension parsing bounds
export const MIN_ROOM_AREA = 1;
export const MAX_ROOM_AREA = 100000;

// Aspect ratio limits (1:5 to 5:1)
export const MIN_ASPECT_RATIO = 0.2; // 1:5
export const MAX_ASPECT_RATIO = 5.0; // 5:1
