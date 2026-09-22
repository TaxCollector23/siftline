import { describe, expect, it } from "vitest";
import { compactToolResult, executeWithCutdex } from "./index.js";

describe("cutdex result compactor", () => {
  it("removes unrequested fields and rows from a structured read result", () => {
    const result = compactToolResult({ task: "Show the five most recent failed orders with id and status", result: { rows: [
      { id: 1, status: "failed", created_at: "2026-09-20", internal_notes: "x" },
      { id: 2, status: "failed", created_at: "2026-09-19", internal_notes: "y" },
      { id: 3, status: "failed", created_at: "2026-09-18", internal_notes: "z" },
      { id: 4, status: "failed", created_at: "2026-09-17", internal_notes: "a" },
      { id: 5, status: "failed", created_at: "2026-09-16", internal_notes: "b" },
      { id: 6, status: "failed", created_at: "2026-09-15", internal_notes: "c" },
    ] } });
    expect(result.changed).toBe(true);
    expect(result.removedFields).toBe(5);
    expect(result.removedItems).toBe(1);
    expect(result.compactedResult).toEqual({ rows: [
      { id: 1, status: "failed", created_at: "2026-09-20" }, { id: 2, status: "failed", created_at: "2026-09-19" }, { id: 3, status: "failed", created_at: "2026-09-18" },
      { id: 4, status: "failed", created_at: "2026-09-17" }, { id: 5, status: "failed", created_at: "2026-09-16" },
    ] });
  });

  it("does not guess fields for an ambiguous task", () => {
    const result = compactToolResult({ task: "Inspect the response", result: [{ id: 1, secret: "keep" }] });
    expect(result.changed).toBe(false);
    expect(result.compactedResult).toEqual([{ id: 1, secret: "keep" }]);
  });

  it("optimizes and compacts in one adapter call", async () => {
    let request = "";
    const result = await executeWithCutdex({ task: "Find the latest failed order with id and status", tool: { name: "database.query", kind: "READ", readOnly: true }, request: { query: "SELECT * FROM orders" } }, async (optimized) => {
      request = String(optimized.query);
      return [{ id: 1, status: "failed", created_at: "2026-09-20", internal_notes: "x" }];
    });
    expect(request).toContain("WHERE status = 'failed'");
    expect(result.response).toEqual([{ id: 1, status: "failed", created_at: "2026-09-20" }]);
    expect(result.compaction.changed).toBe(true);
  });
});
