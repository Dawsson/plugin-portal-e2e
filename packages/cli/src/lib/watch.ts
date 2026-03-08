import { existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { E2EConfig, ServerFamily } from "../types.ts";
import type { TimelineWriter } from "./timeline.ts";

type WatchEntry = {
  size: number;
  mtimeMs: number;
};

type WatchSnapshot = Map<string, WatchEntry>;

function isBackendFamily(family: string): family is ServerFamily {
  return family === "paper" || family === "purpur" || family === "pufferfish" || family === "spigot";
}

async function scanRoot(root: string, include: string[], exclude: string[]): Promise<WatchSnapshot> {
  const snapshot: WatchSnapshot = new Map();

  for (const pattern of include) {
    const glob = new Bun.Glob(pattern);
    for await (const relPath of glob.scan({ cwd: root, absolute: false, dot: true, onlyFiles: false })) {
      if (exclude.some((candidate) => new Bun.Glob(candidate).match(relPath))) {
        continue;
      }
      const absPath = join(root, relPath);
      if (!existsSync(absPath)) {
        continue;
      }
      const stats = statSync(absPath);
      snapshot.set(relPath, {
        size: stats.size,
        mtimeMs: stats.mtimeMs
      });
    }
  }

  return snapshot;
}

export interface WatchHandle {
  stop(): Promise<void>;
}

export async function startRuntimeWatchers(
  root: string,
  config: E2EConfig,
  timeline: TimelineWriter
): Promise<WatchHandle> {
  const runtimeRoots = config.topology.servers
    .filter((node) => isBackendFamily(node.family))
    .map((node) => ({
      scope: node.id,
      root: join(root, ".state/runtime", node.id)
    }));

  const previous = new Map<string, WatchSnapshot>();
  for (const runtimeRoot of runtimeRoots) {
    previous.set(runtimeRoot.scope, await scanRoot(runtimeRoot.root, config.watch.include, config.watch.exclude));
    timeline.write({
      type: "watch.started",
      scope: runtimeRoot.scope,
      root: runtimeRoot.root
    });
  }

  const timer = setInterval(async () => {
    for (const runtimeRoot of runtimeRoots) {
      const before = previous.get(runtimeRoot.scope) ?? new Map<string, WatchEntry>();
      const after = await scanRoot(runtimeRoot.root, config.watch.include, config.watch.exclude);

      for (const [path, entry] of after) {
        const prior = before.get(path);
        if (!prior) {
          timeline.write({
            type: "watch.fs",
            scope: runtimeRoot.scope,
            op: "add",
            path,
            absPath: join(runtimeRoot.root, path),
            size: entry.size,
            mtimeMs: entry.mtimeMs
          });
          continue;
        }
        if (prior.mtimeMs !== entry.mtimeMs || prior.size !== entry.size) {
          timeline.write({
            type: "watch.fs",
            scope: runtimeRoot.scope,
            op: "change",
            path,
            absPath: join(runtimeRoot.root, path),
            size: entry.size,
            mtimeMs: entry.mtimeMs
          });
        }
      }

      for (const [path] of before) {
        if (!after.has(path)) {
          timeline.write({
            type: "watch.fs",
            scope: runtimeRoot.scope,
            op: "remove",
            path,
            absPath: join(runtimeRoot.root, path)
          });
        }
      }

      previous.set(runtimeRoot.scope, after);
    }
  }, 500);

  return {
    async stop(): Promise<void> {
      clearInterval(timer);
    }
  };
}
