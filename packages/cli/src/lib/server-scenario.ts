import { appendFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ArtifactPaths } from "./artifacts.ts";
import type { E2EConfig } from "../types.ts";
import type { TimelineWriter } from "./timeline.ts";
import { runConsoleCommand, runRconCommand } from "./rcon.ts";
import { dockerComposeRestart, waitForServiceLog } from "./docker.ts";

function runtimeRootForService(root: string, service: string): string {
  return resolve(root, ".state/runtime", service);
}

async function waitForRuntimeFile(root: string, service: string, pattern: string, timeoutMs: number): Promise<string> {
  const runtimeRoot = runtimeRootForService(root, service);
  const glob = new Bun.Glob(pattern);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for await (const relPath of glob.scan({ cwd: runtimeRoot, absolute: false, dot: true, onlyFiles: false })) {
      return relPath;
    }
    await Bun.sleep(500);
  }

  throw new Error(`Timed out waiting for ${service}:${pattern}`);
}

async function waitForRuntimeFileChange(root: string, service: string, pattern: string, timeoutMs: number): Promise<string> {
  const runtimeRoot = runtimeRootForService(root, service);
  const glob = new Bun.Glob(pattern);
  const baseline = new Map<string, number>();

  for await (const relPath of glob.scan({ cwd: runtimeRoot, absolute: false, dot: true, onlyFiles: false })) {
    const absPath = join(runtimeRoot, relPath);
    if (existsSync(absPath)) {
      baseline.set(relPath, Bun.file(absPath).lastModified);
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for await (const relPath of glob.scan({ cwd: runtimeRoot, absolute: false, dot: true, onlyFiles: false })) {
      const absPath = join(runtimeRoot, relPath);
      if (!existsSync(absPath)) {
        continue;
      }
      const mtimeMs = Bun.file(absPath).lastModified;
      const prior = baseline.get(relPath);
      if (prior === undefined || mtimeMs > prior) {
        return relPath;
      }
    }
    await Bun.sleep(500);
  }

  throw new Error(`Timed out waiting for file change ${service}:${pattern}`);
}

async function waitForRuntimeFileContains(
  root: string,
  service: string,
  relPath: string,
  value: string,
  timeoutMs: number
): Promise<void> {
  const fullPath = join(runtimeRootForService(root, service), relPath);
  const needle = value.toLowerCase();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (existsSync(fullPath)) {
      const text = readFileSync(fullPath, "utf8");
      if (text.toLowerCase().includes(needle)) {
        return;
      }
    }
    await Bun.sleep(500);
  }

  throw new Error(`Timed out waiting for ${service}:${relPath} to contain "${value}"`);
}

export async function runServerScenarios(
  root: string,
  composePath: string,
  config: E2EConfig,
  artifacts: ArtifactPaths,
  timeline: TimelineWriter
): Promise<void> {
  let lastOutput = "";
  const transcriptPath = join(artifacts.data, "server-commands.jsonl");
  await writeFile(transcriptPath, "", "utf8");

  for (const scenario of config.scenarios) {
    for (const [index, step] of scenario.steps.entries()) {
      timeline.write({
        type: "scenario.step.started",
        scenario: scenario.id,
        stepIndex: index,
        action: step.action
      });

      if (step.action === "delay") {
        await Bun.sleep(step.delayMs ?? 0);
        timeline.write({
          type: "scenario.step.finished",
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          delayMs: step.delayMs ?? 0
        });
        continue;
      }

      if (step.action === "runServerCommand") {
        lastOutput = step.console
          ? runConsoleCommand(composePath, root, step.service ?? "paper-main", step.command ?? "")
          : runRconCommand(composePath, root, step.service ?? "paper-main", step.command ?? "");
        await appendFile(
          transcriptPath,
          `${JSON.stringify({
            scenario: scenario.id,
            stepIndex: index,
            service: step.service ?? "paper-main",
            command: step.command ?? "",
            console: step.console ?? false,
            output: lastOutput
          })}\n`,
          "utf8"
        );
        timeline.write({
          type: "scenario.step.finished",
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service: step.service,
          command: step.command,
          console: step.console ?? false,
          output: lastOutput
        });
        continue;
      }

      if (step.action === "waitForFile") {
        const matchedPath = await waitForRuntimeFile(
          root,
          step.service ?? "paper-main",
          step.pattern ?? "",
          step.timeoutMs ?? 60_000
        );
        timeline.write({
          type: "scenario.step.finished",
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service: step.service,
          pattern: step.pattern,
          path: matchedPath
        });
        continue;
      }

      if (step.action === "waitForFileChange") {
        const matchedPath = await waitForRuntimeFileChange(
          root,
          step.service ?? "paper-main",
          step.pattern ?? "",
          step.timeoutMs ?? 60_000
        );
        timeline.write({
          type: "scenario.step.finished",
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service: step.service,
          pattern: step.pattern,
          path: matchedPath
        });
        continue;
      }

      if (step.action === "waitForFileContains") {
        await waitForRuntimeFileContains(
          root,
          step.service ?? "paper-main",
          step.path ?? "",
          step.value ?? "",
          step.timeoutMs ?? 60_000
        );
        timeline.write({
          type: "scenario.step.finished",
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service: step.service,
          path: step.path,
          value: step.value
        });
        continue;
      }

      if (step.action === "assertFileExists") {
        const fullPath = join(runtimeRootForService(root, step.service ?? "paper-main"), step.path ?? "");
        if (!existsSync(fullPath)) {
          throw new Error(`Expected file to exist: ${fullPath}`);
        }
        timeline.write({
          type: "scenario.step.finished",
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service: step.service,
          path: step.path
        });
        continue;
      }

      if (step.action === "assertFileContains") {
        const fullPath = join(runtimeRootForService(root, step.service ?? "paper-main"), step.path ?? "");
        if (!existsSync(fullPath)) {
          throw new Error(`Expected file to exist: ${fullPath}`);
        }
        const text = readFileSync(fullPath, "utf8");
        if (!text.toLowerCase().includes((step.value ?? "").toLowerCase())) {
          throw new Error(`Expected ${fullPath} to contain "${step.value}"`);
        }
        timeline.write({
          type: "scenario.step.finished",
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service: step.service,
          path: step.path,
          value: step.value
        });
        continue;
      }

      if (step.action === "assertOutputContains") {
        if (!lastOutput.toLowerCase().includes((step.value ?? "").toLowerCase())) {
          throw new Error(`Expected output to contain "${step.value}", got:\n${lastOutput}`);
        }
        timeline.write({
          type: "scenario.step.finished",
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          text: step.value
        });
        continue;
      }

      if (step.action === "waitForServiceLog") {
        await waitForServiceLog(
          composePath,
          root,
          step.service ?? "paper-main",
          new RegExp(step.pattern ?? ""),
          step.timeoutMs ?? 30_000
        );
        timeline.write({
          type: "scenario.step.finished",
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service: step.service,
          pattern: step.pattern
        });
        continue;
      }

      if (step.action === "restartService") {
        const service = step.service ?? "paper-main";
        dockerComposeRestart(composePath, root, service);
        await waitForServiceLog(
          composePath,
          root,
          service,
          /Done \([^)]+\)! For help, type "help"/,
          step.timeoutMs ?? 180_000
        );
        await waitForServiceLog(
          composePath,
          root,
          service,
          /RCON running on 0\.0\.0\.0:25575/,
          30_000
        );
        timeline.write({
          type: "scenario.step.finished",
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service
        });
        continue;
      }

      throw new Error(`Unsupported server-only scenario action: ${step.action}`);
    }
  }
}
