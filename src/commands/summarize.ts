import { Command } from "commander";
import { loadStorageConfig } from "../appstore/config.js";
import { SummarizeOptionsSchema } from "../schemas/reports.js";
import { DuckDbReportStore } from "../storage/duckdb.js";
import { writeJson } from "../utils/output.js";
import type { CliContext } from "./context.js";

export function registerSummarizeCommand(program: Command, context: CliContext): void {
  program
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
}
