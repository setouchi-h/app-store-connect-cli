import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppStoreConnectClient } from "./client.js";
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

export interface ReportsServiceOptions {
  client: AppStoreConnectClient;
  vendorNumber: string;
  reportsDir: string;
}

export interface FetchSalesSummaryOptions {
  from: string;
  to: string;
}

export interface FetchSalesSummaryResult {
  report: string;
  from: string;
  to: string;
  days: number;
  files: Array<{
    date: string;
    path: string;
    bytes: number;
  }>;
}

export class ReportsService {
  private readonly client: AppStoreConnectClient;
  private readonly vendorNumber: string;
  private readonly reportsDir: string;

  constructor(options: ReportsServiceOptions) {
    this.client = options.client;
    this.vendorNumber = options.vendorNumber;
    this.reportsDir = options.reportsDir;
  }

  async fetchSalesSummary(options: FetchSalesSummaryOptions): Promise<FetchSalesSummaryResult> {
    await mkdir(this.reportsDir, { recursive: true });

    const dates = eachDateInRange(options.from, options.to);
    const files: FetchSalesSummaryResult["files"] = [];

    for (const date of dates) {
      const raw = await this.client.download("/v1/salesReports", {
        "filter[frequency]": "DAILY",
        "filter[reportDate]": date,
        "filter[reportSubType]": "SUMMARY",
        "filter[reportType]": "SALES",
        "filter[vendorNumber]": this.vendorNumber
      });
      const filePath = join(this.reportsDir, `sales-summary-${date}${reportFileExtension(raw)}`);

      await writeFile(filePath, raw);

      files.push({
        date,
        path: filePath,
        bytes: raw.byteLength
      });
    }

    return {
      report: "sales-summary-daily",
      from: options.from,
      to: options.to,
      days: dates.length,
      files
    };
  }
}

export function listSupportedReports(): SupportedReport[] {
  return SUPPORTED_REPORTS;
}

export function reportFileExtension(raw: Buffer): ".tsv.gz" | ".tsv" {
  const isGzip = raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b;
  return isGzip ? ".tsv.gz" : ".tsv";
}
