import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { AppStoreConnectClient } from "./client.js";
import { CliError } from "../utils/errors.js";

export const ANALYTICS_ACCESS_TYPES = ["ONGOING", "ONE_TIME_SNAPSHOT"] as const;
export type AnalyticsAccessType = (typeof ANALYTICS_ACCESS_TYPES)[number];

export const ANALYTICS_GRANULARITIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type AnalyticsGranularity = (typeof ANALYTICS_GRANULARITIES)[number];

export interface AnalyticsReportRequestSummary {
  id: string;
  accessType: string;
  stoppedDueToInactivity: boolean;
}

export interface AnalyticsReportSummary {
  id: string;
  name?: string;
  category?: string;
}

export interface AnalyticsReportInstanceSummary {
  id: string;
  granularity?: string;
  processingDate?: string;
}

interface AnalyticsResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

interface AnalyticsListResponse {
  data?: AnalyticsResource[];
  links?: {
    next?: string;
  };
}

export interface AnalyticsServiceOptions {
  client: AppStoreConnectClient;
  reportsDir: string;
}

export interface EnsureReportRequestResult {
  request: AnalyticsReportRequestSummary;
  created: boolean;
}

export interface FetchAnalyticsReportOptions {
  appId: string;
  report: string;
  accessType: AnalyticsAccessType;
  granularity: AnalyticsGranularity;
  from: string;
  to: string;
}

export interface FetchAnalyticsReportResult {
  report: string;
  category?: string;
  granularity: string;
  from: string;
  to: string;
  instances: number;
  stoppedDueToInactivity: boolean;
  files: Array<{
    date: string;
    path: string;
    bytes: number;
  }>;
}

export class AnalyticsService {
  private readonly client: AppStoreConnectClient;
  private readonly reportsDir: string;

  constructor(options: AnalyticsServiceOptions) {
    this.client = options.client;
    this.reportsDir = options.reportsDir;
  }

  async listReportRequests(appId: string): Promise<AnalyticsReportRequestSummary[]> {
    const resources = await this.listAll(`/v1/apps/${appId}/analyticsReportRequests`, {
      limit: "200"
    });

    return resources.map(toReportRequestSummary);
  }

  async ensureReportRequest(
    appId: string,
    accessType: AnalyticsAccessType
  ): Promise<EnsureReportRequestResult> {
    const existing = (await this.listReportRequests(appId)).find(
      (request) => request.accessType === accessType && !request.stoppedDueToInactivity
    );

    if (existing) {
      return { request: existing, created: false };
    }

    const response = await this.client.postJson<{ data: AnalyticsResource }>(
      "/v1/analyticsReportRequests",
      {
        data: {
          type: "analyticsReportRequests",
          attributes: { accessType },
          relationships: {
            app: {
              data: { type: "apps", id: appId }
            }
          }
        }
      }
    );

    return { request: toReportRequestSummary(response.data), created: true };
  }

  async requireRequest(
    appId: string,
    accessType: AnalyticsAccessType
  ): Promise<AnalyticsReportRequestSummary> {
    const candidates = (await this.listReportRequests(appId)).filter(
      (request) => request.accessType === accessType
    );
    const request =
      candidates.find((candidate) => !candidate.stoppedDueToInactivity) ?? candidates[0];

    if (!request) {
      throw new CliError(`No ${accessType} analytics report request exists for this app.`, {
        code: "ASC_ANALYTICS_REQUEST_NOT_FOUND",
        exitCode: 2,
        details: {
          appId,
          accessType,
          hint: `Run \`asc analytics request ensure --app <appId> --access-type ${accessType}\` once, then retry. Apple may take up to 48 hours to generate the first reports.`
        }
      });
    }

    return request;
  }

  async listReports(requestId: string, category?: string): Promise<AnalyticsReportSummary[]> {
    const query: Record<string, string> = { limit: "200" };

    if (category) {
      query["filter[category]"] = category;
    }

    const resources = await this.listAll(`/v1/analyticsReportRequests/${requestId}/reports`, query);

    return resources.map((resource) => ({
      id: resource.id,
      name: stringAttribute(resource, "name"),
      category: stringAttribute(resource, "category")
    }));
  }

