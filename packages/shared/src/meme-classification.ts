import type { MemeClassification } from "./types.js";

/**
 * Seed heuristic only — NOT the source of truth. The authoritative classification
 * lives in the `markets` table and is editable per-market from Settings
 * (INCLUDED / EXCLUDED / PENDING_REVIEW always win over this heuristic).
 * This just decides what a *newly discovered* market gets by default so an
 * operator doesn't have to hand-classify Kraken's entire pair list from
 * PENDING_REVIEW on day one.
 */
const KNOWN_MEME_BASE_ASSETS = new Set([
  "DOGE",
  "SHIB",
  "PEPE",
  "WIF",
  "BONK",
  "FLOKI",
  "MEME",
  "POPCAT",
  "MOG",
  "BRETT",
  "TRUMP",
  "GOAT",
  "PNUT",
  "TURBO",
  "NEIRO",
  "FARTCOIN",
]);

const MEME_NAME_PATTERNS = [/dog/i, /cat/i, /inu/i, /pepe/i, /elon/i, /moon/i, /wojak/i];

/**
 * Suggests an initial classification for a newly-discovered market. Returns
 * AUTO_CLASSIFIED (meme, include-by-default-pending-liquidity-check) when the
 * base asset matches a known meme coin; otherwise PENDING_REVIEW so a human
 * (or a future, better classifier) decides — we never silently exclude a coin
 * that might be a meme just because it's unrecognized, and never silently
 * include a non-meme coin either.
 */
export function suggestMemeClassification(baseAsset: string): MemeClassification {
  if (KNOWN_MEME_BASE_ASSETS.has(baseAsset.toUpperCase())) return "AUTO_CLASSIFIED";
  if (MEME_NAME_PATTERNS.some((pattern) => pattern.test(baseAsset))) return "AUTO_CLASSIFIED";
  return "PENDING_REVIEW";
}

/** Whether a market's classification means it should be considered for signal analysis. */
export function isMemeEligible(classification: MemeClassification): boolean {
  return classification === "AUTO_CLASSIFIED" || classification === "INCLUDED";
}
