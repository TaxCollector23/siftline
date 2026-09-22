import { createSign, createVerify } from "node:crypto";
import { consumeRateLimit, hashApiKeySecret, inspectRateLimit, parseApiKey, safeHashEqual, type RateLimitResult } from "../../packages/api/src/index.js";

type FirestoreValue = { stringValue?: string; integerValue?: string; timestampValue?: string; booleanValue?: boolean };
type FirestoreDocument = { name: string; fields?: Record<string, FirestoreValue>; updateTime?: string };
type KeyRecord = { id: string; userId: string; name: string; hash: string; lastFour: string; status: string; rpmLimit: number; monthlyLimit: number; minuteKey?: string; minuteCount?: number; monthKey?: string; monthCount?: number; createdAt?: string; lastUsedAt?: string };
export type AuthorizedKey = { id: string; userId: string; name: string; lastFour: string; rate: RateLimitResult };

let cachedAccessToken: { value: string; expiresAt: number } | undefined;
let cachedFirebaseCerts: { value: Record<string, string>; expiresAt: number } | undefined;
const devUsage = new Map<string, ReturnType<typeof consumeRateLimit>>();

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value }
function projectId(): string { return required("FIREBASE_PROJECT_ID") }
function firestoreBase(): string { return `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents` }
function b64url(value: string): string { return Buffer.from(value).toString("base64url") }

