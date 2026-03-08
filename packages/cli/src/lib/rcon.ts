import { runCommand } from "./exec.ts";

export function runRconCommand(
  composePath: string,
  root: string,
  service: string,
  command: string
): string {
  const result = runCommand(
    [
      "docker",
      "compose",
      "-f",
      composePath,
      "exec",
      "-T",
      service,
      "rcon-cli",
      "--password",
      "plugin-portal-e2e",
      command
    ],
    root
  );

  if (!result.ok) {
    throw new Error(`RCON command failed for ${service}: ${command}\n${result.stderr}`);
  }

  return (result.stdout || result.stderr || "").trim();
}
