// Shared tier configuration, colors, and types for the Demand Tiers feature.
// Imported by both the live board (demand-tiers.tsx) and the custom drag-drop board.

/** Ordered list of the eight rated tiers, best demand → worst. */
export const TIER_ORDER = ["S+", "S", "A", "B", "C", "D", "F", "F-"] as const;

/** A rated tier letter, the special "?" (unrated) bucket, or any string for safety. */
export type Tier = (typeof TIER_ORDER)[number] | "?";

/** Color for each tier's label box / accent. Light-ish tiers get dark text (see tierTextColor). */
export const TIER_COLORS: Record<string, string> = {
  "S+": "#ff6b6b",
  S: "#ff9f43",
  A: "#feca57",
  B: "#c8e66b",
  C: "#5be86b",
  D: "#48dbcd",
  F: "#54a0ff",
  "F-": "#5f76e8",
  "?": "#9aa0a6",
};

/** Tiers whose background is light enough that dark text reads better for contrast. */
const LIGHT_TIERS = new Set(["A", "B", "C", "D"]);

/** Human-friendly label for a tier (currently identity, kept for future tweaks). */
export function tierLabel(tier: string): string {
  return tier;
}

/** Pick a readable foreground color for text placed on TIER_COLORS[tier]. */
export function tierTextColor(tier: string): string {
  return LIGHT_TIERS.has(tier) ? "#1f2937" : "#ffffff";
}

/** A single watch model row as returned by GET /api/demand-tiers/public. */
export interface TierModel {
  ref: string;
  name: string;
  collection: string;
  mrp: number | null;
  marketPrice: number | null;
  /** Premium of market price over retail, as a percentage. null when unrated (tier "?"). */
  premiumPct: number | null;
  tier: Tier;
  sampleSize: number;
  imageUrl: string;
}

/** Full response shape of GET /api/demand-tiers/public?quarter=YYYY-Qn. */
export interface DemandTiersPublicResponse {
  quarter: string;
  currency: string;
  fxRatesUsed: Record<string, number>;
  quartersAvailable: string[];
  models: TierModel[];
}
