import { existsSync, readFileSync } from "node:fs";
import type { E2EConfig } from "../types.ts";
import { runCommand } from "../lib/exec.ts";

function status(ok: boolean): string {
  return ok ? "OK" : "MISSING";
}

export async function doctor(config: E2EConfig): Promise<void> {
  const obsConfigPath = `${process.env.HOME ?? ""}/Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json`;
  const obsConfig = existsSync(obsConfigPath)
    ? JSON.parse(readFileSync(obsConfigPath, "utf8")) as { server_enabled?: boolean }
    : null;
  const checks: Array<[string, boolean]> = [
    ["Docker", runCommand(["docker", "--version"]).ok],
    ["Prism binary", existsSync(config.client.prism.appPath)],
    ["OBS app", existsSync("/Applications/OBS.app")],
    ["OBS websocket config", Boolean(obsConfig)],
    ["OBS websocket enabled", Boolean(obsConfig?.server_enabled)],
    ["FFmpeg", runCommand(["ffmpeg", "-version"]).ok],
    ["Plugin repo", existsSync("../plugin")],
    ["API repo", existsSync("../api")]
  ];

  for (const [label, ok] of checks) {
    console.log(`${status(ok)} ${label}`);
  }
}
