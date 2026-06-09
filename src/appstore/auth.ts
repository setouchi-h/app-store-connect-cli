import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT } from "jose";
import type { AscAuthConfig } from "./config.js";

const MAX_TOKEN_TTL_SECONDS = 20 * 60;

export interface AppStoreConnectToken {
  token: string;
  tokenType: "Bearer";
  issuedAt: string;
  expiresAt: string;
}

export interface TokenOptions {
  now?: Date;
  ttlSeconds?: number;
}

async function readPrivateKey(config: AscAuthConfig): Promise<string> {
  if (config.privateKey) {
    return config.privateKey;
  }

  return readFile(config.privateKeyPath!, "utf8");
}

export async function createAppStoreConnectToken(
  config: AscAuthConfig,
  options: TokenOptions = {}
): Promise<AppStoreConnectToken> {
  const now = options.now ?? new Date();
  const ttlSeconds = Math.min(options.ttlSeconds ?? MAX_TOKEN_TTL_SECONDS, MAX_TOKEN_TTL_SECONDS);
  const issuedAtSeconds = Math.floor(now.getTime() / 1000);
  const expiresAtSeconds = issuedAtSeconds + ttlSeconds;
  const privateKey = await importPKCS8(await readPrivateKey(config), "ES256");

  const token = await new SignJWT({})
    .setProtectedHeader({
      alg: "ES256",
      kid: config.keyId,
      typ: "JWT"
    })
    .setIssuer(config.issuerId)
    .setAudience(config.audience)
    .setIssuedAt(issuedAtSeconds)
    .setExpirationTime(expiresAtSeconds)
    .sign(privateKey);

  return {
    token,
    tokenType: "Bearer",
    issuedAt: new Date(issuedAtSeconds * 1000).toISOString(),
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString()
  };
}
