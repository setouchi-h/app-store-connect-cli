import { Command } from "commander";
import { AppStoreConnectClient } from "../appstore/client.js";
import { loadAuthConfig } from "../appstore/config.js";
import { createAppStoreConnectToken } from "../appstore/auth.js";
import { writeJson } from "../utils/output.js";
import type { CliContext } from "./context.js";

export function registerAppsCommand(program: Command, context: CliContext): void {
  const apps = new Command("apps")
    .description("App Store Connect app commands.");

  apps
    .command("list")
    .description("List apps from App Store Connect.")
    .action(async () => {
      const config = loadAuthConfig(context.env);
      const client = new AppStoreConnectClient({
        baseUrl: config.apiBaseUrl,
        fetchImpl: context.fetchImpl,
        tokenProvider: {
          getToken: async () =>
            (await createAppStoreConnectToken(config, { now: context.now })).token
        }
      });

      writeJson(context.stdout, {
        apps: await client.listApps()
      });
    });

  program.addCommand(apps);
}
