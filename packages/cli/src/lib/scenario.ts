import { join } from "node:path";
import type { ArtifactPaths } from "./artifacts.ts";
import { sendControlRequest } from "./control.ts";
import type { E2EConfig } from "../types.ts";

export async function runScenarios(
  config: E2EConfig,
  artifacts: ArtifactPaths,
  hooks: {
    onStepStarted?: (event: Record<string, unknown>) => void;
    onStepFinished?: (event: Record<string, unknown>) => void;
  } = {}
): Promise<void> {
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
        continue;
      }

      if (step.action === "waitForChat") {
        const response = await sendControlRequest("127.0.0.1", 44712, {
          id,
          action: "waitForChat",
          text: step.value,
          timeoutMs: step.timeoutMs ?? 10_000
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
      }
    }
  }
}
