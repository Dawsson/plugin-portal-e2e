import { existsSync } from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ArtifactPaths } from "./artifacts.ts";
import { sendControlRequest } from "./control.ts";
import { waitForServiceLog } from "./docker.ts";
import { runRconCommand } from "./rcon.ts";
import type { E2EConfig } from "../types.ts";

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

export async function runScenarios(
  config: E2EConfig,
  artifacts: ArtifactPaths,
  context: {
    root?: string;
    composePath?: string;
  } = {},
  hooks: {
    onStepStarted?: (event: Record<string, unknown>) => void;
    onStepFinished?: (event: Record<string, unknown>) => void;
  } = {}
): Promise<void> {
  let lastServerOutput = "";
  let lastChatSequence = 0;
  const serverTranscriptPath = join(artifacts.data, "server-commands.jsonl");

  if (context.root && context.composePath) {
    await writeFile(serverTranscriptPath, "", "utf8");
  }

  for (const scenario of config.scenarios) {
    for (const [index, step] of scenario.steps.entries()) {
      const id = `${scenario.id}-${index}`;
      hooks.onStepStarted?.({
        scenario: scenario.id,
        stepIndex: index,
        action: step.action
      });

      if (step.action === "runCommand") {
        const response = await sendControlRequest("127.0.0.1", 44712, {
          id,
          action: "runCommand",
          command: step.value
        });
        hooks.onStepFinished?.({
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: response.ok,
          command: step.value
        });
        lastChatSequence = Number(response.result?.afterSequence ?? lastChatSequence);
        continue;
      }

      if (step.action === "waitForChat") {
        const response = await sendControlRequest("127.0.0.1", 44712, {
          id,
          action: "waitForChat",
          text: step.value,
          timeoutMs: step.timeoutMs ?? 10_000,
          afterSequence: lastChatSequence
        });
        if (!response.ok) {
          throw new Error(response.message);
        }
        hooks.onStepFinished?.({
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: response.ok,
          text: response.result?.text
        });
        lastChatSequence = Number(response.result?.sequence ?? lastChatSequence);
        continue;
      }

      if (step.action === "takeScreenshot") {
        const response = await sendControlRequest("127.0.0.1", 44712, {
          id,
          action: "takeScreenshot",
          path: artifacts.screenshots,
          name: step.name ?? `${scenario.id}-${index}`,
          delayMs: step.delayMs,
          openChat: step.openChat
        });
        if (!response.ok) {
          throw new Error(response.message);
        }
        hooks.onStepFinished?.({
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: response.ok,
          path: response.result?.path
        });
        continue;
      }

      if (step.action === "clickChat") {
        const response = await sendControlRequest("127.0.0.1", 44712, {
          id,
          action: "clickChat",
          text: step.text
        });
        if (!response.ok) {
          throw new Error(response.message);
        }
        hooks.onStepFinished?.({
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: response.ok,
          text: step.text
        });
        lastChatSequence = Number(response.result?.afterSequence ?? lastChatSequence);
        continue;
      }

      if (step.action === "delay") {
        await Bun.sleep(step.delayMs ?? 0);
        hooks.onStepFinished?.({
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          delayMs: step.delayMs ?? 0
        });
        continue;
      }

      if (step.action === "runServerCommand") {
        if (!context.root || !context.composePath) {
          throw new Error("runServerCommand requires a server-backed run context");
        }
        lastServerOutput = runRconCommand(context.composePath, context.root, step.service ?? "paper-main", step.command ?? "");
        await appendFile(
          serverTranscriptPath,
          `${JSON.stringify({
            scenario: scenario.id,
            stepIndex: index,
            service: step.service ?? "paper-main",
            command: step.command ?? "",
            output: lastServerOutput
          })}\n`,
          "utf8"
        );
        hooks.onStepFinished?.({
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service: step.service,
          command: step.command,
          output: lastServerOutput
        });
        continue;
      }

      if (step.action === "assertOutputContains") {
        if (!lastServerOutput.toLowerCase().includes((step.value ?? "").toLowerCase())) {
          throw new Error(`Expected output to contain "${step.value}", got:\n${lastServerOutput}`);
        }
        hooks.onStepFinished?.({
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          text: step.value
        });
        continue;
      }

      if (step.action === "waitForServiceLog") {
        if (!context.root || !context.composePath) {
          throw new Error("waitForServiceLog requires a server-backed run context");
        }
        await waitForServiceLog(
          context.composePath,
          context.root,
          step.service ?? "paper-main",
          new RegExp(step.pattern ?? ""),
          step.timeoutMs ?? 30_000
        );
        hooks.onStepFinished?.({
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service: step.service,
          pattern: step.pattern
        });
        continue;
      }

      if (step.action === "waitForFile") {
        if (!context.root) {
          throw new Error("waitForFile requires a server-backed run context");
        }
        const matchedPath = await waitForRuntimeFile(
          context.root,
          step.service ?? "paper-main",
          step.pattern ?? "",
          step.timeoutMs ?? 60_000
        );
        hooks.onStepFinished?.({
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
        if (!context.root) {
          throw new Error("waitForFileChange requires a server-backed run context");
        }
        const matchedPath = await waitForRuntimeFileChange(
          context.root,
          step.service ?? "paper-main",
          step.pattern ?? "",
          step.timeoutMs ?? 60_000
        );
        hooks.onStepFinished?.({
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

      if (step.action === "assertFileExists") {
        if (!context.root) {
          throw new Error("assertFileExists requires a server-backed run context");
        }
        const fullPath = join(runtimeRootForService(context.root, step.service ?? "paper-main"), step.path ?? "");
        if (!existsSync(fullPath)) {
          throw new Error(`Expected file to exist: ${fullPath}`);
        }
        hooks.onStepFinished?.({
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service: step.service,
          path: step.path
        });
      }
    }
  }
}
