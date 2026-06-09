import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeReport, parseSalesReport } from "../src/appstore/reports.js";

describe("reports parsing", () => {
  it("decodes gzipped TSV reports and parses rows", () => {
    const report = [
      "Apple Identifier\tUnits\tDeveloper Proceeds\tCountry Code",
      "1234567890\t2\t1.40\tUS"
    ].join("\n");

    const decoded = decodeReport(gzipSync(report));
    const rows = parseSalesReport(decoded);

    expect(rows).toEqual([
      {
        "Apple Identifier": "1234567890",
        Units: "2",
        "Developer Proceeds": "1.40",
        "Country Code": "US"
      }
    ]);
  });
});
