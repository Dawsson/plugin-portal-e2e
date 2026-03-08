import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { E2EConfig, ReleaseSource } from "../types.ts";
import { runCommand } from "./exec.ts";

export interface ResolvedRelease {
  kind: "url" | "file";
  value: string;
  filename: string;
}

function resolveLocalBuild(root: string, source: Extract<ReleaseSource, { mode: "local-build" }>): ResolvedRelease {
  const pluginRepo = resolve(root, source.pluginRepoPath);
  const buildResult = runCommand(["./gradlew", "build"], pluginRepo);
  if (!buildResult.ok) {
    throw new Error(`Failed to build plugin repo\n${buildResult.stderr}`);
  }

  const variant = source.variant ?? "free";
  const outDir = join(pluginRepo, "out");
  const filename = readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jar"))
    .map((entry) => ({
      name: entry.name,
      fullPath: join(outDir, entry.name),
      modifiedAt: Bun.file(join(outDir, entry.name)).lastModified
    }))
    .filter((entry) =>
      variant === "premium"
        ? entry.name.startsWith("PluginPortalPremium-")
        : entry.name.startsWith("PluginPortal-")
    )
    .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]?.name;
  if (!filename) {
    throw new Error(`Could not find built ${variant} jar in ${outDir}`);
  }
  const jarPath = join(outDir, filename);
  if (!existsSync(jarPath)) {
    throw new Error(`Expected built plugin jar at ${jarPath}`);
  }
  return {
    kind: "file",
    value: jarPath,
    filename
  };
}

export function resolveReleaseSource(root: string, config: E2EConfig): ResolvedRelease {
  switch (config.releaseSource.mode) {
    case "url":
      return {
        kind: "url",
        value: config.releaseSource.url,
        filename: basename(new URL(config.releaseSource.url).pathname)
      };
    case "local-path": {
      const jarPath = resolve(root, config.releaseSource.path);
      if (!existsSync(jarPath)) {
        throw new Error(`Local jar does not exist: ${jarPath}`);
      }
      return {
        kind: "file",
        value: jarPath,
        filename: basename(jarPath)
      };
    }
    case "local-build":
      return resolveLocalBuild(root, config.releaseSource);
    case "api-local":
    case "api-production":
      throw new Error(`Release source ${config.releaseSource.mode} is not implemented yet`);
  }
}
