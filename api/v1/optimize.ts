import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { bearerToken, bodySizeOkay, prepareResponse, requestId } from "../_lib/http.js";
import { authorizeApiKey } from "../_lib/firebase.js";
import { optimizeToolCall, type OptimizeInput } from "../../packages/core/src/index.js";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!prepareResponse(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return }
  if (!bodySizeOkay(req.body)) { res.status(413).json({ error: "request_too_large" }); return }
  const token = bearerToken(req); if (!token) { res.status(401).json({ error: "missing_api_key" }); return }
  try {
    const input = req.body as OptimizeInput;
    if (!input || typeof input.task !== "string" || !input.tool || typeof input.tool.name !== "string" || !input.request || typeof input.request !== "object") { res.status(400).json({ error: "invalid_request", message: "Expected task, tool, and request." }); return }
    const key = await authorizeApiKey(token);
    const result = optimizeToolCall(input);
    res.setHeader("X-RateLimit-Remaining-Minute", String(key.rate.remainingMinute));
    res.setHeader("X-RateLimit-Remaining-Month", String(key.rate.remainingMonth));
    res.status(200).json({ ...result, requestId: requestId(req), usage: { keyId: key.id, remainingMinute: key.rate.remainingMinute, remainingMonth: key.rate.remainingMonth } });
  } catch (error) {
    const status = Number((error as { statusCode?: number }).statusCode ?? 500);
    const rate = (error as { rate?: { remainingMinute: number; remainingMonth: number } }).rate;
    if (rate) { res.setHeader("X-RateLimit-Remaining-Minute", String(rate.remainingMinute)); res.setHeader("X-RateLimit-Remaining-Month", String(rate.remainingMonth)) }
    res.status(status).json({ error: status === 429 ? "rate_limited" : status === 401 ? "authentication_failed" : "service_unavailable", message: error instanceof Error ? error.message : "Optimization failed", requestId: requestId(req) });
  }
}
