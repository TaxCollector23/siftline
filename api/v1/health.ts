import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { prepareResponse, requestId } from "../_lib/http.js";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (!prepareResponse(req, res)) return;
  if (req.method !== "GET") { res.status(405).json({ error: "method_not_allowed" }); return }
  res.status(200).json({ ok: true, service: "cutdex-api", version: "0.3.0", optimizer: "deterministic-local", openaiApiCalls: 0, billingBoundary: "model execution remains in the Codex client", requestId: requestId(req), firebaseConfigured: Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY && process.env.SIFTLINE_KEY_PEPPER) });
}
