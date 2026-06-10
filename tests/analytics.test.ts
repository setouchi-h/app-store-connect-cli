import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { AnalyticsService, decompressIfGzip, slugify } from "../src/appstore/analytics.js";
import { AppStoreConnectClient } from "../src/appstore/client.js";

interface RecordedCall {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body?: string;
}

function createService(
  handler: (url: URL, init?: RequestInit) => unknown,
  calls: RecordedCall[],
  reportsDir: string
): AnalyticsService {
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));

    calls.push({
      method: init?.method ?? "GET",
      url,
      headers: (init?.headers as Record<string, string>) ?? {},
      body: typeof init?.body === "string" ? init.body : undefined
    });

    const result = handler(url, init);

    if (Buffer.isBuffer(result)) {
      return new Response(new Uint8Array(result), { status: 200 });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const client = new AppStoreConnectClient({
    fetchImpl,
    tokenProvider: {
      getToken: async () => "test-token"
    }
  });

  return new AnalyticsService({ client, reportsDir });
}

describe("analytics", () => {
  it("slugifies report names for file names", () => {
    expect(slugify("App Store Discovery and Engagement")).toBe(
      "app-store-discovery-and-engagement"
    );
    expect(slugify("  Weird -- Name!! ")).toBe("weird-name");
  });

  it("decompresses gzip segments and passes through plain data", () => {
    const plain = Buffer.from("Date\tCounts\n2026-06-01\t3\n");

    expect(decompressIfGzip(gzipSync(plain))).toEqual(plain);
    expect(decompressIfGzip(plain)).toBe(plain);
  });

  it("reuses an existing report request instead of creating a duplicate", async () => {
    const calls: RecordedCall[] = [];
    const service = createService(
      (url) => {
        if (url.pathname === "/v1/apps/app-1/analyticsReportRequests") {
          return {
            data: [
              {
                id: "req-1",
                type: "analyticsReportRequests",
                attributes: { accessType: "ONGOING", stoppedDueToInactivity: false }
              }
            ]
          };
        }

        throw new Error(`Unexpected request: ${url}`);
      },
      calls,
      await mkdtemp(join(tmpdir(), "asc-analytics-"))
    );

    const result = await service.ensureReportRequest("app-1", "ONGOING");

    expect(result).toEqual({
      request: { id: "req-1", accessType: "ONGOING", stoppedDueToInactivity: false },
      created: false
    });
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("creates a report request when none exists", async () => {
    const calls: RecordedCall[] = [];
    const service = createService(
      (url, init) => {
        if (url.pathname === "/v1/apps/app-1/analyticsReportRequests") {
          return { data: [] };
        }

        if (url.pathname === "/v1/analyticsReportRequests" && init?.method === "POST") {
          return {
            data: {
              id: "req-9",
              type: "analyticsReportRequests",
              attributes: { accessType: "ONGOING", stoppedDueToInactivity: false }
            }
          };
        }

        throw new Error(`Unexpected request: ${url}`);
      },
      calls,
      await mkdtemp(join(tmpdir(), "asc-analytics-"))
    );

    const result = await service.ensureReportRequest("app-1", "ONGOING");

    expect(result.created).toBe(true);
    expect(result.request.id).toBe("req-9");

    const post = calls.find((call) => call.method === "POST");

    expect(post).toBeDefined();
    expect(JSON.parse(post!.body!)).toEqual({
      data: {
        type: "analyticsReportRequests",
        attributes: { accessType: "ONGOING" },
        relationships: {
          app: { data: { type: "apps", id: "app-1" } }
        }
      }
    });
  });

  it("fetches report segments across pagination and stores decompressed files", async () => {
    const reportRows = "Date\tTerritory\tCounts\n2026-06-01\tJP\t12\n";
    const gzipped = gzipSync(reportRows);
    const directory = await mkdtemp(join(tmpdir(), "asc-analytics-"));
    const calls: RecordedCall[] = [];
    const service = createService(
      (url) => {
        if (url.pathname === "/v1/apps/app-1/analyticsReportRequests") {
          return {
            data: [
              {
                id: "req-1",
                type: "analyticsReportRequests",
                attributes: { accessType: "ONGOING", stoppedDueToInactivity: false }
              }
            ]
          };
        }

        if (url.pathname === "/v1/analyticsReportRequests/req-1/reports") {
          if (url.searchParams.get("cursor") === "abc") {
            return {
              data: [
                {
                  id: "rep-1",
                  type: "analyticsReports",
                  attributes: {
                    name: "App Store Discovery and Engagement",
                    category: "APP_STORE_ENGAGEMENT"
                  }
                }
              ]
            };
          }

          return {
            data: [
              {
                id: "rep-0",
                type: "analyticsReports",
                attributes: { name: "App Downloads Standard", category: "APP_USAGE" }
              }
            ],
            links: {
              next: "https://api.appstoreconnect.apple.com/v1/analyticsReportRequests/req-1/reports?cursor=abc"
            }
          };
        }

        if (url.pathname === "/v1/analyticsReports/rep-1/instances") {
          return {
            data: [
              {
                id: "inst-2",
                type: "analyticsReportInstances",
                attributes: { granularity: "DAILY", processingDate: "2026-05-01" }
              },
              {
                id: "inst-1",
                type: "analyticsReportInstances",
                attributes: { granularity: "DAILY", processingDate: "2026-06-01" }
              }
            ]
          };
        }

        if (url.pathname === "/v1/analyticsReportInstances/inst-1/segments") {
          return {
            data: [
              {
                id: "seg-1",
                type: "analyticsReportSegments",
                attributes: {
                  url: "https://cdn.example.com/seg-1.gz",
                  checksum: "abc123",
                  sizeInBytes: gzipped.byteLength
                }
              }
            ]
          };
        }

        if (url.hostname === "cdn.example.com") {
          return gzipped;
        }

        throw new Error(`Unexpected request: ${url}`);
      },
      calls,
      directory
    );

    const result = await service.fetchReport({
      appId: "app-1",
      report: "App Store Discovery and Engagement",
      accessType: "ONGOING",
      granularity: "DAILY",
      from: "2026-06-01",
      to: "2026-06-07"
    });

    const expectedPath = join(
      directory,
      "analytics-app-store-discovery-and-engagement-daily-2026-06-01-1.tsv"
    );

    expect(result).toEqual({
      report: "App Store Discovery and Engagement",
      category: "APP_STORE_ENGAGEMENT",
      granularity: "DAILY",
      from: "2026-06-01",
      to: "2026-06-07",
      instances: 1,
      stoppedDueToInactivity: false,
      files: [
        {
          date: "2026-06-01",
          path: expectedPath,
          bytes: Buffer.byteLength(reportRows)
        }
      ]
    });
    await expect(readFile(expectedPath, "utf8")).resolves.toBe(reportRows);

    const instancesCall = calls.find(
      (call) => call.url.pathname === "/v1/analyticsReports/rep-1/instances"
    );

    expect(instancesCall!.url.searchParams.get("filter[granularity]")).toBe("DAILY");

    const segmentDownload = calls.find((call) => call.url.hostname === "cdn.example.com");

    expect(segmentDownload).toBeDefined();
    expect(segmentDownload!.headers["Authorization"]).toBeUndefined();

    const apiCalls = calls.filter((call) => call.url.hostname !== "cdn.example.com");

    expect(apiCalls.every((call) => call.headers["Authorization"] === "Bearer test-token")).toBe(
      true
    );
  });

  it("fails with an actionable error when no ONGOING request exists", async () => {
    const service = createService(
      () => ({ data: [] }),
      [],
      await mkdtemp(join(tmpdir(), "asc-analytics-"))
    );

    await expect(
      service.fetchReport({
        appId: "app-1",
        report: "App Store Discovery and Engagement",
        accessType: "ONGOING",
        granularity: "DAILY",
        from: "2026-06-01",
        to: "2026-06-07"
      })
    ).rejects.toMatchObject({
      code: "ASC_ANALYTICS_REQUEST_NOT_FOUND",
      exitCode: 2,
      details: {
        appId: "app-1",
        accessType: "ONGOING"
      }
    });
  });

  it("lists available report names when the requested report is unknown", async () => {
    const service = createService(
      (url) => {
        if (url.pathname === "/v1/apps/app-1/analyticsReportRequests") {
          return {
            data: [
              {
                id: "req-1",
                type: "analyticsReportRequests",
                attributes: { accessType: "ONGOING", stoppedDueToInactivity: false }
              }
            ]
          };
        }

        if (url.pathname === "/v1/analyticsReportRequests/req-1/reports") {
          return {
            data: [
              {
                id: "rep-0",
                type: "analyticsReports",
                attributes: { name: "App Downloads Standard", category: "APP_USAGE" }
              }
            ]
          };
        }

        throw new Error(`Unexpected request: ${url}`);
      },
      [],
      await mkdtemp(join(tmpdir(), "asc-analytics-"))
    );

    await expect(
      service.fetchReport({
        appId: "app-1",
        report: "No Such Report",
        accessType: "ONGOING",
        granularity: "DAILY",
        from: "2026-06-01",
        to: "2026-06-07"
      })
    ).rejects.toMatchObject({
      code: "ASC_ANALYTICS_REPORT_NOT_FOUND",
      details: {
        requested: "No Such Report",
        available: ["App Downloads Standard"]
      }
    });
  });

  it("recreates the report request when the existing one is stopped due to inactivity", async () => {
    const calls: RecordedCall[] = [];
    const service = createService(
      (url, init) => {
        if (url.pathname === "/v1/apps/app-1/analyticsReportRequests") {
          return {
            data: [
              {
                id: "req-stopped",
                type: "analyticsReportRequests",
                attributes: { accessType: "ONGOING", stoppedDueToInactivity: true }
              }
            ]
          };
        }

        if (url.pathname === "/v1/analyticsReportRequests" && init?.method === "POST") {
          return {
            data: {
              id: "req-new",
              type: "analyticsReportRequests",
              attributes: { accessType: "ONGOING", stoppedDueToInactivity: false }
            }
          };
        }

        throw new Error(`Unexpected request: ${url}`);
      },
      calls,
      await mkdtemp(join(tmpdir(), "asc-analytics-"))
    );

    const result = await service.ensureReportRequest("app-1", "ONGOING");

    expect(result.created).toBe(true);
    expect(result.request.id).toBe("req-new");
    expect(calls.some((call) => call.method === "POST")).toBe(true);
  });

  it("does not reuse a request with a different access type", async () => {
    const calls: RecordedCall[] = [];
    const service = createService(
      (url, init) => {
        if (url.pathname === "/v1/apps/app-1/analyticsReportRequests") {
          return {
            data: [
              {
                id: "req-snapshot",
                type: "analyticsReportRequests",
                attributes: { accessType: "ONE_TIME_SNAPSHOT", stoppedDueToInactivity: false }
              }
            ]
          };
        }

        if (url.pathname === "/v1/analyticsReportRequests" && init?.method === "POST") {
          return {
            data: {
              id: "req-ongoing",
              type: "analyticsReportRequests",
              attributes: { accessType: "ONGOING", stoppedDueToInactivity: false }
            }
          };
        }

        throw new Error(`Unexpected request: ${url}`);
      },
      calls,
      await mkdtemp(join(tmpdir(), "asc-analytics-"))
    );

    const result = await service.ensureReportRequest("app-1", "ONGOING");

    expect(result.created).toBe(true);
    expect(result.request.id).toBe("req-ongoing");

    const post = calls.find((call) => call.method === "POST");

    expect(JSON.parse(post!.body!).data.attributes).toEqual({ accessType: "ONGOING" });
  });

  it("prefers an active request over a stopped one and resolves snapshot requests", async () => {
    const service = createService(
      (url) => {
        if (url.pathname === "/v1/apps/app-1/analyticsReportRequests") {
          return {
            data: [
              {
                id: "req-stopped",
                type: "analyticsReportRequests",
                attributes: { accessType: "ONGOING", stoppedDueToInactivity: true }
              },
              {
                id: "req-active",
                type: "analyticsReportRequests",
                attributes: { accessType: "ONGOING", stoppedDueToInactivity: false }
              },
              {
                id: "req-snapshot",
                type: "analyticsReportRequests",
                attributes: { accessType: "ONE_TIME_SNAPSHOT", stoppedDueToInactivity: false }
              }
            ]
          };
        }

        throw new Error(`Unexpected request: ${url}`);
      },
      [],
      await mkdtemp(join(tmpdir(), "asc-analytics-"))
    );

    await expect(service.requireRequest("app-1", "ONGOING")).resolves.toMatchObject({
      id: "req-active",
      stoppedDueToInactivity: false
    });
    await expect(service.requireRequest("app-1", "ONE_TIME_SNAPSHOT")).resolves.toMatchObject({
      id: "req-snapshot"
    });
  });

  it("fetches weekly instances from a stopped request and flags the inactivity", async () => {
    const reportRows = "Date\tTerritory\tCounts\n2026-06-07\tJP\t99\n";
    const directory = await mkdtemp(join(tmpdir(), "asc-analytics-"));
    const calls: RecordedCall[] = [];
    const service = createService(
      (url) => {
        if (url.pathname === "/v1/apps/app-1/analyticsReportRequests") {
          return {
            data: [
              {
                id: "req-1",
                type: "analyticsReportRequests",
                attributes: { accessType: "ONGOING", stoppedDueToInactivity: true }
              }
            ]
          };
        }

        if (url.pathname === "/v1/analyticsReportRequests/req-1/reports") {
          return {
            data: [
              {
                id: "rep-1",
                type: "analyticsReports",
                attributes: { name: "App Downloads Standard", category: "APP_USAGE" }
              }
            ]
          };
        }

        if (url.pathname === "/v1/analyticsReports/rep-1/instances") {
          return {
            data: [
              {
                id: "inst-1",
                type: "analyticsReportInstances",
                attributes: { granularity: "WEEKLY", processingDate: "2026-06-07" }
              }
            ]
          };
        }

        if (url.pathname === "/v1/analyticsReportInstances/inst-1/segments") {
          return {
            data: [
              {
                id: "seg-1",
                type: "analyticsReportSegments",
                attributes: { url: "https://cdn.example.com/seg-1.gz" }
              }
            ]
          };
        }

        if (url.hostname === "cdn.example.com") {
          return gzipSync(reportRows);
        }

        throw new Error(`Unexpected request: ${url}`);
      },
      calls,
      directory
    );

    const result = await service.fetchReport({
      appId: "app-1",
      report: "App Downloads Standard",
      accessType: "ONGOING",
      granularity: "WEEKLY",
      from: "2026-06-01",
      to: "2026-06-07"
    });

    expect(result.stoppedDueToInactivity).toBe(true);
    expect(result.files[0]!.path).toBe(
      join(directory, "analytics-app-downloads-standard-weekly-2026-06-07-1.tsv")
    );

    const instancesCall = calls.find(
      (call) => call.url.pathname === "/v1/analyticsReports/rep-1/instances"
    );

    expect(instancesCall!.url.searchParams.get("filter[granularity]")).toBe("WEEKLY");
  });
});
