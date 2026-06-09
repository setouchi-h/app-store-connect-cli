import { Command } from "commander";
import { AppStoreConnectClient } from "../appstore/client.js";
import { createAppStoreConnectToken } from "../appstore/auth.js";
import { loadReportsConfig, loadStorageConfig } from "../appstore/config.js";
import { listSupportedReports, ReportsService } from "../appstore/reports.js";
import { FetchReportOptionsSchema, SummarizeOptionsSchema } from "../schemas/reports.js";
import { DuckDbReportStore } from "../storage/duckdb.js";
import { writeJson } from "../utils/output.js";
import type { CliContext } from "./context.js";

export function registerReportsCommand(program: Command, context: CliContext): void {
  const reports = new Command("reports")
    .description("Analytics report commands.")
    .option("--json", "Emit JSON output.");

  reports
    .command("list")
    .description("List supported report definitions.")
    .option("--json", "Emit JSON output.")
    .action(async () => {
      writeJson(context.stdout, {
        reports: listSupportedReports()
      });
    });

  reports
    .command("fetch")
    .description("Fetch Sales and Trends reports and store parsed rows in DuckDB.")
    .requiredOption("--app-id <id>", "App Store app Apple identifier.")
    .requiredOption("--from <date>", "Start date in YYYY-MM-DD format.")
    .requiredOption("--to <date>", "End date in YYYY-MM-DD format.")
    .option("--json", "Emit JSON output.")
    .action(async (options: Record<string, unknown>) => {
      const parsedOptions = FetchReportOptionsSchema.parse(options);
      const config = loadReportsConfig(context.env);
      const store = new DuckDbReportStore(config.duckdbPath);
      const client = new AppStoreConnectClient({
        baseUrl: config.apiBaseUrl,
        fetchImpl: context.fetchImpl,
        tokenProvider: {
          getToken: async () =>
            (await createAppStoreConnectToken(config, { now: context.now })).token
        }
      });
      const service = new ReportsService({
        client,
        vendorNumber: config.vendorNumber,
        reportsDir: config.reportsDir,
        store
      });

      writeJson(context.stdout, await service.fetchSalesSummary(parsedOptions));
    });

  reports
    .command("summarize")
    .description("Summarize locally stored analytics rows.")
    .requiredOption("--from <date>", "Start date in YYYY-MM-DD format.")
    .requiredOption("--to <date>", "End date in YYYY-MM-DD format.")
    .option("--json", "Emit JSON output.")
    .action(async (options: Record<string, unknown>) => {
      const parsedOptions = SummarizeOptionsSchema.parse(options);
      const config = loadStorageConfig(context.env);
      const store = new DuckDbReportStore(config.duckdbPath);

      writeJson(context.stdout, await store.summarize(parsedOptions));
    });

  program.addCommand(reports);
}
