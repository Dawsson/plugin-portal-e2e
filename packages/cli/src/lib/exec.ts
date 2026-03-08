import { spawnSync } from "node:child_process";

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
