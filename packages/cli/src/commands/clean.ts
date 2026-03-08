import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { E2EConfig } from "../types.ts";

export async function clean(root: string, config: E2EConfig): Promise<void> {
  const paths = [
    resolve(root, ".state/generated"),
    resolve(root, ".state/runtime")
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
      console.log(`Removed ${path}`);
    }
  }

  console.log(`Artifacts retained at ${resolve(root, config.artifactsDir)}`);
}
