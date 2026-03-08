import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { E2EConfig } from "../types.ts";
import { ensureDir } from "../lib/fs.ts";
import { runCommand } from "../lib/exec.ts";
import { ensurePrismInstance } from "../lib/prism-instance.ts";
import { loadLocalState, saveLocalState } from "../lib/state.ts";

export async function bootstrap(root: string, config: E2EConfig): Promise<void> {
  ensureDir(resolve(root, ".state/generated"));
  ensureDir(resolve(root, ".state/runtime"));
  ensureDir(resolve(root, config.artifactsDir));

  const obsConfigPath = `${process.env.HOME ?? ""}/Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json`;
  const obsConfig = existsSync(obsConfigPath)
    ? JSON.parse(readFileSync(obsConfigPath, "utf8")) as {
        server_enabled?: boolean;
        server_port?: number;
        server_password?: string;
      }
    : null;

  const current = await loadLocalState(root);
  await saveLocalState(root, {
    prismAppPath: current.prismAppPath ?? config.client.prism.appPath,
    prismInstanceRoot: current.prismInstanceRoot ?? "~/Library/Application Support/PrismLauncher/instances",
    obsAppPath: current.obsAppPath ?? "/Applications/OBS.app",
    obsSceneCollection: current.obsSceneCollection ?? "plugin-portal-e2e",
    obsWebSocketPort: current.obsWebSocketPort ?? obsConfig?.server_port ?? 4455,
    obsWebSocketPassword: current.obsWebSocketPassword ?? obsConfig?.server_password
  });

  const modBuild = runCommand(["./gradlew", ":packages:client-mod:build"], root);
  if (!modBuild.ok) {
    throw new Error(`Failed to build client mod\n${modBuild.stderr}`);
  }

  await ensurePrismInstance(
    root,
    config.client,
    {
      prismAppPath: current.prismAppPath ?? config.client.prism.appPath,
      prismInstanceRoot: current.prismInstanceRoot ?? "~/Library/Application Support/PrismLauncher/instances",
      obsAppPath: current.obsAppPath ?? "/Applications/OBS.app",
      obsSceneCollection: current.obsSceneCollection ?? "plugin-portal-e2e"
    },
    resolve(root, "packages/client-mod/build/libs/plugin-portal-e2e-client-0.1.0.jar")
  );

  console.log("Bootstrap complete.");
  console.log(`Prism binary: ${config.client.prism.appPath}`);
  console.log("OBS app: /Applications/OBS.app");
}
