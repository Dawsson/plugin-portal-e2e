import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { E2EConfig } from "../types.ts";
import { getArtifactPaths } from "../lib/artifacts.ts";
import { dockerComposeUp, writeComposeFile } from "../lib/docker.ts";
import { runScenarios } from "../lib/scenario.ts";
import { resolveReleaseSource } from "../lib/release.ts";
import { launchPrismClient } from "../lib/prism.ts";
import { waitForPort } from "../lib/wait.ts";
import { loadLocalState } from "../lib/state.ts";
import { ensurePrismInstance } from "../lib/prism-instance.ts";
import { runCommand } from "../lib/exec.ts";
import { sendControlRequest, waitForClientReady } from "../lib/control.ts";

export async function runPreset(root: string, config: E2EConfig, mode: "run" | "record"): Promise<void> {
  const artifacts = getArtifactPaths(root, config);
  const modBuild = runCommand(["./gradlew", ":packages:client-mod:build"], root);
  if (!modBuild.ok) {
    throw new Error(`Failed to build client mod\n${modBuild.stderr}`);
  }
  const release = resolveReleaseSource(root, config);
  const composePath = writeComposeFile(root, config, release);
  const state = await loadLocalState(root);
  const modJarPath = join(root, "packages/client-mod/build/libs/plugin-portal-e2e-client-0.1.0.jar");
  await ensurePrismInstance(root, config.client, state, modJarPath);
  const summary = {
    mode,
    projectName: config.projectName,
    apiTarget: config.apiTarget,
    releaseSource: config.releaseSource,
    client: config.client,
    topology: config.topology,
    watch: config.watch,
    scenarios: config.scenarios,
    composePath,
    resolvedRelease: release
  };

  await writeFile(join(artifacts.data, "resolved-run.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`Prepared run ${config.projectName}`);
  console.log(`Artifacts: ${artifacts.runRoot}`);
  console.log(`Compose file: ${composePath}`);
  console.log(`API target: ${config.apiTarget.baseUrl}`);
  console.log(`Release source: ${config.releaseSource.mode}`);
  console.log(`Scenarios: ${config.scenarios.map((scenario) => scenario.id).join(", ")}`);
  dockerComposeUp(composePath, root);
  await waitForPort("127.0.0.1", 25565, 180_000);
  launchPrismClient(config.client, "127.0.0.1:25565");
  await waitForPort("127.0.0.1", 44712, 180_000);
  const connectResponse = await sendControlRequest("127.0.0.1", 44712, {
    id: "connect",
    action: "connect",
    address: "127.0.0.1:25565"
  });
  if (!connectResponse.ok) {
    throw new Error(connectResponse.message);
  }
  await waitForClientReady("127.0.0.1", 44712, 180_000);
  await runScenarios(config, artifacts);
  console.log("Run completed.");
}
