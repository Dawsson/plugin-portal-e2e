import { resolve } from "node:path";
import type { E2EConfig } from "../types.ts";
import { ensureDir } from "../lib/fs.ts";
import { loadLocalState, saveLocalState } from "../lib/state.ts";

export async function bootstrap(root: string, config: E2EConfig): Promise<void> {
  ensureDir(resolve(root, ".state/generated"));
  ensureDir(resolve(root, ".state/runtime"));
  ensureDir(resolve(root, config.artifactsDir));

  const current = await loadLocalState(root);
  await saveLocalState(root, {
    prismAppPath: current.prismAppPath ?? config.client.prism.appPath,
    prismInstanceRoot: current.prismInstanceRoot ?? "~/Library/Application Support/PrismLauncher/instances",
    obsAppPath: current.obsAppPath ?? "/Applications/OBS.app",
    obsSceneCollection: current.obsSceneCollection ?? "plugin-portal-e2e"
  });

  console.log("Bootstrap complete.");
  console.log(`Prism binary: ${config.client.prism.appPath}`);
  console.log("OBS app: /Applications/OBS.app");
}
