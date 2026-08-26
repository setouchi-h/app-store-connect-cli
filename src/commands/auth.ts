import { Command } from "commander";
import { createAppStoreConnectToken } from "../appstore/auth.js";
import { loadAuthConfig } from "../appstore/config.js";
import { writeJson } from "../utils/output.js";
import type { CliContext } from "./context.js";

export function registerAuthCommand(program: Command, context: CliContext): void {
  const auth = new Command("auth")
    .description("Authentication helpers.");

  auth
    .command("token")
    .description("Generate an App Store Connect JWT.")
    .action(async () => {
      const config = loadAuthConfig(context.env);
      const token = await createAppStoreConnectToken(config, { now: context.now });

      writeJson(context.stdout, {
        issuerId: config.issuerId,
        keyId: config.keyId,
        ...token
      });
    });

  program.addCommand(auth);
}
