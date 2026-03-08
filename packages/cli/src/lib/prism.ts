import type { ClientConfig } from "../types.ts";
import { runDetached } from "./exec.ts";
import { runCommand } from "./exec.ts";
import { activateApp, frontmostAppName, launchMacAppBundle, resolveAppBundlePath, scheduleFullscreenSpace } from "./macos.ts";

export function launchPrismClient(client: ClientConfig): number {
  const args = [
    "--launch",
    client.prism.instanceName
  ];
  if (client.prism.profile) {
    args.push("--profile", client.prism.profile);
  }

  const launchMode = client.macos?.launchMode ?? "background";
  const appBundle = resolveAppBundlePath(client.prism.appPath);
  if (process.platform === "darwin" && appBundle) {
    const previousFrontApp = frontmostAppName();
    const pid = launchMacAppBundle(appBundle, args, launchMode !== "foreground");
    if (launchMode === "fullscreen-space") {
      scheduleFullscreenSpace("Prism Launcher", previousFrontApp);
    }
    return pid;
  }

  return runDetached([client.prism.appPath, ...args]);
}

export function closePrismClient(client: ClientConfig): void {
  runCommand(["pkill", "-f", client.prism.instanceName]);
}
