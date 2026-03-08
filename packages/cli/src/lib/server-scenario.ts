import type { ArtifactPaths } from "./artifacts.ts";
import type { E2EConfig } from "../types.ts";
import type { TimelineWriter } from "./timeline.ts";
import { runRconCommand } from "./rcon.ts";
import { waitForServiceLog } from "./docker.ts";

export async function runServerScenarios(
  root: string,
  composePath: string,
  config: E2EConfig,
  artifacts: ArtifactPaths,
  timeline: TimelineWriter
): Promise<void> {
  let lastOutput = "";

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
        lastOutput = runRconCommand(composePath, root, step.service ?? "paper-main", step.command ?? "");
        timeline.write({
          type: "scenario.step.finished",
          scenario: scenario.id,
          stepIndex: index,
          action: step.action,
          ok: true,
          service: step.service,
          command: step.command,
          output: lastOutput
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
    }
  }
}
