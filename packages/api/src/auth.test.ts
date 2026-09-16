import { describe, expect, it } from "vitest";
import { consumeRateLimit, generateApiKey, hashApiKeySecret, parseApiKey, safeHashEqual } from "./index.js";

describe("api key security", () => {
  it("generates parseable keys and stores only a hash", () => {
    const key = generateApiKey();
    expect(parseApiKey(key.value)).toEqual({ id: key.id, secret: key.secret });
    const hash = hashApiKeySecret(key.secret, "pepper");
    expect(hash).not.toContain(key.secret);
    expect(safeHashEqual(hash, hashApiKeySecret(key.secret, "pepper"))).toBe(true);
  });

  it("rejects malformed keys", () => {
    expect(parseApiKey("not-a-key")).toBeNull();
  });
});

describe("rate limits", () => {
  it("resets minute counters and enforces the configured cap", () => {
    const now = new Date("2026-09-15T12:30:10.000Z");
    const first = consumeRateLimit({}, { rpm: 1, monthly: 2 }, now);
    expect(first.allowed).toBe(true);
    const blocked = consumeRateLimit(first, { rpm: 1, monthly: 2 }, now);
    expect(blocked).toMatchObject({ allowed: false, reason: "minute" });
    const nextMinute = consumeRateLimit(first, { rpm: 1, monthly: 2 }, new Date("2026-09-15T12:31:00.000Z"));
    expect(nextMinute.allowed).toBe(true);
  });
});
