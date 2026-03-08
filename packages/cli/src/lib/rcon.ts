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

export function runConsoleCommand(
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
      "--user",
      "1000:1000",
      service,
      "mc-send-to-console",
      command
    ],
    root
  );

  if (!result.ok) {
    throw new Error(`Console command failed for ${service}: ${command}\n${result.stderr}`);
  }

  return (result.stdout || result.stderr || "").trim();
}
