import { describe, expect, it } from "vitest";
import { AppStoreConnectClient } from "../src/appstore/client.js";

describe("AppStoreConnectClient", () => {
  it("allows authenticated absolute API URLs on the configured origin", async () => {
    let request:
      | {
          url: URL;
          headers: Record<string, string>;
        }
      | undefined;
    const client = new AppStoreConnectClient({
      fetchImpl: (async (input: unknown, init?: RequestInit) => {
        request = {
          url: new URL(String(input)),
          headers: (init?.headers as Record<string, string>) ?? {}
        };

        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }) as typeof fetch,
      tokenProvider: {
        getToken: async () => "test-token"
      }
    });

    await client.requestRaw("https://api.appstoreconnect.apple.com/v1/apps?cursor=abc", {
      query: { limit: "1" }
    });

    expect(request!.url.origin).toBe("https://api.appstoreconnect.apple.com");
    expect(request!.url.pathname).toBe("/v1/apps");
    expect(request!.url.searchParams.get("cursor")).toBe("abc");
    expect(request!.url.searchParams.get("limit")).toBe("1");
    expect(request!.headers["Authorization"]).toBe("Bearer test-token");
  });

  it("returns non-2xx raw API responses without consuming the body", async () => {
    const errorBody = "x".repeat(5_000);
    const client = new AppStoreConnectClient({
      fetchImpl: (async () =>
        new Response(errorBody, {
          status: 422,
          headers: { "Content-Type": "application/json" }
        })) as typeof fetch,
      tokenProvider: {
        getToken: async () => "test-token"
      }
    });

    const response = await client.requestRaw("/v1/apps");

    expect(response.status).toBe(422);
    await expect(response.text()).resolves.toBe(errorBody);
  });

  it("rejects off-origin absolute API URLs before creating a token or fetching", async () => {
    let tokenRequests = 0;
    let fetchRequests = 0;
    const client = new AppStoreConnectClient({
      fetchImpl: (async () => {
        fetchRequests += 1;
        return new Response("unexpected", { status: 200 });
      }) as typeof fetch,
      tokenProvider: {
        getToken: async () => {
          tokenRequests += 1;
          return "test-token";
        }
      }
    });

    await expect(
      client.requestRaw("https://api.appstoreconnect.apple.com.evil.test/v1/apps")
    ).rejects.toMatchObject({
      code: "ASC_API_INVALID_URL",
      exitCode: 2,
      details: {
        requestedOrigin: "https://api.appstoreconnect.apple.com.evil.test",
        allowedOrigin: "https://api.appstoreconnect.apple.com"
      }
    });
    expect(tokenRequests).toBe(0);
    expect(fetchRequests).toBe(0);
  });
});
