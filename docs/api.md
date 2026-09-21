# Hosted API

Cutdex is designed to run as middleware immediately before a read-only tool call. It returns an optimized request; the caller remains responsible for executing that request against its database, API, or MCP tool.

## Authentication

Send a Cutdex API key as a bearer token:

```http
Authorization: Bearer sift_live_...
```

Keys are displayed once. The service stores a peppered SHA-256 hash, not the original secret. Accounts can have three active keys. The default quota is 60 requests per minute and 10,000 requests per month, enforced per key with a Firestore transaction.

## Optimize

```http
POST /api/v1/optimize
Content-Type: application/json
Authorization: Bearer sift_live_...
```

```json
{
  "task": "Find the five most recent failed orders",
  "tool": { "name": "database.query", "kind": "READ", "readOnly": true },
  "request": { "query": "SELECT * FROM orders" },
  "mode": "conservative"
}
```

The response includes `originalRequest`, `optimizedRequest`, independent applied/skipped passes, confidence, safety, explanation, request ID, and remaining quota. Because the optimizer does not execute or observe the source tool, transformed calls report savings as `not_measured`; adapters should record before/after result bytes or provider usage. Writes and unknown operations pass through unchanged.

For an application that owns the source-tool executor, use the SDK wrapper so the model sees only the compacted result without an additional agent round-trip:

```ts
import { executeWithCutdex } from "@cutdex/core";

const run = await executeWithCutdex(input, (request) => database.query(request.query));
return run.response;
```

The wrapper only projects fields explicitly named by the task and applies an explicit row limit. Ambiguous results are preserved. It reports serialized-byte savings; provider token savings must still be measured from paired usage traces.

## Account endpoints

- `GET /api/v1/keys` lists key metadata for a Firebase-authenticated user.
- `POST /api/v1/keys` creates a key and returns the secret once.
- `DELETE /api/v1/keys?id=...` revokes a key.
- `GET /api/v1/auth/verify` validates a Cutdex key and returns quota information.
- `GET /api/v1/health` reports service readiness without exposing credentials.

The account endpoints require a Firebase ID token. Firestore should deny direct client access; the server uses a service account.
