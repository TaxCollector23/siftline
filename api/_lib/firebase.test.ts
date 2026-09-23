import { describe, expect, it } from "vitest";
import { verifyFirebaseIdToken } from "./firebase.js";

describe("Firebase identity boundary", () => {
  it("rejects malformed tokens as authentication failures", async () => {
    await expect(verifyFirebaseIdToken("not-a-jwt")).rejects.toMatchObject({ statusCode: 401 });
    await expect(verifyFirebaseIdToken("a.b.c")).rejects.toMatchObject({ statusCode: 401 });
  });
});
