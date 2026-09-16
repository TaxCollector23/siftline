import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_KEY_PREFIX = "sift_live";
export const DEFAULT_RPM_LIMIT = 60;
export const DEFAULT_MONTHLY_LIMIT = 10_000;
export const MAX_KEYS_PER_ACCOUNT = 3;

export interface ParsedApiKey {
  id: string;
  secret: string;
}

export interface GeneratedApiKey extends ParsedApiKey {
  value: string;
  lastFour: string;
}

export function generateApiKey(): GeneratedApiKey {
  const id = randomBytes(9).toString("base64url");
  const secret = randomBytes(24).toString("base64url");
  return { id, secret, value: `${API_KEY_PREFIX}_${id}_${secret}`, lastFour: secret.slice(-4) };
}

export function parseApiKey(value: string): ParsedApiKey | null {
  const match = value.trim().match(/^sift_live_([A-Za-z0-9_-]{12})_([A-Za-z0-9_-]{32})$/);
  return match?.[1] && match[2] ? { id: match[1], secret: match[2] } : null;
}

export function hashApiKeySecret(secret: string, pepper: string): string {
  return createHash("sha256").update(`${secret}:${pepper}`).digest("hex");
}

export function safeHashEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function maskApiKey(value: string): string {
  const parsed = parseApiKey(value);
  return parsed ? `${API_KEY_PREFIX}_${parsed.id.slice(0, 4)}…${parsed.secret.slice(-4)}` : "invalid key";
}

export function currentMinuteKey(now = new Date()): string {
  return now.toISOString().slice(0, 16);
}

export function currentMonthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}
