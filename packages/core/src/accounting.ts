export interface Pricing { model: string; inputPerMillion: number; cachedInputPerMillion: number; outputPerMillion: number }
export const defaultPricing: Pricing = { model: "illustrative", inputPerMillion: 3, cachedInputPerMillion: 0.3, outputPerMillion: 15 };
export function costForTokens(inputTokens: number, outputTokens: number, pricing: Pricing = defaultPricing): number { return (inputTokens / 1_000_000) * pricing.inputPerMillion + (outputTokens / 1_000_000) * pricing.outputPerMillion }
export function percentile(values: number[], p: number): number { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0 }
