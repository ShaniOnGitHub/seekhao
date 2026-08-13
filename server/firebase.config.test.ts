import { describe, expect, it } from "vitest";

describe("firebase browser configuration", () => {
  it("accepts the configured Firebase Web API key", async () => {
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    expect(apiKey, "VITE_FIREBASE_API_KEY must be configured").toBeTruthy();

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey!)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "seekho-configuration-probe" }),
    });
    const body = await response.json() as { error?: { message?: string } };
    // An intentionally invalid ID token must be rejected as INVALID_ID_TOKEN.
    // API_KEY_INVALID / PROJECT_NOT_FOUND proves that the supplied config is wrong.
    expect(body.error?.message).toBe("INVALID_ID_TOKEN");
  }, 15_000);
});
