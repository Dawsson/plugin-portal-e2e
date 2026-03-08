import { existsSync, readdirSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { E2EConfig, ServerFamily } from "../types.ts";
import { getArtifactPaths } from "../lib/artifacts.ts";
import { dockerComposeUp, waitForServiceLog, writeComposeFile } from "../lib/docker.ts";
import { runScenarios } from "../lib/scenario.ts";
import { resolveReleaseSource } from "../lib/release.ts";
import { launchPrismClient } from "../lib/prism.ts";
import { waitForPort } from "../lib/wait.ts";
import { loadLocalState } from "../lib/state.ts";
import { ensurePrismInstance } from "../lib/prism-instance.ts";
import { runCommand } from "../lib/exec.ts";
import { sendControlRequest, waitForClientMenu, waitForClientReady } from "../lib/control.ts";

function isBackendFamily(family: string): family is ServerFamily {
  return family === "paper" || family === "purpur" || family === "pufferfish" || family === "spigot";
}

function cleanServerRuntime(root: string, config: E2EConfig): void {
  for (const node of config.topology.servers) {
    if (!isBackendFamily(node.family)) {
      continue;
    }

    const runtimeDir = resolve(root, ".state/runtime", node.id);
    const pluginsDir = join(runtimeDir, "plugins");
    const remappedDir = join(pluginsDir, ".paper-remapped");

    if (existsSync(pluginsDir)) {
      for (const entry of readdirSync(pluginsDir)) {
        if (entry.startsWith("PluginPortal") && entry.endsWith(".jar")) {
          rmSync(join(pluginsDir, entry), { force: true });
        }
      }
    }

    if (existsSync(remappedDir)) {
      rmSync(remappedDir, { recursive: true, force: true });
    }
  }
}

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
  cleanServerRuntime(root, config);
  dockerComposeUp(composePath, root);
  const primaryBackend = config.topology.servers.find((server) => isBackendFamily(server.family));
  if (!primaryBackend) {
    throw new Error("No backend server is configured in the current topology");
  }
  await waitForServiceLog(
    composePath,
    root,
    primaryBackend.id,
    /Done \([^)]+\)! For help, type "help"/,
    180_000
  );
  await waitForPort("127.0.0.1", 25565, 180_000);
  launchPrismClient(config.client);
  await waitForPort("127.0.0.1", 44712, 180_000);
  await waitForClientMenu("127.0.0.1", 44712, 180_000);
  const dismissResponse = await sendControlRequest("127.0.0.1", 44712, {
    id: "dismiss-onboarding",
    action: "dismissOnboarding"
  });
  if (!dismissResponse.ok) {
    throw new Error(dismissResponse.message);
  }
  await Bun.sleep(1_500);
  const connectResponse = await sendControlRequest("127.0.0.1", 44712, {
    id: "connect",
    action: "connect",
    address: "127.0.0.1:25565"
  });
  if (!connectResponse.ok) {
    throw new Error(connectResponse.message);
  }
  await waitForClientReady("127.0.0.1", 44712, 180_000);
  const resumeResponse = await sendControlRequest("127.0.0.1", 44712, {
    id: "resume-game",
    action: "resumeGame"
  });
  if (!resumeResponse.ok) {
    throw new Error(resumeResponse.message);
  }
  await runScenarios(config, artifacts);
  console.log("Run completed.");
}
