import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import type { AppStoreConnectClient } from "./client.js";
import type { SalesReportRow } from "../schemas/reports.js";
import { eachDateInRange } from "../utils/dates.js";

export interface SupportedReport {
  id: string;
  apiPath: string;
  reportType: string;
  reportSubType: string;
  frequency: string;
  description: string;
  requiresVendorNumber: boolean;
}

export const SUPPORTED_REPORTS: SupportedReport[] = [
  {
    id: "sales-summary-daily",
    apiPath: "/v1/salesReports",
    reportType: "SALES",
    reportSubType: "SUMMARY",
    frequency: "DAILY",
    description: "Daily Sales and Trends summary report.",
    requiresVendorNumber: true
  }
];

export interface NormalizedSalesReportRow {
  reportDate: string;
  appId: string;
  units: number;
  proceeds: number;
  countryCode?: string;
  productTypeIdentifier?: string;
  row: SalesReportRow;
}

export interface ReportStoreLike {
  saveSalesRows(rows: NormalizedSalesReportRow[]): Promise<void>;
}

export interface ReportsServiceOptions {
  client: AppStoreConnectClient;
  vendorNumber: string;
  reportsDir: string;
  store?: ReportStoreLike;
}

export interface FetchSalesSummaryOptions {
  appId: string;
  from: string;
  to: string;
}

export interface FetchSalesSummaryResult {
  report: string;
  appId: string;
  from: string;
  to: string;
  days: number;
  storedRows: number;
  files: Array<{
    date: string;
    path: string;
    rows: number;
  }>;
}

export class ReportsService {
  private readonly client: AppStoreConnectClient;
  private readonly vendorNumber: string;
  private readonly reportsDir: string;
  private readonly store?: ReportStoreLike;

  constructor(options: ReportsServiceOptions) {
    this.client = options.client;
    this.vendorNumber = options.vendorNumber;
    this.reportsDir = options.reportsDir;
    this.store = options.store;
  }

  async fetchSalesSummary(options: FetchSalesSummaryOptions): Promise<FetchSalesSummaryResult> {
    await mkdir(this.reportsDir, { recursive: true });

    const dates = eachDateInRange(options.from, options.to);
    const files: FetchSalesSummaryResult["files"] = [];
    let storedRows = 0;

    for (const date of dates) {
      const raw = await this.client.download("/v1/salesReports", {
        "filter[frequency]": "DAILY",
        "filter[reportDate]": date,
        "filter[reportSubType]": "SUMMARY",
        "filter[reportType]": "SALES",
        "filter[vendorNumber]": this.vendorNumber
      });
      const reportText = decodeReport(raw);
      const rows = parseSalesReport(reportText)
        .map((row) => normalizeSalesReportRow(row, date, options.appId))
        .filter((row) => row.appId === options.appId);
      const filePath = join(this.reportsDir, `sales-summary-${date}.tsv`);

      await writeFile(filePath, reportText, "utf8");

      if (this.store) {
        await this.store.saveSalesRows(rows);
      }

      storedRows += rows.length;
      files.push({
        date,
        path: filePath,
        rows: rows.length
      });
    }

    return {
      report: "sales-summary-daily",
      appId: options.appId,
      from: options.from,
      to: options.to,
      days: dates.length,
      storedRows,
      files
    };
  }
}

export function listSupportedReports(): SupportedReport[] {
  return SUPPORTED_REPORTS;
}

export function parseSalesReport(reportText: string): SalesReportRow[] {
  return parse(reportText, {
    bom: true,
    columns: true,
    delimiter: "\t",
    relaxColumnCount: true,
    skipEmptyLines: true,
    trim: true
  }) as SalesReportRow[];
}

export function decodeReport(raw: Buffer): string {
  const isGzip = raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b;
  return (isGzip ? gunzipSync(raw) : raw).toString("utf8");
}

function normalizeSalesReportRow(
  row: SalesReportRow,
  reportDate: string,
  requestedAppId: string
): NormalizedSalesReportRow {
  const appId = firstNonEmpty(
    row["Apple Identifier"],
    row["Apple ID"],
    row["App Apple ID"],
    row["Parent Identifier"],
    requestedAppId
  );

  return {
    reportDate,
    appId,
    units: parseNumber(row.Units),
    proceeds: parseNumber(row["Developer Proceeds"]),
    countryCode: firstNonEmpty(row["Country Code"], row["Country"]),
    productTypeIdentifier: firstNonEmpty(row["Product Type Identifier"]),
    row
  };
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find((value) => value !== undefined && value.trim() !== "") ?? "";
}

function parseNumber(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const normalized = value.replaceAll(",", "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
