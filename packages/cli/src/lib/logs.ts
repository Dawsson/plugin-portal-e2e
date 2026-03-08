import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { E2EConfig } from "../types.ts";
import type { ArtifactPaths } from "./artifacts.ts";
import { ensureDir } from "./fs.ts";
import { runCommand, runStreaming, type StreamingCommand } from "./exec.ts";
import type { TimelineWriter } from "./timeline.ts";

function splitLines(buffer: string): string[] {
  return buffer.split(/\r?\n/).filter(Boolean);
}

export interface ComposeLogHandle {
  stop(): Promise<void>;
}

export function startComposeLogCapture(
  composePath: string,
  root: string,
  artifacts: ArtifactPaths,
  timeline: TimelineWriter
): ComposeLogHandle {
  const composeLogPath = join(artifacts.logs, "compose.log");
  const stream = createWriteStream(composeLogPath, { flags: "a" });
  let stdoutBuffer = "";
  let stderrBuffer = "";

  const writeChunk = (bufferRef: "stdout" | "stderr", chunk: string): void => {
    if (bufferRef === "stdout") {
      stdoutBuffer += chunk;
    } else {
      stderrBuffer += chunk;
    }
    stream.write(chunk);
    const source = bufferRef === "stdout" ? stdoutBuffer : stderrBuffer;
    const parts = source.split(/\r?\n/);
    const remainder = parts.pop() ?? "";
    for (const line of parts) {
      const match = line.match(/^([^|]+)\|\s?(.*)$/);
      timeline.write({
        type: "service.log",
        service: match?.[1]?.trim() ?? "compose",
        line: match?.[2] ?? line
      });
    }
    if (bufferRef === "stdout") {
      stdoutBuffer = remainder;
    } else {
      stderrBuffer = remainder;
    }
  };

  const process = runStreaming(
    ["docker", "compose", "-f", composePath, "logs", "-f", "--no-color", "--timestamps"],
    {
      cwd: root,
      onStdout: (chunk) => writeChunk("stdout", chunk),
      onStderr: (chunk) => writeChunk("stderr", chunk)
    }
  );

  return {
    async stop(): Promise<void> {
      await process.stop();
      stream.end();
    }
  };
}

export async function exportServiceLogs(
  composePath: string,
  root: string,
  config: E2EConfig,
  artifacts: ArtifactPaths
): Promise<void> {
  const servicesRoot = join(artifacts.logs, "services");
  ensureDir(servicesRoot);
  await Bun.write(join(servicesRoot, ".keep"), "");
  for (const node of config.topology.servers) {
    const result = runCommand(
      ["docker", "compose", "-f", composePath, "logs", "--no-color", node.id],
      root
    );
    await writeFile(join(servicesRoot, `${node.id}.log`), result.stdout || result.stderr || "", "utf8");
  }
}
