import { existsSync, readdirSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { E2EConfig, ServerFamily } from "../types.ts";
import { getArtifactPaths } from "../lib/artifacts.ts";
import { dockerComposeDown, dockerComposeUp, waitForServiceLog, writeComposeFile } from "../lib/docker.ts";
import { resolveReleaseSource } from "../lib/release.ts";
import { runCommand } from "../lib/exec.ts";
import { TimelineWriter } from "../lib/timeline.ts";
import { exportServiceLogs, startComposeLogCapture } from "../lib/logs.ts";
import { startRuntimeWatchers } from "../lib/watch.ts";
import { runServerScenarios } from "../lib/server-scenario.ts";
import { buildMatrixConfigs, type MatrixSelection } from "../lib/matrix.ts";
import { renderExplorerSnapshot } from "../lib/explorer.ts";
import { waitForPort } from "../lib/wait.ts";

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

async function verifySingle(root: string, config: E2EConfig): Promise<{ projectName: string; ok: boolean; runRoot: string; error?: string }> {
  const artifacts = getArtifactPaths(root, config);
  const timeline = new TimelineWriter(artifacts);
  let composePath = "";
  let composeLogs: { stop(): Promise<void> } | null = null;
  let runtimeWatchers: { stop(): Promise<void> } | null = null;
  let error: Error | null = null;

  try {
    const release = resolveReleaseSource(root, config);
    composePath = writeComposeFile(root, config, release);
    await writeFile(join(artifacts.data, "resolved-run.json"), `${JSON.stringify({ config, composePath, release }, null, 2)}\n`, "utf8");
    cleanServerRuntime(root, config);
    dockerComposeUp(composePath, root);
    composeLogs = startComposeLogCapture(composePath, root, artifacts, timeline);
    runtimeWatchers = await startRuntimeWatchers(root, config, timeline);

    const primaryBackend = config.topology.servers.find((server) => isBackendFamily(server.family));
    if (!primaryBackend) {
      throw new Error("No backend server is configured");
    }

    await waitForServiceLog(composePath, root, primaryBackend.id, /Done \([^)]+\)! For help, type "help"/, 180_000);
    await waitForPort("127.0.0.1", 25565, 30_000);
    await runServerScenarios(root, composePath, config, artifacts, timeline);
    timeline.write({ type: "run.finished", ok: true });
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error(String(caught));
    timeline.write({ type: "run.finished", ok: false, error: error.message });
  } finally {
    await runtimeWatchers?.stop();
    await composeLogs?.stop();
    if (composePath) {
      await exportServiceLogs(composePath, root, config, artifacts);
      dockerComposeDown(composePath, root, config.cleanup.wipeVolumes);
    }
    renderExplorerSnapshot(artifacts);
    await writeFile(
      join(artifacts.data, "run-summary.json"),
      `${JSON.stringify({
        projectName: config.projectName,
        ok: error === null,
        composePath,
        runRoot: artifacts.runRoot,
        error: error?.message
      }, null, 2)}\n`,
      "utf8"
    );
    await timeline.close();
  }

  return {
    projectName: config.projectName,
    ok: error === null,
    runRoot: artifacts.runRoot,
    error: error?.message
  };
}

export async function verifyConfig(root: string, config: E2EConfig): Promise<void> {
  const result = await verifySingle(root, config);
  console.log(`Verification run: ${result.runRoot}`);
  if (!result.ok) {
    throw new Error(result.error ?? `Verification failed for ${config.projectName}`);
  }
}

export async function verifyMatrix(root: string, baseConfig: E2EConfig, selection: MatrixSelection = {}): Promise<void> {
  const matrix = buildMatrixConfigs(baseConfig, selection);
  if (matrix.length === 0) {
    throw new Error("No matrix targets matched the provided selection");
  }
  const results = [];
  for (const config of matrix) {
    console.log(`Verifying ${config.projectName}`);
    const result = await verifySingle(root, config);
    results.push(result);
  }

  const summaryPath = join(root, baseConfig.artifactsDir, `matrix-summary-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(summaryPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(`Matrix summary: ${summaryPath}`);

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    throw new Error(`Matrix verification failed for ${failures.map((failure) => failure.projectName).join(", ")}`);
  }
}
