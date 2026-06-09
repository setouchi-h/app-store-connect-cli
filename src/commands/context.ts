import type { Writer } from "../utils/output.js";

export interface CliDependencies {
  env?: NodeJS.ProcessEnv;
  stdout?: Writer;
  stderr?: Writer;
  fetchImpl?: typeof fetch;
  now?: Date;
}

export interface CliContext {
  env: NodeJS.ProcessEnv;
  stdout: Writer;
  stderr: Writer;
  fetchImpl?: typeof fetch;
  now?: Date;
}

export function createCliContext(dependencies: CliDependencies = {}): CliContext {
  return {
    env: dependencies.env ?? process.env,
    stdout: dependencies.stdout ?? process.stdout,
    stderr: dependencies.stderr ?? process.stderr,
    fetchImpl: dependencies.fetchImpl,
    now: dependencies.now
  };
}