async function googleAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: required("FIREBASE_CLIENT_EMAIL"), scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const signature = signer.sign(required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n")).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }) });
  if (!response.ok) throw new Error("Firebase service account authentication failed");
  const result = await response.json() as { access_token: string; expires_in: number };
  cachedAccessToken = { value: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return result.access_token;
}

async function firebaseFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await googleAccessToken();
  return fetch(path.startsWith("http") ? path : `${firestoreBase()}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });
}

function text(field: FirestoreValue | undefined): string { return field?.stringValue ?? "" }
function integer(field: FirestoreValue | undefined): number { return Number(field?.integerValue ?? 0) }
function decodeKey(document: FirestoreDocument): KeyRecord {
  const fields = document.fields ?? {};
  return { id: document.name.split("/").pop() ?? "", userId: text(fields.userId), name: text(fields.name), hash: text(fields.hash), lastFour: text(fields.lastFour), status: text(fields.status), rpmLimit: integer(fields.rpmLimit), monthlyLimit: integer(fields.monthlyLimit), minuteKey: text(fields.minuteKey), minuteCount: integer(fields.minuteCount), monthKey: text(fields.monthKey), monthCount: integer(fields.monthCount), createdAt: fields.createdAt?.timestampValue, lastUsedAt: fields.lastUsedAt?.timestampValue };
}

function encodeKey(record: Partial<KeyRecord>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || key === "id") continue;
    if (typeof value === "number") fields[key] = { integerValue: String(value) };
    else if (key.endsWith("At")) fields[key] = { timestampValue: value };
    else fields[key] = { stringValue: value };
  }
  return fields;
}

async function rollback(transaction: string): Promise<void> {
  await firebaseFetch(`https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents:rollback`, { method: "POST", body: JSON.stringify({ transaction }) }).catch(() => undefined);
}

export async function authorizeApiKey(value: string, options: { consume?: boolean } = {}): Promise<AuthorizedKey> {
  const consume = options.consume ?? true;
  const devKeys = (process.env.SIFTLINE_DEV_API_KEYS ?? "").split(",").map((key) => key.trim()).filter(Boolean);
  if (devKeys.includes(value)) {
    const current = devUsage.get(value) ?? {};
    const rate = consume ? consumeRateLimit(current) : inspectRateLimit(current);
    if (consume && !rate.allowed) throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429, rate });
    if (consume) devUsage.set(value, rate);
    return { id: "dev", userId: "development", name: "Development key", lastFour: value.slice(-4), rate };
  }
  const parsed = parseApiKey(value); if (!parsed) throw Object.assign(new Error("Invalid API key"), { statusCode: 401 });
  const pepper = required("SIFTLINE_KEY_PEPPER");
  if (!consume) {
    const response = await firebaseFetch(`/apiKeys/${encodeURIComponent(parsed.id)}`);
    if (!response.ok) throw Object.assign(new Error("Invalid API key"), { statusCode: 401 });
    const document = await response.json() as FirestoreDocument;
    const record = decodeKey(document);
    if (record.status !== "active" || !safeHashEqual(record.hash, hashApiKeySecret(parsed.secret, pepper))) throw Object.assign(new Error("Invalid API key"), { statusCode: 401 });
    return { id: record.id, userId: record.userId, name: record.name, lastFour: record.lastFour, rate: inspectRateLimit(record, { rpm: record.rpmLimit, monthly: record.monthlyLimit }) };
  }
  const begin = await firebaseFetch(`https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents:beginTransaction`, { method: "POST", body: JSON.stringify({ options: { readWrite: {} } }) });
  if (!begin.ok) throw new Error("Could not start rate-limit transaction");
  const { transaction } = await begin.json() as { transaction: string };
  const documentResponse = await firebaseFetch(`/apiKeys/${encodeURIComponent(parsed.id)}?transaction=${encodeURIComponent(transaction)}`);
  if (!documentResponse.ok) { await rollback(transaction); throw Object.assign(new Error("Invalid API key"), { statusCode: 401 }) }
  const document = await documentResponse.json() as FirestoreDocument;
  const record = decodeKey(document);
  const expected = hashApiKeySecret(parsed.secret, pepper);
  if (record.status !== "active" || !safeHashEqual(record.hash, expected)) { await rollback(transaction); throw Object.assign(new Error("Invalid API key"), { statusCode: 401 }) }
  const rate = consumeRateLimit(record, { rpm: record.rpmLimit, monthly: record.monthlyLimit });
  if (!rate.allowed) { await rollback(transaction); throw Object.assign(new Error(rate.reason === "minute" ? "Per-minute rate limit exceeded" : "Monthly request limit exceeded"), { statusCode: 429, rate }) }
  const updated = { minuteKey: rate.minuteKey, minuteCount: rate.minuteCount, monthKey: rate.monthKey, monthCount: rate.monthCount, lastUsedAt: new Date().toISOString() };
  const commit = await firebaseFetch(`https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents:commit`, { method: "POST", body: JSON.stringify({ transaction, writes: [{ update: { name: document.name, fields: encodeKey(updated) }, updateMask: { fieldPaths: Object.keys(updated) }, currentDocument: { updateTime: document.updateTime } }] }) });
  if (!commit.ok) throw new Error("Could not record API usage");
  return { id: record.id, userId: record.userId, name: record.name, lastFour: record.lastFour, rate };
}

async function firebaseCertificates(): Promise<Record<string, string>> {
  if (cachedFirebaseCerts && cachedFirebaseCerts.expiresAt > Date.now()) return cachedFirebaseCerts.value;
  const response = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new Error("Could not fetch Firebase signing certificates");
  const value = await response.json() as Record<string, string>;
  const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 300);
  cachedFirebaseCerts = { value, expiresAt: Date.now() + maxAge * 1000 };
  return value;
}

export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string; email?: string }> {
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw Object.assign(new Error("Invalid identity token"), { statusCode: 401 });
  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as { alg?: string; kid?: string };
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as { sub?: string; aud?: string; iss?: string; exp?: number; email?: string };
  const cert = header.kid ? (await firebaseCertificates())[header.kid] : undefined;
  const verifier = createVerify("RSA-SHA256"); verifier.update(`${headerPart}.${payloadPart}`); verifier.end();
  const valid = header.alg === "RS256" && cert && verifier.verify(cert, Buffer.from(signaturePart, "base64url"));
  if (!valid || !payload.sub || payload.aud !== projectId() || payload.iss !== `https://securetoken.google.com/${projectId()}` || (payload.exp ?? 0) * 1000 < Date.now()) throw Object.assign(new Error("Invalid identity token"), { statusCode: 401 });
  return { uid: payload.sub, email: payload.email };
}

export async function listUserKeys(userId: string): Promise<KeyRecord[]> {
  const response = await firebaseFetch(`https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "apiKeys" }],
        where: { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: userId } } }
      }
    })
  });
  if (!response.ok) throw new Error("Could not list API keys");
  const rows = await response.json() as Array<{ document?: FirestoreDocument }>;
  return rows.flatMap((row) => row.document ? [decodeKey(row.document)] : []).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function createUserKey(record: KeyRecord): Promise<void> {
  const response = await firebaseFetch(`/apiKeys?documentId=${encodeURIComponent(record.id)}`, { method: "POST", body: JSON.stringify({ fields: encodeKey(record) }) });
  if (!response.ok) throw new Error("Could not create API key");
}

export async function revokeUserKey(id: string, userId: string): Promise<void> {
  const response = await firebaseFetch(`/apiKeys/${encodeURIComponent(id)}`);
  if (!response.ok) throw Object.assign(new Error("API key not found"), { statusCode: 404 });
  const document = await response.json() as FirestoreDocument;
  const record = decodeKey(document);
  if (record.userId !== userId) throw Object.assign(new Error("API key not found"), { statusCode: 404 });
  const update = await firebaseFetch(`/apiKeys/${encodeURIComponent(id)}?updateMask.fieldPaths=status`, { method: "PATCH", body: JSON.stringify({ fields: { status: { stringValue: "revoked" } } }) });
  if (!update.ok) throw new Error("Could not revoke API key");
}
