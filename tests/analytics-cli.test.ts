import { generateKeyPairSync } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function createWriters() {
  let stdout = "";
  let stderr = "";

  return {
    stdout: {
      write(chunk: string) {
        stdout += chunk;
      }
    },
    stderr: {
      write(chunk: string) {
        stderr += chunk;
      }
    },
    get stdoutText() {
      return stdout;
    },
    get stderrText() {
      return stderr;
    }
  };
}

async function createEnv(): Promise<NodeJS.ProcessEnv> {
  return {
    ASC_ISSUER_ID: "issuer-1",
    ASC_KEY_ID: "key-1",
    ASC_PRIVATE_KEY: PRIVATE_KEY_PEM,
    ASC_APP_ID: "app-1",
    ASC_REPORTS_DIR: await mkdtemp(join(tmpdir(), "asc-analytics-cli-"))
  };
}

function createFetchStub(handler: (url: URL, init?: RequestInit) => unknown): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const result = handler(url, init);

    if (Buffer.isBuffer(result)) {
      return new Response(new Uint8Array(result), { status: 200 });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
}

function happyPathHandler(options: { stopped?: boolean; instances?: boolean } = {}) {
  return (url: URL) => {
    if (url.pathname === "/v1/apps/app-1/analyticsReportRequests") {
      return {
        data: [
          {
            id: "req-1",
            type: "analyticsReportRequests",
            attributes: {
              accessType: "ONGOING",
              stoppedDueToInactivity: options.stopped ?? false
            }
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
      if (options.instances === false) {
        return { data: [] };
      }

      return {
        data: [
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
            attributes: { url: "https://cdn.example.com/seg-1.gz" }
          }
        ]
      };
    }

    if (url.hostname === "cdn.example.com") {
      return gzipSync("Date\tCounts\n2026-06-01\t12\n");
    }

    throw new Error(`Unexpected request: ${url}`);
  };
}

describe("asc analytics CLI", () => {
  it("fetches a report end to end, emitting single-line JSON on stdout and nothing on stderr", async () => {
    const io = createWriters();
    const exitCode = await runCli(
      [
        "node",
        "asc",
        "analytics",
        "fetch",
        "--report",
        "App Downloads Standard",
        "--from",
        "2026-06-01",
        "--to",
        "2026-06-07",
        "--json"
      ],
      { ...io, env: await createEnv(), fetchImpl: createFetchStub(happyPathHandler()) }
    );

    expect(exitCode).toBe(0);
    expect(io.stderrText).toBe("");
    expect(io.stdoutText.endsWith("\n")).toBe(true);
    expect(io.stdoutText.trim()).not.toContain("\n");
    expect(JSON.parse(io.stdoutText)).toMatchObject({
      report: "App Downloads Standard",
      granularity: "DAILY",
      stoppedDueToInactivity: false,
      files: [{ date: "2026-06-01" }]
    });
  });

  it("warns on stderr about stopped requests and empty ranges while exiting 0", async () => {
    const io = createWriters();
    const exitCode = await runCli(
      [
        "node",
        "asc",
        "analytics",
        "fetch",
        "--report",
        "App Downloads Standard",
        "--from",
        "2026-06-01",
        "--to",
        "2026-06-07",
        "--json"
      ],
      {
        ...io,
        env: await createEnv(),
        fetchImpl: createFetchStub(happyPathHandler({ stopped: true, instances: false }))
      }
    );

    expect(exitCode).toBe(0);
    expect(io.stderrText).toContain("stopped generating");
    expect(io.stderrText).toContain("no analytics report instances");
    expect(JSON.parse(io.stdoutText)).toMatchObject({
      stoppedDueToInactivity: true,
      files: []
    });
  });

  it("lists report requests through the CLI using the ASC_APP_ID default", async () => {
    const io = createWriters();
    const exitCode = await runCli(["node", "asc", "analytics", "request", "list", "--json"], {
      ...io,
      env: await createEnv(),
      fetchImpl: createFetchStub(happyPathHandler())
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(io.stdoutText)).toEqual({
      requests: [{ id: "req-1", accessType: "ONGOING", stoppedDueToInactivity: false }]
    });
  });

  it("fails with ASC_APP_ID_REQUIRED when neither --app nor ASC_APP_ID is provided", async () => {
    const io = createWriters();
    const env = await createEnv();

    delete env["ASC_APP_ID"];

    const exitCode = await runCli(["node", "asc", "analytics", "request", "list", "--json"], {
      ...io,
      env
    });

    expect(exitCode).toBe(2);
    expect(io.stdoutText).toBe("");
    expect(JSON.parse(io.stderrText)).toMatchObject({
      ok: false,
      error: { code: "ASC_APP_ID_REQUIRED" }
    });
  });

  it("validates fetch options before loading credentials", async () => {
    const io = createWriters();
    const exitCode = await runCli(
      [
        "node",
        "asc",
        "analytics",
        "fetch",
        "--app",
        "app-1",
        "--report",
        "App Downloads Standard",
        "--from",
        "not-a-date",
        "--to",
        "2026-06-07",
        "--json"
      ],
      { ...io, env: {} }
    );

    expect(exitCode).toBe(2);
    expect(io.stdoutText).toBe("");
    expect(JSON.parse(io.stderrText)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
  });

  it("rejects a date range where from is after to", async () => {
    const io = createWriters();
    const exitCode = await runCli(
      [
        "node",
        "asc",
        "analytics",
        "fetch",
        "--app",
        "app-1",
        "--report",
        "App Downloads Standard",
        "--from",
        "2026-06-07",
        "--to",
        "2026-06-01",
        "--json"
      ],
      { ...io, env: {} }
    );

    expect(exitCode).toBe(2);
    expect(io.stderrText).toContain("must be on or after");
  });

  it("rejects an invalid granularity", async () => {
    const io = createWriters();
    const exitCode = await runCli(
      [
        "node",
        "asc",
        "analytics",
        "fetch",
        "--app",
        "app-1",
        "--report",
        "App Downloads Standard",
        "--granularity",
        "HOURLY",
        "--from",
        "2026-06-01",
        "--to",
        "2026-06-07",
        "--json"
      ],
      { ...io, env: {} }
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stderrText)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
  });

  it("rejects an invalid access type on request ensure", async () => {
    const io = createWriters();
    const exitCode = await runCli(
      [
        "node",
        "asc",
        "analytics",
        "request",
        "ensure",
        "--app",
        "app-1",
        "--access-type",
        "BOGUS",
        "--json"
      ],
      { ...io, env: {} }
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stderrText)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
  });
});
