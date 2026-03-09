import { copyFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { E2EConfig, ServerFamily } from "../types.ts";
import { getArtifactPaths } from "../lib/artifacts.ts";
import { dockerComposeDown, dockerComposeUp, waitForServiceLog, writeComposeFile } from "../lib/docker.ts";
import { runScenarios } from "../lib/scenario.ts";
import { resolveReleaseSource } from "../lib/release.ts";
import { closePrismClient, launchPrismClient } from "../lib/prism.ts";
import { waitForPort } from "../lib/wait.ts";
import { loadLocalState } from "../lib/state.ts";
import { ensurePrismInstance } from "../lib/prism-instance.ts";
import { runCommand } from "../lib/exec.ts";
import { sendControlRequest, waitForClientMenu, waitForClientReady } from "../lib/control.ts";
import { TimelineWriter } from "../lib/timeline.ts";
import { exportServiceLogs, startComposeLogCapture } from "../lib/logs.ts";
import { startRuntimeWatchers } from "../lib/watch.ts";
import { composeRunVideo, startRecording } from "../lib/recording.ts";
import { renderExplorerSnapshot } from "../lib/explorer.ts";
import { activateApp, frontmostAppName, scheduleFullscreenSpace } from "../lib/macos.ts";

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
        if ((entry.startsWith("PluginPortal") || entry.startsWith("[PP] ")) && entry.endsWith(".jar")) {
          rmSync(join(pluginsDir, entry), { force: true });
          continue;
        }

        const fullPath = join(pluginsDir, entry);
        if (entry === ".paper-remapped") {
          continue;
        }

        if (!entry.startsWith(".") && entry !== "PluginPortal" && existsSync(fullPath)) {
          rmSync(fullPath, { recursive: true, force: true });
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
  const timeline = new TimelineWriter(artifacts);
  timeline.write({
    type: "run.started",
    mode,
    runRoot: artifacts.runRoot
  });

  let composePath = "";
  let instanceDir = "";
  let composeLogs: { stop(): Promise<void> } | null = null;
  let runtimeWatchers: { stop(): Promise<void> } | null = null;
  let recording: { stop(): Promise<string | null> } | null = null;
  let finalVideoPath: string | null = null;
  let runError: Error | null = null;
  let previousFrontApp: string | null = null;
  const effectiveClientConfig = {
    ...config.client,
    macos: {
      ...config.client.macos,
      launchMode:
        process.platform === "darwin" &&
        config.recording.enabled &&
        config.recording.provider === "native"
          ? "foreground"
          : (config.client.macos?.launchMode ?? "background")
    }
  } satisfies E2EConfig["client"];

  try {
  const modBuild = runCommand(["./gradlew", ":packages:client-mod:build"], root);
  if (!modBuild.ok) {
    throw new Error(`Failed to build client mod\n${modBuild.stderr}`);
  }
  timeline.write({ type: "phase.completed", phase: "client-mod-build", ok: true });
  const release = resolveReleaseSource(root, config);
  timeline.write({ type: "phase.completed", phase: "release-resolve", kind: release.kind });
  composePath = writeComposeFile(root, config, release);
  const state = await loadLocalState(root);
  const modJarPath = join(root, "packages/client-mod/build/libs/plugin-portal-e2e-client-0.1.0.jar");
  instanceDir = await ensurePrismInstance(root, config.client, state, modJarPath);
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
  composeLogs = startComposeLogCapture(composePath, root, artifacts, timeline);
  runtimeWatchers = await startRuntimeWatchers(root, config, timeline);
  const primaryBackend = config.topology.servers.find((server) => isBackendFamily(server.family));
  if (!primaryBackend) {
    throw new Error("No backend server is configured in the current topology");
  }
  const hostPort = config.topology.hostPort ?? 25565;
  const connectAddress = `127.0.0.1:${hostPort}`;
  await waitForServiceLog(
    composePath,
    root,
    primaryBackend.id,
    /Done \([^)]+\)! For help, type "help"/,
    180_000
  );
  await waitForPort("127.0.0.1", hostPort, 180_000);
  previousFrontApp = frontmostAppName();
  launchPrismClient(effectiveClientConfig);
  await waitForPort("127.0.0.1", 44712, 180_000);
  await waitForClientMenu("127.0.0.1", 44712, 180_000);
  if (process.platform === "darwin" && effectiveClientConfig.macos?.launchMode === "fullscreen-space") {
    scheduleFullscreenSpace("java", previousFrontApp, 1);
    await Bun.sleep(4_000);
  }
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
    address: connectAddress
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
  recording = await startRecording(state, artifacts, config, timeline);
  if (process.platform === "darwin" && config.recording.enabled && config.recording.provider === "native" && previousFrontApp) {
    activateApp(previousFrontApp);
  }
  await runScenarios(config, artifacts, { root, composePath }, {
    onStepStarted: (event) => {
      timeline.write({
        type: "scenario.step.started",
        ...event
      });
    },
    onStepFinished: (event) => {
      timeline.write({
        type: event.action === "takeScreenshot" ? "artifact.screenshot" : "scenario.step.finished",
        ...event
      });
    }
  });
  console.log("Run completed.");
  timeline.write({ type: "run.finished", ok: true });
  } catch (error) {
    runError = error instanceof Error ? error : new Error(String(error));
    timeline.write({
      type: "run.finished",
      ok: false,
      error: runError.message
    });
  } finally {
    await runtimeWatchers?.stop();
    await composeLogs?.stop();
    const rawVideoPath = await recording?.stop() ?? null;
    if (composePath) {
      await exportServiceLogs(composePath, root, config, artifacts);
    }

    if (rawVideoPath) {
      finalVideoPath = composeRunVideo(rawVideoPath, artifacts, config);
    }

    if (instanceDir) {
      const clientLog = join(instanceDir, "minecraft/logs/latest.log");
      if (existsSync(clientLog)) {
        copyFileSync(clientLog, join(artifacts.logs, "client.latest.log"));
      }
    }

    await writeFile(
      join(artifacts.data, "run-summary.json"),
      `${JSON.stringify({
        startedAt: timeline.startedIso(),
        finishedAt: new Date().toISOString(),
        ok: runError === null,
        composePath,
        instanceDir,
        rawVideoPath,
        finalVideoPath,
        artifacts
      }, null, 2)}\n`,
      "utf8"
    );

    renderExplorerSnapshot(artifacts);

    if (config.cleanup.closeClient) {
      try {
        await sendControlRequest("127.0.0.1", 44712, {
          id: "quit-client",
          action: "quitClient"
        });
      } catch {
        closePrismClient(effectiveClientConfig);
      }
    }

    if (composePath && config.cleanup.stopContainers) {
      dockerComposeDown(composePath, root, config.cleanup.wipeVolumes);
    }

    await timeline.close();
  }

  if (runError) {
    throw runError;
  }
}