  async listInstances(
    reportId: string,
    granularity: AnalyticsGranularity
  ): Promise<AnalyticsReportInstanceSummary[]> {
    const resources = await this.listAll(`/v1/analyticsReports/${reportId}/instances`, {
      "filter[granularity]": granularity,
      limit: "200"
    });

    return resources.map((resource) => ({
      id: resource.id,
      granularity: stringAttribute(resource, "granularity"),
      processingDate: stringAttribute(resource, "processingDate")
    }));
  }

  async fetchReport(options: FetchAnalyticsReportOptions): Promise<FetchAnalyticsReportResult> {
    const reportRequest = await this.requireRequest(options.appId, options.accessType);
    const reports = await this.listReports(reportRequest.id);
    const wanted = options.report.toLowerCase();
    const report = reports.find((candidate) => candidate.name?.toLowerCase() === wanted);

    if (!report) {
      throw new CliError(`Analytics report "${options.report}" was not found.`, {
        code: "ASC_ANALYTICS_REPORT_NOT_FOUND",
        exitCode: 2,
        details: {
          requested: options.report,
          available: reports.map((candidate) => candidate.name).filter(Boolean)
        }
      });
    }

    const instances = (await this.listInstances(report.id, options.granularity))
      .filter(
        (instance) =>
          instance.processingDate !== undefined &&
          instance.processingDate >= options.from &&
          instance.processingDate <= options.to
      )
      .sort((left, right) => (left.processingDate! < right.processingDate! ? -1 : 1));

    await mkdir(this.reportsDir, { recursive: true });

    const files: FetchAnalyticsReportResult["files"] = [];

    for (const instance of instances) {
      const segments = await this.listAll(
        `/v1/analyticsReportInstances/${instance.id}/segments`,
        { limit: "200" }
      );

      for (const [index, segment] of segments.entries()) {
        const url = stringAttribute(segment, "url");

        if (!url) {
          throw new CliError("Analytics report segment is missing a download URL.", {
            code: "ASC_ANALYTICS_SEGMENT_INVALID",
            exitCode: 1,
            details: { instanceId: instance.id, segmentId: segment.id }
          });
        }

        const raw = await this.client.downloadFromUrl(url);
        const data = decompressIfGzip(raw, { instanceId: instance.id, segmentId: segment.id });
        const fileName = [
          "analytics",
          slugify(report.name ?? report.id),
          options.granularity.toLowerCase(),
          instance.processingDate,
          String(index + 1)
        ].join("-");
        const filePath = join(this.reportsDir, `${fileName}.tsv`);

        await writeFile(filePath, data);

        files.push({
          date: instance.processingDate!,
          path: filePath,
          bytes: data.byteLength
        });
      }
    }

    return {
      report: report.name ?? options.report,
      category: report.category,
      granularity: options.granularity,
      from: options.from,
      to: options.to,
      instances: instances.length,
      stoppedDueToInactivity: reportRequest.stoppedDueToInactivity,
      files
    };
  }

  private async listAll(
    pathname: string,
    query: Record<string, string>
  ): Promise<AnalyticsResource[]> {
    const resources: AnalyticsResource[] = [];
    const visited = new Set<string>();
    let page = await this.client.getJson<AnalyticsListResponse>(pathname, query);

    resources.push(...(page.data ?? []));

    while (page.links?.next && !visited.has(page.links.next)) {
      visited.add(page.links.next);
      page = await this.client.getJson<AnalyticsListResponse>(page.links.next, {});
      resources.push(...(page.data ?? []));
    }

    return resources;
  }
}

function toReportRequestSummary(resource: AnalyticsResource): AnalyticsReportRequestSummary {
  return {
    id: resource.id,
    accessType: stringAttribute(resource, "accessType") ?? "",
    stoppedDueToInactivity: resource.attributes?.["stoppedDueToInactivity"] === true
  };
}

function stringAttribute(resource: AnalyticsResource, name: string): string | undefined {
  const value = resource.attributes?.[name];
  return typeof value === "string" ? value : undefined;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function decompressIfGzip(raw: Buffer, context: Record<string, unknown> = {}): Buffer {
  const isGzip = raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b;

  if (!isGzip) {
    return raw;
  }

  try {
    return gunzipSync(raw);
  } catch (error) {
    throw new CliError("Failed to decompress analytics report segment.", {
      code: "ASC_ANALYTICS_DECOMPRESS_FAILED",
      exitCode: 1,
      details: context,
      cause: error
    });
  }
}
