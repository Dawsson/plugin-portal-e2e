import { spawn, spawnSync } from "node:child_process";

export interface CommandResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

export function runCommand(command: string[], cwd?: string): CommandResult {
  const [bin, ...args] = command;
  if (!bin) {
    throw new Error("runCommand requires a binary");
  }
  const result = spawnSync(bin, args, {
    cwd,
    encoding: "utf8"
  });
  return {
    ok: result.status === 0,
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

export function runDetached(command: string[], cwd?: string): number {
  const [bin, ...args] = command;
  if (!bin) {
    throw new Error("runDetached requires a binary");
  }
  const child = spawn(bin, args, {
    cwd,
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return child.pid ?? -1;
}

export interface StreamingCommand {
  pid: number;
  stop(signal?: NodeJS.Signals): Promise<void>;
}

export function runStreaming(
  command: string[],
  options: {
    cwd?: string;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  } = {}
): StreamingCommand {
  const [bin, ...args] = command;
  if (!bin) {
    throw new Error("runStreaming requires a binary");
  }

  const child = spawn(bin, args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout?.on("data", (chunk) => {
    options.onStdout?.(chunk.toString("utf8"));
  });
  child.stderr?.on("data", (chunk) => {
    options.onStderr?.(chunk.toString("utf8"));
  });

  return {
    pid: child.pid ?? -1,
    async stop(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
      if (child.killed || child.exitCode !== null) {
        return;
      }

      child.kill(signal);
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        setTimeout(() => {
          if (!child.killed && child.exitCode === null) {
            child.kill("SIGKILL");
          }
        }, 5_000);
      });
    }
  };
}
