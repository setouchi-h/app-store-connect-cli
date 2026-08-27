import { Command } from "commander";
import { AppStoreConnectClient } from "../appstore/client.js";
import { createAppStoreConnectToken } from "../appstore/auth.js";
import { loadReportsConfig } from "../appstore/config.js";
import { listSupportedReports, ReportsService } from "../appstore/reports.js";
import { FetchReportOptionsSchema } from "../schemas/reports.js";
import { writeJson } from "../utils/output.js";
import type { CliContext } from "./context.js";

export function registerReportsCommand(program: Command, context: CliContext): void {
  const reports = new Command("reports")
    .description("Sales and Trends report commands.");

  reports
    .command("list")
    .description("List supported report definitions.")
    .action(async () => {
      writeJson(context.stdout, {
        reports: listSupportedReports()
      });
    });

  reports
    .command("fetch")
    .description("Fetch raw Sales and Trends reports.")
    .requiredOption("--from <date>", "Start date in YYYY-MM-DD format.")
    .requiredOption("--to <date>", "End date in YYYY-MM-DD format.")
    .action(async (options: Record<string, unknown>) => {
      const parsedOptions = FetchReportOptionsSchema.parse(options);
      const config = loadReportsConfig(context.env);
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
        reportsDir: config.reportsDir
      });

      writeJson(context.stdout, await service.fetchSalesSummary(parsedOptions));
    });

  program.addCommand(reports);
}
