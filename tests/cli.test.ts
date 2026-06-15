import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function createAuthEnv(): NodeJS.ProcessEnv {
  return {
    ASC_ISSUER_ID: "issuer-1",
    ASC_KEY_ID: "key-1",
    ASC_PRIVATE_KEY: PRIVATE_KEY_PEM
  };
}

describe("asc CLI", () => {
  it("prints root help without App Store Connect credentials", async () => {
    const io = createWriters();
    const exitCode = await runCli(["node", "asc", "--help"], io);

    expect(exitCode).toBe(0);
    expect(io.stdoutText).toContain("Usage: asc");
    expect(io.stdoutText).toContain("api");
    expect(io.stdoutText).toContain("reports");
    expect(io.stderrText).toBe("");
  });

  it("accepts a leading script argument separator from pnpm/tsx", async () => {
    const io = createWriters();
    const exitCode = await runCli(["node", "asc", "--", "--help"], io);

    expect(exitCode).toBe(0);
    expect(io.stdoutText).toContain("Usage: asc");
    expect(io.stderrText).toBe("");
  });

  it("prints auth token help without App Store Connect credentials", async () => {
    const io = createWriters();
    const exitCode = await runCli(["node", "asc", "auth", "token", "--help"], io);

    expect(exitCode).toBe(0);
    expect(io.stdoutText).toContain("Generate an App Store Connect JWT");
    expect(io.stdoutText).toContain("--json");
    expect(io.stderrText).toBe("");
  });

  it("lists supported reports without App Store Connect credentials", async () => {
    const io = createWriters();
    const exitCode = await runCli(["node", "asc", "reports", "list", "--json"], io);

    expect(exitCode).toBe(0);
    expect(JSON.parse(io.stdoutText)).toMatchObject({
      reports: [
        {
          id: "sales-summary-daily",
          requiresVendorNumber: true
        }
      ]
    });
    expect(io.stderrText).toBe("");
  });

  it("validates report fetch dates before loading credentials", async () => {
    const io = createWriters();
    const exitCode = await runCli(
      [
        "node",
        "asc",
        "reports",
        "fetch",
        "--from",
        "not-a-date",
        "--to",
        "2026-01-02",
        "--json"
      ],
      io
    );

    expect(exitCode).toBe(2);
    expect(io.stdoutText).toBe("");
    expect(JSON.parse(io.stderrText)).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED"
      }
    });
  });

  it("passes through authenticated API GET requests", async () => {
    const io = createWriters();
    let request:
      | {
          url: URL;
          headers: Record<string, string>;
        }
      | undefined;
    const fetchImpl = (async (input: unknown, init?: RequestInit) => {
      request = {
        url: new URL(String(input)),
        headers: (init?.headers as Record<string, string>) ?? {}
      };

      return new Response(
        JSON.stringify({
          data: [{ id: "app-1", type: "apps" }]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }) as typeof fetch;

    const exitCode = await runCli(
      [
        "node",
        "asc",
        "api",
        "get",
        "/v1/apps",
        "--query",
        "limit=1",
        "--query",
        "filter[name]=Example",
        "--json"
      ],
      { ...io, env: createAuthEnv(), fetchImpl }
    );

    expect(exitCode).toBe(0);
    expect(io.stderrText).toBe("");
    expect(JSON.parse(io.stdoutText)).toEqual({
      data: [{ id: "app-1", type: "apps" }]
    });
    expect(request!.url.pathname).toBe("/v1/apps");
    expect(request!.url.searchParams.get("limit")).toBe("1");
    expect(request!.url.searchParams.get("filter[name]")).toBe("Example");
    expect(request!.headers["Accept"]).toBe("application/json");
    expect(request!.headers["Authorization"]).toMatch(/^Bearer /);
  });

  it("only shows API body options for methods that support request bodies", async () => {
    for (const method of ["get", "delete"]) {
      const io = createWriters();
      const exitCode = await runCli(["node", "asc", "api", method, "--help"], io);

      expect(exitCode).toBe(0);
      expect(io.stdoutText).not.toContain("--body");
    }

    for (const method of ["post", "patch"]) {
      const io = createWriters();
      const exitCode = await runCli(["node", "asc", "api", method, "--help"], io);

      expect(exitCode).toBe(0);
      expect(io.stdoutText).toContain("--body <json-or-@file>");
    }
  });

  it("rejects API GET and DELETE request bodies before fetching", async () => {
    for (const [command, method] of [
      ["get", "GET"],
      ["delete", "DELETE"]
    ] as const) {
      const io = createWriters();
      let fetchRequests = 0;
      const fetchImpl = (async () => {
        fetchRequests += 1;
        return new Response("unexpected", { status: 200 });
      }) as typeof fetch;

      const exitCode = await runCli(
        [
          "node",
          "asc",
          "api",
          command,
          "/v1/apps",
          "--body",
          "{}",
          "--json"
        ],
        { ...io, env: createAuthEnv(), fetchImpl }
      );

      expect(exitCode).toBe(2);
      expect(fetchRequests).toBe(0);
      expect(io.stdoutText).toBe("");
      expect(JSON.parse(io.stderrText)).toMatchObject({
        ok: false,
        error: {
          code: "ASC_API_UNSUPPORTED_BODY",
          message: "Request bodies are only supported for POST and PATCH API methods.",
          details: {
            method
          }
        }
      });
    }
  });

  it("rejects off-origin absolute API URLs before fetching", async () => {
    const io = createWriters();
    let fetchRequests = 0;
    const fetchImpl = (async () => {
      fetchRequests += 1;
      return new Response("unexpected", { status: 200 });
    }) as typeof fetch;

    const exitCode = await runCli(
      [
        "node",
        "asc",
        "api",
        "get",
        "https://api.appstoreconnect.apple.com.evil.test/v1/apps",
        "--json"
      ],
      { ...io, env: createAuthEnv(), fetchImpl }
    );

    expect(exitCode).toBe(2);
    expect(fetchRequests).toBe(0);
    expect(io.stdoutText).toBe("");
    expect(JSON.parse(io.stderrText)).toMatchObject({
      ok: false,
      error: {
        code: "ASC_API_INVALID_URL",
        details: {
          requestedOrigin: "https://api.appstoreconnect.apple.com.evil.test",
          allowedOrigin: "https://api.appstoreconnect.apple.com"
        }
      }
    });
  });

  it("passes through authenticated API POST requests with JSON bodies", async () => {
    const io = createWriters();
    let request:
      | {
          method: string;
          body?: string;
          headers: Record<string, string>;
        }
      | undefined;
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      request = {
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : undefined,
        headers: (init?.headers as Record<string, string>) ?? {}
      };

      return new Response(
        JSON.stringify({
          data: { id: "req-1", type: "analyticsReportRequests" }
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" }
        }
      );
    }) as typeof fetch;

    const exitCode = await runCli(
      [
        "node",
        "asc",
        "api",
        "post",
        "/v1/analyticsReportRequests",
        "--header",
        "X-Test: yes",
        "--body",
        '{"data":{"type":"analyticsReportRequests"}}',
        "--json"
      ],
      { ...io, env: createAuthEnv(), fetchImpl }
    );

    expect(exitCode).toBe(0);
    expect(request).toMatchObject({
      method: "POST",
      body: '{"data":{"type":"analyticsReportRequests"}}'
    });
    expect(request!.headers["Content-Type"]).toBe("application/json");
    expect(request!.headers["X-Test"]).toBe("yes");
    expect(JSON.parse(io.stdoutText)).toEqual({
      data: { id: "req-1", type: "analyticsReportRequests" }
    });
  });

  it("reports missing API body files as invalid request bodies", async () => {
    const io = createWriters();
    const directory = await mkdtemp(join(tmpdir(), "asc-api-body-"));
    const missingPath = join(directory, "missing.json");

    const exitCode = await runCli(
      [
        "node",
        "asc",
        "api",
        "post",
        "/v1/analyticsReportRequests",
        "--body",
        `@${missingPath}`,
        "--json"
      ],
      io
    );

    expect(exitCode).toBe(2);
    expect(io.stdoutText).toBe("");
    expect(JSON.parse(io.stderrText)).toMatchObject({
      ok: false,
      error: {
        code: "ASC_API_INVALID_BODY",
        message: "Request body file could not be read.",
        details: {
          path: missingPath
        }
      }
    });
  });

  it("falls back to raw API response output when JSON response bodies are malformed", async () => {
    const io = createWriters();
    const fetchImpl = (async () =>
      new Response('{"data":', {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch;

    const exitCode = await runCli(
      ["node", "asc", "api", "get", "/v1/apps", "--json"],
      { ...io, env: createAuthEnv(), fetchImpl }
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(io.stdoutText)).toEqual({
      status: 200,
      contentType: "application/json",
      body: '{"data":'
    });
  });

  it.each([
    {
      name: "204 responses",
      response: new Response(null, { status: 204 })
    },
    {
      name: "empty response bodies",
      response: new Response("  \n", {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    }
  ])("emits status-only output for $name", async ({ response }) => {
    const io = createWriters();
    const fetchImpl = (async () => response) as typeof fetch;

    const exitCode = await runCli(
      ["node", "asc", "api", "get", "/v1/apps", "--json"],
      { ...io, env: createAuthEnv(), fetchImpl }
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(io.stdoutText)).toEqual({ status: response.status });
    expect(io.stderrText).toBe("");
  });

  it("emits status, content type, and body for non-JSON API responses", async () => {
    const io = createWriters();
    const fetchImpl = (async () =>
      new Response("plain response", {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      })) as typeof fetch;

    const exitCode = await runCli(
      ["node", "asc", "api", "get", "/v1/apps", "--json"],
      { ...io, env: createAuthEnv(), fetchImpl }
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(io.stdoutText)).toEqual({
      status: 200,
      contentType: "text/plain",
      body: "plain response"
    });
    expect(io.stderrText).toBe("");
  });

  it("emits non-2xx API response bodies on stdout before exiting non-zero", async () => {
    const io = createWriters();
    const detail = "invalid ".repeat(700);
    const payload = {
      errors: [
        {
          status: "422",
          code: "ENTITY_ERROR.ATTRIBUTE.INVALID",
          detail
        }
      ]
    };
    const fetchImpl = (async () =>
      new Response(JSON.stringify(payload), {
        status: 422,
        statusText: "Unprocessable Entity",
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch;

    const exitCode = await runCli(
      ["node", "asc", "api", "post", "/v1/analyticsReportRequests", "--body", "{}", "--json"],
      { ...io, env: createAuthEnv(), fetchImpl }
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stdoutText)).toEqual(payload);
    expect(io.stdoutText).toContain(detail);
    expect(JSON.parse(io.stderrText)).toMatchObject({
      ok: false,
      error: {
        code: "ASC_API_REQUEST_FAILED",
        message: "App Store Connect API request failed with HTTP 422.",
        details: {
          status: 422,
          statusText: "Unprocessable Entity",
          hint: "The full response body was emitted on stdout."
        }
      }
    });
    expect(JSON.parse(io.stderrText).error.details.body).toBeUndefined();
  });

  it("emits non-2xx API download response bodies on stdout without writing the output file", async () => {
    const io = createWriters();
    const directory = await mkdtemp(join(tmpdir(), "asc-api-download-error-"));
    const outputPath = join(directory, "report.tsv");
    const payload = {
      errors: [
        {
          status: "409",
          code: "STATE_ERROR",
          detail: "The report is not ready."
        }
      ]
    };
    const fetchImpl = (async () =>
      new Response(JSON.stringify(payload), {
        status: 409,
        statusText: "Conflict",
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch;

    const exitCode = await runCli(
      ["node", "asc", "api", "download", "/v1/salesReports", "--out", outputPath, "--json"],
      { ...io, env: createAuthEnv(), fetchImpl }
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stdoutText)).toEqual(payload);
    await expect(readFile(outputPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("downloads raw API responses to a file", async () => {
    const io = createWriters();
    const directory = await mkdtemp(join(tmpdir(), "asc-api-download-"));
    const outputPath = join(directory, "report.tsv");
    const fetchImpl = (async () =>
      new Response("Date\tUnits\n2026-06-01\t2\n", {
        status: 200,
        headers: { "Content-Type": "text/tab-separated-values" }
      })) as typeof fetch;

    const exitCode = await runCli(
      [
        "node",
        "asc",
        "api",
        "download",
        "/v1/salesReports",
        "--query",
        "filter[frequency]=DAILY",
        "--out",
        outputPath,
        "--json"
      ],
      { ...io, env: createAuthEnv(), fetchImpl }
    );

    expect(exitCode).toBe(0);
    await expect(readFile(outputPath, "utf8")).resolves.toBe("Date\tUnits\n2026-06-01\t2\n");
    expect(JSON.parse(io.stdoutText)).toMatchObject({
      status: 200,
      path: outputPath,
      bytes: 24,
      contentType: "text/tab-separated-values"
    });
  });
});
