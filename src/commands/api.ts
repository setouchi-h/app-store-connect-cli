import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Command, Option } from "commander";
import { createAppStoreConnectToken } from "../appstore/auth.js";
import { AppStoreConnectClient } from "../appstore/client.js";
import { loadAuthConfig } from "../appstore/config.js";
import { CliError } from "../utils/errors.js";
import { writeJson } from "../utils/output.js";
import type { CliContext } from "./context.js";

const JSON_ACCEPT = "application/json";
const DOWNLOAD_ACCEPT =
  "application/a-gzip, application/gzip, text/tab-separated-values, text/plain, application/octet-stream";

interface ApiRequestOptions {
  query?: string[];
  header?: string[];
  accept?: string;
  body?: string;
}

interface ApiDownloadOptions {
  query?: string[];
  header?: string[];
  accept?: string;
  out: string;
}

type JsonApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

export function registerApiCommand(program: Command, context: CliContext): void {
  const api = new Command("api")
    .description("Call App Store Connect API endpoints directly.")
    .option("--json", "Emit JSON output.");

  for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
    registerJsonApiMethod(api, context, method);
  }

  api
    .command("download")
    .description("Download a raw App Store Connect API response to a file.")
    .argument("<path>", "API path, e.g. /v1/salesReports, or an absolute API URL.")
    .option("-q, --query <key=value>", "Add a query parameter. Repeat for multiple values.", collectOption, [])
    .option("-H, --header <name=value>", "Add a request header. Repeat for multiple values.", collectOption, [])
    .option("--accept <media-type>", "Set the Accept request header.", DOWNLOAD_ACCEPT)
    .requiredOption("-o, --out <path>", "File path for the downloaded response.")
    .option("--json", "Emit JSON output.")
    .action(async (pathname: string, options: ApiDownloadOptions) => {
      const client = createClient(context);
      const headers = parseHeaders(options.header ?? []);

      setHeaderIfMissing(headers, "Accept", options.accept ?? DOWNLOAD_ACCEPT);

      const response = await client.requestRaw(pathname, {
        method: "GET",
        query: parseKeyValueOptions(options.query ?? [], "query"),
        headers
      });
      const data = Buffer.from(await response.arrayBuffer());
      const outputPath = resolve(options.out);

      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, data);

      writeJson(context.stdout, {
        status: response.status,
        path: outputPath,
        bytes: data.byteLength,
        contentType: response.headers.get("content-type") ?? undefined
      });
    });

  program.addCommand(api);
}

function registerJsonApiMethod(
  api: Command,
  context: CliContext,
  method: JsonApiMethod
): void {
  const command = api
    .command(method.toLowerCase())
    .description(`${method} an App Store Connect API endpoint.`)
    .argument("<path>", "API path, e.g. /v1/apps, or an absolute API URL.")
    .option("-q, --query <key=value>", "Add a query parameter. Repeat for multiple values.", collectOption, [])
    .option("-H, --header <name=value>", "Add a request header. Repeat for multiple values.", collectOption, [])
    .option("--accept <media-type>", "Set the Accept request header.", JSON_ACCEPT)
    .option("--json", "Emit JSON output.");

  const bodyOption = new Option(
    "--body <json-or-@file>",
    "JSON request body, or @path to read JSON from a file."
  );

  command.addOption(methodSupportsBody(method) ? bodyOption : bodyOption.hideHelp());

  command
    .action(async (pathname: string, options: ApiRequestOptions) => {
      validateBodySupport(method, options.body);

      const body = await readJsonBody(options.body);
      const headers = parseHeaders(options.header ?? []);

      setHeaderIfMissing(headers, "Accept", options.accept ?? JSON_ACCEPT);

      if (body !== undefined) {
        setHeaderIfMissing(headers, "Content-Type", "application/json");
      }

      const client = createClient(context);
      const response = await client.requestRaw(pathname, {
        method,
        query: parseKeyValueOptions(options.query ?? [], "query"),
        headers,
        body
      });

      await writeApiResponse(context, response);
    });
}

function methodSupportsBody(method: JsonApiMethod): boolean {
  return method === "POST" || method === "PATCH";
}

