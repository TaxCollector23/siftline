import { describe, expect, it } from "vitest";
import { bearerToken, prepareResponse, publicErrorMessage } from "./http.js";

function response() {
  const headers = new Map<string, string>();
  return { headers, statusCode: 0, ended: false, status(code: number) { this.statusCode = code; return this; }, json() {}, setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); }, end() { this.ended = true; } };
}

describe("API HTTP boundaries", () => {
  it("allows only the product and local development origins", () => {
    const allowed = response();
    expect(prepareResponse({ method: "GET", headers: { origin: "http://localhost:5173" }, query: {} }, allowed)).toBe(true);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

    const hostile = response();
    prepareResponse({ method: "GET", headers: { origin: "http://localhost.evil.example:5173" }, query: {} }, hostile);
    expect(hostile.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("handles preflight and bearer scheme casing", () => {
    const result = response();
    expect(prepareResponse({ method: "OPTIONS", headers: { origin: "https://siftline-omega.vercel.app" }, query: {} }, result)).toBe(false);
    expect(result.statusCode).toBe(204);
    expect(bearerToken({ headers: { authorization: "bearer  secret-token" }, query: {} })).toBe("secret-token");
  });

  it("does not expose internal errors for server failures", () => {
    expect(publicErrorMessage(new Error("private stack detail"), 500, "Service unavailable")).toBe("Service unavailable");
    expect(publicErrorMessage(new Error("bad request"), 400, "Fallback")).toBe("bad request");
  });
});
