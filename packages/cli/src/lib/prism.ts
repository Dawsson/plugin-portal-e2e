import type { ClientConfig } from "../types.ts";
import { runDetached } from "./exec.ts";
import { runCommand } from "./exec.ts";

export function launchPrismClient(client: ClientConfig): number {
  const command = [
    client.prism.appPath,
    "--launch",
    client.prism.instanceName
  ];
  if (client.prism.profile) {
    command.push("--profile", client.prism.profile);
  }
  return runDetached(command);
}

export function closePrismClient(client: ClientConfig): void {
  runCommand(["pkill", "-f", client.prism.instanceName]);
}
