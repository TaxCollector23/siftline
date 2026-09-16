import { describe, expect, it } from "vitest";
import { optimizeToolCall, parseSelect } from "./index.js";
describe("siftline optimizer", () => {
  it("narrows a read-only SQL query", () => { const result = optimizeToolCall({ task: "Find the five most recent failed enterprise orders and show customer name, total and error", tool: { name: "database.query", kind: "READ", readOnly: true }, request: { query: "SELECT * FROM orders" } }); expect(result.optimizedRequest.query).toContain("customer_name"); expect(result.optimizedRequest.query).toContain("LIMIT 5"); expect(result.applied.map((item) => item.name)).toEqual(["PROJECTION", "PREDICATE", "SORT", "LIMIT"]) });
  it("never changes writes", () => { const request = { query: "DELETE FROM orders WHERE status = 'failed'" }; const result = optimizeToolCall({ task: "delete failed orders", tool: { name: "database.query", kind: "WRITE", readOnly: false }, request }); expect(result.optimizedRequest).toEqual(request); expect(result.safety).toBe("passed-through") });
  it("parses select ASTs instead of editing SQL text", () => { expect(parseSelect("SELECT id, title FROM issues WHERE state = 'open' ORDER BY created_at DESC LIMIT 10")).toMatchObject({ table: "issues", limit: 10, orderBy: { direction: "DESC" } }) });
});
