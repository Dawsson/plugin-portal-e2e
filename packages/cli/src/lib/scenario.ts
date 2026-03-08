import { join } from "node:path";
import type { ArtifactPaths } from "./artifacts.ts";
import { sendControlRequest } from "./control.ts";
import type { E2EConfig } from "../types.ts";

export async function runScenarios(config: E2EConfig, artifacts: ArtifactPaths): Promise<void> {
  for (const scenario of config.scenarios) {
    for (const [index, step] of scenario.steps.entries()) {
      const id = `${scenario.id}-${index}`;
      if (step.action === "runCommand") {
        await sendControlRequest("127.0.0.1", 44712, {
          id,
          action: "runCommand",
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
        continue;
      }

      if (step.action === "delay") {
        await Bun.sleep(step.delayMs ?? 0);
      }
    }
  }
}
