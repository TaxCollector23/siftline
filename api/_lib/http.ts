import { randomUUID } from "node:crypto";

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

function allowedOrigin(origin: string): boolean {
  try {
    const value = new URL(origin);
    if (value.protocol === "https:" && ["siftline-omega.vercel.app", "cutdex.vercel.app"].includes(value.hostname)) return true;
    return value.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(value.hostname);
  } catch {
    return false;
  }
}

export function prepareResponse(req: ApiRequest, res: ApiResponse): boolean {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  if (allowedOrigin(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method === "OPTIONS") { res.status(204).end(); return false }
  return true;
}

export function requestId(req: ApiRequest): string {
  const existing = req.headers["x-vercel-id"];
  return typeof existing === "string" ? existing : randomUUID();
}

export function bearerToken(req: ApiRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  return header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

export function bodySizeOkay(body: unknown, maxBytes = 64_000): boolean {
  try { return Buffer.byteLength(JSON.stringify(body ?? null), "utf8") <= maxBytes } catch { return false }
}

export function publicErrorMessage(error: unknown, status: number, fallback: string): string {
  return status >= 500 ? fallback : error instanceof Error ? error.message : fallback;
}
