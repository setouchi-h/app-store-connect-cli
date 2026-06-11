import { Command } from "commander";
import { AnalyticsService } from "../appstore/analytics.js";
import { createAppStoreConnectToken } from "../appstore/auth.js";
import { AppStoreConnectClient } from "../appstore/client.js";
import { loadAnalyticsConfig, type AscAnalyticsConfig } from "../appstore/config.js";
import {
  EnsureAnalyticsRequestOptionsSchema,
  FetchAnalyticsOptionsSchema,
  ListAnalyticsReportsOptionsSchema,
  ListAnalyticsRequestsOptionsSchema
} from "../schemas/analytics.js";
import { CliError } from "../utils/errors.js";
import { writeJson } from "../utils/output.js";
import type { CliContext } from "./context.js";

export function registerAnalyticsCommand(program: Command, context: CliContext): void {
  const analytics = new Command("analytics")
    .description("App Analytics report commands (Analytics Reports API).")
    .option("--json", "Emit JSON output.");

  const request = new Command("request").description(
    "Manage analytics report generation requests."
  );

  request
    .command("ensure")
    .description(
      "Create an analytics report request unless an active one already exists (idempotent)."
    )
    .option("--app <appId>", "App Store Connect app ID. Defaults to ASC_APP_ID.")
    .option("--access-type <type>", "ONGOING or ONE_TIME_SNAPSHOT.", "ONGOING")
    .option("--json", "Emit JSON output.")
    .action(async (options: Record<string, unknown>) => {
      const parsed = EnsureAnalyticsRequestOptionsSchema.parse({
        app: options["app"],
        accessType: options["accessType"]
      });
      const config = loadAnalyticsConfig(context.env);
      const appId = resolveAppId(parsed.app, config);
      const service = createAnalyticsService(context, config);

      writeJson(context.stdout, await service.ensureReportRequest(appId, parsed.accessType));
    });

  request
    .command("list")
    .description("List analytics report requests for an app.")
    .option("--app <appId>", "App Store Connect app ID. Defaults to ASC_APP_ID.")
    .option("--json", "Emit JSON output.")
    .action(async (options: Record<string, unknown>) => {
      const parsed = ListAnalyticsRequestsOptionsSchema.parse({
        app: options["app"]
      });
      const config = loadAnalyticsConfig(context.env);
      const appId = resolveAppId(parsed.app, config);
      const service = createAnalyticsService(context, config);

      writeJson(context.stdout, {
        requests: await service.listReportRequests(appId)
      });
    });

  analytics
    .command("reports")
    .description("List analytics reports available for the app's report request.")
    .option("--app <appId>", "App Store Connect app ID. Defaults to ASC_APP_ID.")
    .option("--access-type <type>", "ONGOING or ONE_TIME_SNAPSHOT.", "ONGOING")
    .option("--category <category>", "Filter by report category, e.g. APP_STORE_ENGAGEMENT.")
    .option("--json", "Emit JSON output.")
    .action(async (options: Record<string, unknown>) => {
      const parsed = ListAnalyticsReportsOptionsSchema.parse({
        app: options["app"],
        accessType: options["accessType"],
        category: options["category"]
      });
      const config = loadAnalyticsConfig(context.env);
      const appId = resolveAppId(parsed.app, config);
      const service = createAnalyticsService(context, config);
      const reportRequest = await service.requireRequest(appId, parsed.accessType);

      writeJson(context.stdout, {
        requestId: reportRequest.id,
        accessType: reportRequest.accessType,
        stoppedDueToInactivity: reportRequest.stoppedDueToInactivity,
        reports: await service.listReports(reportRequest.id, parsed.category)
      });
    });

  analytics
    .command("fetch")
    .description("Fetch analytics report files for a date range.")
    .option("--app <appId>", "App Store Connect app ID. Defaults to ASC_APP_ID.")
    .requiredOption("--report <name>", 'Report name, e.g. "App Store Discovery and Engagement Standard".')
    .option("--access-type <type>", "ONGOING or ONE_TIME_SNAPSHOT.", "ONGOING")
    .option("--granularity <granularity>", "DAILY, WEEKLY, or MONTHLY.", "DAILY")
    .requiredOption("--from <date>", "Start date in YYYY-MM-DD format.")
    .requiredOption("--to <date>", "End date in YYYY-MM-DD format.")
    .option("--json", "Emit JSON output.")
    .action(async (options: Record<string, unknown>) => {
      const parsed = FetchAnalyticsOptionsSchema.parse({
        app: options["app"],
        report: options["report"],
        accessType: options["accessType"],
        granularity: options["granularity"],
        from: options["from"],
        to: options["to"]
      });
      const config = loadAnalyticsConfig(context.env);
      const appId = resolveAppId(parsed.app, config);
      const service = createAnalyticsService(context, config);
      const result = await service.fetchReport({
        appId,
        report: parsed.report,
        accessType: parsed.accessType,
        granularity: parsed.granularity,
        from: parsed.from,
        to: parsed.to
      });

      if (parsed.accessType === "ONGOING" && result.stoppedDueToInactivity) {
        context.stderr.write(
          "Warning: Apple stopped generating this ONGOING report due to inactivity. Run `asc analytics request ensure` to recreate it.\n"
        );
      }

      if (result.files.length === 0) {
        context.stderr.write(
          "Warning: no analytics report instances were available in the requested range. New requests can take up to 48 hours to produce data.\n"
        );
      }

      writeJson(context.stdout, result);
    });

  analytics.addCommand(request);
  program.addCommand(analytics);
}

function createAnalyticsService(context: CliContext, config: AscAnalyticsConfig): AnalyticsService {
  const client = new AppStoreConnectClient({
    baseUrl: config.apiBaseUrl,
    fetchImpl: context.fetchImpl,
    tokenProvider: {
      getToken: async () => (await createAppStoreConnectToken(config, { now: context.now })).token
    }
  });

  return new AnalyticsService({
    client,
    reportsDir: config.reportsDir
  });
}

function resolveAppId(app: string | undefined, config: AscAnalyticsConfig): string {
  const appId = app ?? config.appId;

  if (!appId) {
    throw new CliError("App Store Connect app ID is required.", {
      code: "ASC_APP_ID_REQUIRED",
      exitCode: 2,
      details: {
        hint: "Pass --app <appId> or set ASC_APP_ID. Use `asc apps list` to look up app IDs."
      }
    });
  }

  return appId;
}
