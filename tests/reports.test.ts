import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { AppStoreConnectClient } from "../src/appstore/client.js";
import { reportFileExtension, ReportsService } from "../src/appstore/reports.js";

describe("reports", () => {
  it("detects gzipped report file extensions", () => {
    const report = [
      "Apple Identifier\tUnits\tDeveloper Proceeds\tCountry Code",
      "1234567890\t2\t1.40\tUS"
    ].join("\n");

    expect(reportFileExtension(gzipSync(report))).toBe(".tsv.gz");
    expect(reportFileExtension(Buffer.from(report))).toBe(".tsv");
  });

  it("stores downloaded sales report bytes without parsing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "asc-reports-"));
    const raw = gzipSync("Apple Identifier\tUnits\n1234567890\t2\n");
    const downloads: Array<{ pathname: string; query: Record<string, string> }> = [];
    const service = new ReportsService({
      client: {
        download: async (pathname: string, query: Record<string, string>) => {
          downloads.push({ pathname, query });
          return raw;
        }
      } as unknown as AppStoreConnectClient,
      reportsDir: directory,
      vendorNumber: "12345678"
    });

    const result = await service.fetchSalesSummary({
      from: "2026-01-01",
      to: "2026-01-01"
    });

    expect(downloads).toEqual([
      {
        pathname: "/v1/salesReports",
        query: {
          "filter[frequency]": "DAILY",
          "filter[reportDate]": "2026-01-01",
          "filter[reportSubType]": "SUMMARY",
          "filter[reportType]": "SALES",
          "filter[vendorNumber]": "12345678"
        }
      }
    ]);
    expect(result).toEqual({
      report: "sales-summary-daily",
      from: "2026-01-01",
      to: "2026-01-01",
      days: 1,
      files: [
        {
          date: "2026-01-01",
          path: join(directory, "sales-summary-2026-01-01.tsv.gz"),
          bytes: raw.byteLength
        }
      ]
    });
    await expect(readFile(join(directory, "sales-summary-2026-01-01.tsv.gz"))).resolves.toEqual(
      raw
    );
  });
});
