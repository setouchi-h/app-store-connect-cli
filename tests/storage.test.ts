import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DuckDbReportStore } from "../src/storage/duckdb.js";

describe("DuckDbReportStore", () => {
  it("stores and summarizes normalized sales rows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "asc-storage-"));
    const store = new DuckDbReportStore(join(directory, "analytics.duckdb"));

    await store.saveSalesRows([
      {
        reportDate: "2026-01-01",
        appId: "1234567890",
        units: 2,
        proceeds: 1.4,
        countryCode: "US",
        productTypeIdentifier: "1F",
        row: {
          "Apple Identifier": "1234567890",
          Units: "2",
          "Developer Proceeds": "1.40"
        }
      },
      {
        reportDate: "2026-01-01",
        appId: "1234567890",
        units: 3,
        proceeds: 2.1,
        row: {
          "Apple Identifier": "1234567890",
          Units: "3",
          "Developer Proceeds": "2.10"
        }
      }
    ]);

    await expect(
      store.summarize({
        from: "2026-01-01",
        to: "2026-01-31"
      })
    ).resolves.toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
      rows: [
        {
          reportDate: "2026-01-01",
          appId: "1234567890",
          units: 5,
          proceeds: 3.5,
          rows: 2
        }
      ],
      totals: {
        units: 5,
        proceeds: 3.5,
        rows: 2
      }
    });
  });
});
