import type { ClientConfig } from "../types.ts";
import { runCommand } from "./exec.ts";

export function launchPrismClient(client: ClientConfig, serverAddress: string, profile = "Offline"): void {
  const result = runCommand([
    client.prism.appPath,
    "--launch",
    client.prism.instanceName,
    "--server",
    serverAddress,
    "--profile",
    profile
  ]);

  if (!result.ok) {
    throw new Error(`Failed to launch Prism\n${result.stderr}`);
  }
}
