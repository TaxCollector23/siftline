import type { ApiRequest, ApiResponse } from "../../_lib/http.js";
import { bearerToken, prepareResponse, publicErrorMessage, requestId } from "../../_lib/http.js";
import { authorizeApiKey } from "../../_lib/firebase.js";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!prepareResponse(req, res)) return;
  if (req.method !== "GET") { res.status(405).json({ error: "method_not_allowed" }); return }
  const token = bearerToken(req); if (!token) { res.status(401).json({ error: "missing_api_key" }); return }
  try { const key = await authorizeApiKey(token, { consume: false }); res.status(200).json({ ok: true, key: { id: key.id, name: key.name, lastFour: key.lastFour }, limits: { remainingMinute: key.rate.remainingMinute, remainingMonth: key.rate.remainingMonth }, requestId: requestId(req) }) }
  catch (error) { const status = Number((error as { statusCode?: number }).statusCode ?? 500); res.status(status).json({ error: status === 500 ? "service_unavailable" : "authentication_failed", message: publicErrorMessage(error, status, "Authentication failed"), requestId: requestId(req) }) }
}
