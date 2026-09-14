import type { SocialSignal } from "../types.js";

/**
 * Pluggable social-signal provider interface (spec sections 15 & 44). The
 * system must function correctly with zero providers configured — social
 * data is a confirmation/ranking input only, never an independent trigger,
 * and its absence must never be silently treated as zero.
 */
export interface SocialSignalProvider {
  readonly name: string;
  fetchSignal(baseAsset: string): Promise<SocialSignal>;
}

/** Default provider used when no real social API is configured. Always reports "unavailable". */
export class NoopSocialSignalProvider implements SocialSignalProvider {
  readonly name = "none";
  async fetchSignal(): Promise<SocialSignal> {
    return { available: false };
  }
}
