export interface Pricing { model: string; inputPerMillion: number; cachedInputPerMillion: number; outputPerMillion: number }
export const defaultPricing: Pricing = { model: "illustrative", inputPerMillion: 3, cachedInputPerMillion: 0.3, outputPerMillion: 15 };
export function costForTokens(inputTokens: number, outputTokens: number, pricing: Pricing = defaultPricing): number { return (inputTokens / 1_000_000) * pricing.inputPerMillion + (outputTokens / 1_000_000) * pricing.outputPerMillion }
export function percentile(values: number[], p: number): number { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0 }

export interface UsageSnapshot { inputTokens?: number; outputTokens?: number }
export interface UsageComparison { baseline: UsageSnapshot; cutdex: UsageSnapshot }
export interface UsageDelta {
  baselineInputTokens: number;
  cutdexInputTokens: number;
  baselineOutputTokens: number;
  cutdexOutputTokens: number;
  inputTokensSaved: number;
  outputTokensSaved: number;
  totalTokensSaved: number;
  inputReductionPercent: number;
  totalReductionPercent: number;
  baselineCostUsd: number;
  cutdexCostUsd: number;
  costSavedUsd: number;
  costReductionPercent: number;
}

function safeTokens(value: number | undefined): number { return Number.isFinite(value) && value && value > 0 ? Math.round(value) : 0 }
function reductionPercent(before: number, after: number): number { return before ? Number(((1 - after / before) * 100).toFixed(1)) : 0 }

export function compareUsage(comparison: UsageComparison, pricing: Pricing = defaultPricing): UsageDelta {
  const baselineInputTokens = safeTokens(comparison.baseline.inputTokens);
  const cutdexInputTokens = safeTokens(comparison.cutdex.inputTokens);
  const baselineOutputTokens = safeTokens(comparison.baseline.outputTokens);
  const cutdexOutputTokens = safeTokens(comparison.cutdex.outputTokens);
  const baselineTotal = baselineInputTokens + baselineOutputTokens;
  const cutdexTotal = cutdexInputTokens + cutdexOutputTokens;
  const baselineCostUsd = costForTokens(baselineInputTokens, baselineOutputTokens, pricing);
  const cutdexCostUsd = costForTokens(cutdexInputTokens, cutdexOutputTokens, pricing);
  return {
    baselineInputTokens,
    cutdexInputTokens,
    baselineOutputTokens,
    cutdexOutputTokens,
    inputTokensSaved: baselineInputTokens - cutdexInputTokens,
    outputTokensSaved: baselineOutputTokens - cutdexOutputTokens,
    totalTokensSaved: baselineTotal - cutdexTotal,
    inputReductionPercent: reductionPercent(baselineInputTokens, cutdexInputTokens),
    totalReductionPercent: reductionPercent(baselineTotal, cutdexTotal),
    baselineCostUsd: Number(baselineCostUsd.toFixed(6)),
    cutdexCostUsd: Number(cutdexCostUsd.toFixed(6)),
    costSavedUsd: Number((baselineCostUsd - cutdexCostUsd).toFixed(6)),
    costReductionPercent: reductionPercent(baselineCostUsd, cutdexCostUsd),
  };
}
