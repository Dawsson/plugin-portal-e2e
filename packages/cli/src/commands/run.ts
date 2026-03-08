import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { E2EConfig } from "../types.ts";
import { getArtifactPaths } from "../lib/artifacts.ts";
import { writeComposeFile } from "../lib/docker.ts";

export async function runPreset(root: string, config: E2EConfig, mode: "run" | "record"): Promise<void> {
  const artifacts = getArtifactPaths(root, config);
  const composePath = writeComposeFile(root, config);
  const summary = {
    mode,
    projectName: config.projectName,
    apiTarget: config.apiTarget,
    releaseSource: config.releaseSource,
    client: config.client,
    topology: config.topology,
    watch: config.watch,
    scenarios: config.scenarios,
    composePath
  };

  await writeFile(join(artifacts.data, "resolved-run.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`Prepared run ${config.projectName}`);
  console.log(`Artifacts: ${artifacts.runRoot}`);
  console.log(`Compose file: ${composePath}`);
  console.log(`API target: ${config.apiTarget.baseUrl}`);
  console.log(`Release source: ${config.releaseSource.mode}`);
  console.log(`Scenarios: ${config.scenarios.map((scenario) => scenario.id).join(", ")}`);
  console.log("Run execution is scaffolded; container start, client control, and capture orchestration will build on this artifact layout.");
}
