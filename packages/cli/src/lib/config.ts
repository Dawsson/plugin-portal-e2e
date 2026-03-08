import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { defineConfig, type E2EConfig } from "../config.ts";

export async function loadConfig(root: string, configPath?: string): Promise<E2EConfig> {
  const absolutePath = resolve(root, configPath ?? "e2e.config.ts");
  const mod = await import(pathToFileURL(absolutePath).href);
  const config = (mod.default ?? mod.config) as E2EConfig | undefined;
  if (!config) {
    throw new Error(`Config file did not export a default E2EConfig: ${absolutePath}`);
  }
  return defineConfig(config);
}
