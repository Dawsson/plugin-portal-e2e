import { runCommand } from "./exec.ts";

export function launchObs(appPath = "/Applications/OBS.app/Contents/MacOS/OBS"): void {
  const result = runCommand([appPath]);
  if (!result.ok) {
    throw new Error(`Failed to launch OBS\n${result.stderr}`);
  }
}
