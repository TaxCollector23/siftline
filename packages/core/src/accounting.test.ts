import { describe, expect, it } from "vitest";
import { compareUsage } from "./accounting.js";

describe("compareUsage", () => {
  it("measures total token and estimated cost savings across input and output", () => {
    expect(compareUsage({ baseline: { inputTokens: 1_000_000, outputTokens: 100_000 }, cutdex: { inputTokens: 200_000, outputTokens: 100_000 } })).toMatchObject({
      inputTokensSaved: 800_000,
      outputTokensSaved: 0,
      totalTokensSaved: 800_000,
      inputReductionPercent: 80,
      totalReductionPercent: 72.7,
      baselineCostUsd: 4.5,
      cutdexCostUsd: 2.1,
      costSavedUsd: 2.4,
      costReductionPercent: 53.3,
    });
  });

  it("does not invent savings when usage is unavailable", () => {
    expect(compareUsage({ baseline: {}, cutdex: {} })).toMatchObject({ totalTokensSaved: 0, costSavedUsd: 0, totalReductionPercent: 0 });
  });
});
