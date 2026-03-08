import { join, resolve } from "node:path";
import type { E2EConfig } from "../types.ts";
import { ensureDir } from "./fs.ts";

export interface ArtifactPaths {
  runRoot: string;
  screenshots: string;
  logs: string;
  video: string;
  data: string;
}

export function getArtifactPaths(root: string, config: E2EConfig): ArtifactPaths {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = resolve(root, config.artifactsDir, `${config.projectName}-${stamp}`);
  const paths = {
    runRoot,
    screenshots: join(runRoot, "screenshots"),
    logs: join(runRoot, "logs"),
    video: join(runRoot, "video"),
    data: join(runRoot, "data")
  };
  Object.values(paths).forEach(ensureDir);
  return paths;
}