function validateBodySupport(method: JsonApiMethod, body: string | undefined): void {
  if (body === undefined || methodSupportsBody(method)) {
    return;
  }

  throw new CliError("Request bodies are only supported for POST and PATCH API methods.", {
    code: "ASC_API_UNSUPPORTED_BODY",
    exitCode: 2,
    details: {
      method,
      hint: "Use asc api post or asc api patch when sending --body."
    }
  });
}

function createClient(context: CliContext): AppStoreConnectClient {
  const config = loadAuthConfig(context.env);

  return new AppStoreConnectClient({
    baseUrl: config.apiBaseUrl,
    fetchImpl: context.fetchImpl,
    tokenProvider: {
      getToken: async () => (await createAppStoreConnectToken(config, { now: context.now })).token
    }
  });
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseKeyValueOptions(values: string[], optionName: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const value of values) {
    const separator = value.indexOf("=");

    if (separator <= 0) {
      throw new CliError(`Invalid --${optionName} value.`, {
        code: "ASC_API_INVALID_OPTION",
        exitCode: 2,
        details: {
          value,
          hint: `Use --${optionName} key=value.`
        }
      });
    }

    parsed[value.slice(0, separator)] = value.slice(separator + 1);
  }

  return parsed;
}

function parseHeaders(values: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const value of values) {
    const colon = value.indexOf(":");
    const equals = value.indexOf("=");
    const separator = colon >= 0 && (equals < 0 || colon < equals) ? colon : equals;

    if (separator <= 0) {
      throw new CliError("Invalid --header value.", {
        code: "ASC_API_INVALID_OPTION",
        exitCode: 2,
        details: {
          value,
          hint: "Use --header Name=value or --header 'Name: value'."
        }
      });
    }

    const name = value.slice(0, separator).trim();

    if (!name) {
      throw new CliError("Invalid --header value.", {
        code: "ASC_API_INVALID_OPTION",
        exitCode: 2,
        details: {
          value,
          hint: "Header name cannot be empty."
        }
      });
    }

    parsed[name] = value.slice(separator + 1).trimStart();
  }

  return parsed;
}

async function readJsonBody(spec: string | undefined): Promise<string | undefined> {
  if (spec === undefined) {
    return undefined;
  }

  const source = spec.startsWith("@") ? await readBodyFile(spec) : spec;

  try {
    return JSON.stringify(JSON.parse(source));
  } catch (error) {
    throw new CliError("Request body must be valid JSON.", {
      code: "ASC_API_INVALID_BODY",
      exitCode: 2,
      details: {
        hint: "Pass --body '{\"data\":{...}}' or --body @body.json."
      },
      cause: error
    });
  }
}

async function readBodyFile(spec: string): Promise<string> {
  const filePath = spec.slice(1);

  if (!filePath) {
    throw new CliError("Request body file path is required.", {
      code: "ASC_API_INVALID_BODY",
      exitCode: 2,
      details: {
        hint: "Use --body @body.json."
      }
    });
  }

  try {
    return await readFile(resolve(filePath), "utf8");
  } catch (error) {
    throw new CliError("Request body file could not be read.", {
      code: "ASC_API_INVALID_BODY",
      exitCode: 2,
      details: {
        path: filePath,
        hint: "Check that the file exists and is readable."
      },
      cause: error
    });
  }
}

function setHeaderIfMissing(headers: Record<string, string>, name: string, value: string): void {
  if (Object.keys(headers).some((header) => header.toLowerCase() === name.toLowerCase())) {
    return;
  }

  headers[name] = value;
}

async function writeApiResponse(context: CliContext, response: Response): Promise<void> {
  if (response.status === 204) {
    writeJson(context.stdout, { status: response.status });
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  if (body.trim() === "") {
    writeJson(context.stdout, { status: response.status });
    return;
  }

  if (contentType.toLowerCase().includes("json")) {
    try {
      writeJson(context.stdout, JSON.parse(body));
      return;
    } catch {
      // Fall through and emit the raw body when the server advertises JSON but sends invalid JSON.
    }
  }

  writeJson(context.stdout, {
    status: response.status,
    contentType: contentType || undefined,
    body
  });
}
