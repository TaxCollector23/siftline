import { currentMinuteKey, currentMonthKey, DEFAULT_MONTHLY_LIMIT, DEFAULT_RPM_LIMIT } from "./auth.js";

export interface RateLimitState {
  minuteKey: string;
  minuteCount: number;
  monthKey: string;
  monthCount: number;
}

export interface RateLimitResult extends RateLimitState {
  allowed: boolean;
  reason?: "minute" | "month";
  remainingMinute: number;
  remainingMonth: number;
}

export function inspectRateLimit(state: Partial<RateLimitState>, limits: { rpm?: number; monthly?: number } = {}, now = new Date()): RateLimitResult {
  const minuteKey = currentMinuteKey(now);
  const monthKey = currentMonthKey(now);
  const rpm = limits.rpm ?? DEFAULT_RPM_LIMIT;
  const monthly = limits.monthly ?? DEFAULT_MONTHLY_LIMIT;
  const minuteCount = state.minuteKey === minuteKey ? (state.minuteCount ?? 0) : 0;
  const monthCount = state.monthKey === monthKey ? (state.monthCount ?? 0) : 0;
  const minuteBlocked = minuteCount >= rpm;
  const monthBlocked = monthCount >= monthly;
  return { allowed: !minuteBlocked && !monthBlocked, reason: minuteBlocked ? "minute" : monthBlocked ? "month" : undefined, minuteKey, minuteCount, monthKey, monthCount, remainingMinute: Math.max(0, rpm - minuteCount), remainingMonth: Math.max(0, monthly - monthCount) };
}

export function consumeRateLimit(
  state: Partial<RateLimitState>,
  limits: { rpm?: number; monthly?: number } = {},
  now = new Date(),
): RateLimitResult {
  const minuteKey = currentMinuteKey(now);
  const monthKey = currentMonthKey(now);
  const rpm = limits.rpm ?? DEFAULT_RPM_LIMIT;
  const monthly = limits.monthly ?? DEFAULT_MONTHLY_LIMIT;
  const minuteCount = state.minuteKey === minuteKey ? (state.minuteCount ?? 0) : 0;
  const monthCount = state.monthKey === monthKey ? (state.monthCount ?? 0) : 0;
  if (minuteCount >= rpm) return { allowed: false, reason: "minute", minuteKey, minuteCount, monthKey, monthCount, remainingMinute: 0, remainingMonth: Math.max(0, monthly - monthCount) };
  if (monthCount >= monthly) return { allowed: false, reason: "month", minuteKey, minuteCount, monthKey, monthCount, remainingMinute: Math.max(0, rpm - minuteCount), remainingMonth: 0 };
  return { allowed: true, minuteKey, minuteCount: minuteCount + 1, monthKey, monthCount: monthCount + 1, remainingMinute: Math.max(0, rpm - minuteCount - 1), remainingMonth: Math.max(0, monthly - monthCount - 1) };
}
