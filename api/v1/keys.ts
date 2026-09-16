import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { bearerToken, bodySizeOkay, prepareResponse, requestId } from "../_lib/http.js";
import { createUserKey, listUserKeys, revokeUserKey, verifyFirebaseIdToken } from "../_lib/firebase.js";
import { DEFAULT_MONTHLY_LIMIT, DEFAULT_RPM_LIMIT, generateApiKey, hashApiKeySecret, MAX_KEYS_PER_ACCOUNT } from "../../packages/api/src/index.js";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!prepareResponse(req, res)) return;
  const token = bearerToken(req); if (!token) { res.status(401).json({ error: "missing_identity_token" }); return }
  try {
    const identity = await verifyFirebaseIdToken(token);
    if (req.method === "GET") { const keys = await listUserKeys(identity.uid); res.status(200).json({ keys: keys.map((key) => ({ id: key.id, name: key.name, lastFour: key.lastFour, status: key.status, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt, rpmLimit: key.rpmLimit, monthlyLimit: key.monthlyLimit })) }); return }
    if (req.method === "POST") {
      if (!bodySizeOkay(req.body, 4_000)) { res.status(413).json({ error: "request_too_large" }); return }
      const existing = await listUserKeys(identity.uid); if (existing.filter((key) => key.status === "active").length >= MAX_KEYS_PER_ACCOUNT) { res.status(409).json({ error: "key_limit_reached", message: `Each account can have ${MAX_KEYS_PER_ACCOUNT} active keys.` }); return }
      const pepper = process.env.SIFTLINE_KEY_PEPPER; if (!pepper) { res.status(503).json({ error: "service_unavailable", message: "API key creation is not configured." }); return }
      const body = req.body as { name?: string }; const name = body?.name?.trim().slice(0, 60) || "Default key"; const generated = generateApiKey(); const now = new Date().toISOString();
      await createUserKey({ id: generated.id, userId: identity.uid, name, hash: hashApiKeySecret(generated.secret, pepper), lastFour: generated.lastFour, status: "active", rpmLimit: DEFAULT_RPM_LIMIT, monthlyLimit: DEFAULT_MONTHLY_LIMIT, minuteKey: "", minuteCount: 0, monthKey: "", monthCount: 0, createdAt: now });
      res.status(201).json({ apiKey: generated.value, key: { id: generated.id, name, lastFour: generated.lastFour, createdAt: now }, warning: "Copy this key now. It will not be shown again.", requestId: requestId(req) }); return;
    }
    if (req.method === "DELETE") { const id = typeof req.query.id === "string" ? req.query.id : ""; if (!id) { res.status(400).json({ error: "missing_key_id" }); return } await revokeUserKey(id, identity.uid); res.status(200).json({ ok: true, requestId: requestId(req) }); return }
    res.status(405).json({ error: "method_not_allowed" });
  } catch (error) { const status = Number((error as { statusCode?: number }).statusCode ?? 500); res.status(status).json({ error: status === 401 ? "authentication_failed" : "service_unavailable", message: error instanceof Error ? error.message : "Request failed", requestId: requestId(req) }) }
}
