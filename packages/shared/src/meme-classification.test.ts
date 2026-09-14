import { describe, expect, it } from "vitest";
import { isMemeEligible, suggestMemeClassification } from "./meme-classification.js";

describe("suggestMemeClassification", () => {
  it("classifies known meme coins as AUTO_CLASSIFIED", () => {
    expect(suggestMemeClassification("DOGE")).toBe("AUTO_CLASSIFIED");
    expect(suggestMemeClassification("pepe")).toBe("AUTO_CLASSIFIED");
  });

  it("leaves unrecognized assets as PENDING_REVIEW rather than guessing", () => {
    expect(suggestMemeClassification("BTC")).toBe("PENDING_REVIEW");
    expect(suggestMemeClassification("ETH")).toBe("PENDING_REVIEW");
    expect(suggestMemeClassification("SOL")).toBe("PENDING_REVIEW");
  });
});

describe("isMemeEligible", () => {
  it("treats AUTO_CLASSIFIED and INCLUDED as eligible", () => {
    expect(isMemeEligible("AUTO_CLASSIFIED")).toBe(true);
    expect(isMemeEligible("INCLUDED")).toBe(true);
  });

  it("treats EXCLUDED and PENDING_REVIEW as ineligible", () => {
    expect(isMemeEligible("EXCLUDED")).toBe(false);
    expect(isMemeEligible("PENDING_REVIEW")).toBe(false);
  });
});
