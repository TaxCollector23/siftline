export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(value: unknown): void;
  setHeader(name: string, value: string | string[]): void;
  end(): void;
}

export function prepareResponse(req: ApiRequest, res: ApiResponse): boolean {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const allowed = origin === "https://siftline-omega.vercel.app" || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
  if (allowed) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") { res.status(204).end(); return false }
  return true;
}

export function requestId(req: ApiRequest): string {
  const existing = req.headers["x-vercel-id"];
  return typeof existing === "string" ? existing : crypto.randomUUID();
}

export function bearerToken(req: ApiRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

export function bodySizeOkay(body: unknown, maxBytes = 64_000): boolean {
  try { return Buffer.byteLength(JSON.stringify(body ?? null), "utf8") <= maxBytes } catch { return false }
}
