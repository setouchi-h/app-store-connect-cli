import { CliError } from "../utils/errors.js";
import { AscEnvSchema, type AscEnv } from "../schemas/config.js";

export interface AscAuthConfig {
  issuerId: string;
  keyId: string;
  privateKeyPath?: string;
  privateKey?: string;
  audience: string;
  apiBaseUrl: string;
}

export interface AscReportsConfig extends AscAuthConfig {
  vendorNumber: string;
  reportsDir: string;
  duckdbPath: string;
}

export interface StorageConfig {
  duckdbPath: string;
}

function parseEnv(env: NodeJS.ProcessEnv): AscEnv {
  return AscEnvSchema.parse(env);
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AscAuthConfig {
  const parsed = parseEnv(env);
  const missing = [
    ["ASC_ISSUER_ID", parsed.ASC_ISSUER_ID],
    ["ASC_KEY_ID", parsed.ASC_KEY_ID]
  ]
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);

  if (!parsed.ASC_PRIVATE_KEY_PATH && !parsed.ASC_PRIVATE_KEY) {
    missing.push("ASC_PRIVATE_KEY_PATH");
  }

  if (missing.length > 0) {
    throw new CliError("App Store Connect authentication is not configured.", {
      code: "ASC_AUTH_NOT_CONFIGURED",
      exitCode: 2,
      details: {
        missing,
        hint: "Set ASC_ISSUER_ID, ASC_KEY_ID, and ASC_PRIVATE_KEY_PATH. See .env.example."
      }
    });
  }

  return {
    issuerId: parsed.ASC_ISSUER_ID!,
    keyId: parsed.ASC_KEY_ID!,
    privateKeyPath: parsed.ASC_PRIVATE_KEY_PATH,
    privateKey: parsed.ASC_PRIVATE_KEY,
    audience: "appstoreconnect-v1",
    apiBaseUrl: parsed.ASC_API_BASE_URL ?? "https://api.appstoreconnect.apple.com"
  };
}

export function loadReportsConfig(env: NodeJS.ProcessEnv = process.env): AscReportsConfig {
  const parsed = parseEnv(env);
  const authConfig = loadAuthConfig(env);

  if (!parsed.ASC_VENDOR_NUMBER) {
    throw new CliError("App Store Connect reports are not configured.", {
      code: "ASC_REPORTS_NOT_CONFIGURED",
      exitCode: 2,
      details: {
        missing: ["ASC_VENDOR_NUMBER"],
        hint: "Set ASC_VENDOR_NUMBER. See .env.example."
      }
    });
  }

  return {
    ...authConfig,
    vendorNumber: parsed.ASC_VENDOR_NUMBER,
    reportsDir: parsed.ASC_REPORTS_DIR ?? "reports",
    duckdbPath: parsed.ASC_DUCKDB_PATH ?? "data/asc.duckdb"
  };
}

export function loadStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const parsed = parseEnv(env);
  return {
    duckdbPath: parsed.ASC_DUCKDB_PATH ?? "data/asc.duckdb"
  };
}
