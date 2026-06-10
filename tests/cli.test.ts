import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

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

describe("asc CLI", () => {
  it("prints root help without App Store Connect credentials", async () => {
    const io = createWriters();
    const exitCode = await runCli(["node", "asc", "--help"], io);

    expect(exitCode).toBe(0);
    expect(io.stdoutText).toContain("Usage: asc");
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
});
