#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";
import { registerApiCommand } from "./commands/api.js";
import { registerAnalyticsCommand } from "./commands/analytics.js";
import { registerAppsCommand } from "./commands/apps.js";
import { registerAuthCommand } from "./commands/auth.js";
import { createCliContext, type CliDependencies } from "./commands/context.js";
import { registerReportsCommand } from "./commands/reports.js";
import { formatCliError, normalizeError } from "./utils/errors.js";

export const VERSION = "0.1.0";

export function createCli(dependencies: CliDependencies = {}): Command {
  const context = createCliContext(dependencies);
  const program = new Command();

  program
    .name("asc")
    .description("App Store Connect analytics CLI.")
    .version(VERSION)
    .option("--json", "Emit JSON output.")
    .showHelpAfterError();

  registerApiCommand(program, context);
  registerAnalyticsCommand(program, context);
  registerAppsCommand(program, context);
  registerAuthCommand(program, context);
  registerReportsCommand(program, context);
  configureCommandTree(program, context);

  return program;
}

export async function runCli(
  argv: string[] = process.argv,
  dependencies: CliDependencies = {}
): Promise<number> {
  const normalizedArgv = normalizeArgv(argv);
  const context = createCliContext(dependencies);
  const program = createCli({
    ...dependencies,
    stdout: context.stdout,
    stderr: context.stderr
  });

  try {
    await program.parseAsync(normalizedArgv);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    const normalized = normalizeError(error);
    context.stderr.write(`${formatCliError(normalized, normalizedArgv.includes("--json"))}\n`);
    return normalized.exitCode;
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedFile === currentFile) {
  const exitCode = await runCli();
  process.exitCode = exitCode;
}

function configureCommandTree(program: Command, context: ReturnType<typeof createCliContext>): void {
  program.exitOverride();
  program.configureOutput({
    writeOut: (chunk) => {
      context.stdout.write(chunk);
    },
    writeErr: (chunk) => {
      context.stderr.write(chunk);
    }
  });

  for (const command of program.commands) {
    configureCommandTree(command, context);
  }
}

function normalizeArgv(argv: string[]): string[] {
  if (argv[2] !== "--") {
    return argv;
  }

  return [argv[0]!, argv[1]!, ...argv.slice(3)];
}
