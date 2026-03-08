import { runCommand, runDetached } from "./exec.ts";

function isMacOS(): boolean {
  return process.platform === "darwin";
}

export function resolveAppBundlePath(appPath: string): string | null {
  if (appPath.endsWith(".app")) {
    return appPath;
  }

  const marker = "/Contents/MacOS/";
  const index = appPath.indexOf(marker);
  if (index === -1) {
    return null;
  }

  return appPath.slice(0, index);
}

function quotedAppleScript(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

export function frontmostAppName(): string | null {
  if (!isMacOS()) {
    return null;
  }

  const result = runCommand([
    "osascript",
    "-e",
    'tell application "System Events" to get name of first application process whose frontmost is true'
  ]);

  return result.ok ? result.stdout.trim() || null : null;
}

export function activateApp(name: string): void {
  if (!isMacOS()) {
    return;
  }

  runCommand([
    "osascript",
    "-e",
    `tell application "${quotedAppleScript(name)}" to activate`
  ]);
}

export function launchMacAppBundle(appBundle: string, args: string[], background: boolean): number {
  const command = ["open", "-na", appBundle];
  if (background) {
    command.splice(1, 0, "-g");
  }
  if (args.length > 0) {
    command.push("--args", ...args);
  }
  return runDetached(command);
}

export function scheduleFullscreenSpace(
  appName: string,
  restoreAppName?: string | null,
  delaySeconds = 2
): void {
  if (!isMacOS()) {
    return;
  }

  const script = `
delay ${delaySeconds}
tell application "${quotedAppleScript(appName)}" to activate
delay 2
tell application "System Events"
  keystroke "f" using {control down, command down}
end tell
delay 1
${restoreAppName ? `tell application "${quotedAppleScript(restoreAppName)}" to activate` : ""}
`;

  runDetached(["osascript", "-e", script]);
}

interface MacWindowCandidate {
  id: number;
  owner: string;
  name: string;
  layer: number;
  onscreen: boolean;
  area: number;
}

function listMinecraftWindowCandidates(): MacWindowCandidate[] {
  if (!isMacOS()) {
    return [];
  }

  const script = `
import CoreGraphics
import Foundation
let info = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
for window in info {
  let owner = String(describing: window[kCGWindowOwnerName as String] ?? "")
  let name = String(describing: window[kCGWindowName as String] ?? "")
  if owner.localizedCaseInsensitiveContains("java") || owner.localizedCaseInsensitiveContains("minecraft") || name.localizedCaseInsensitiveContains("minecraft") {
    let id = (window[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0
    let layer = (window[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
    let onscreen = (window[kCGWindowIsOnscreen as String] as? NSNumber)?.intValue ?? 0
    let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let width = (bounds["Width"] as? NSNumber)?.doubleValue ?? 0
    let height = (bounds["Height"] as? NSNumber)?.doubleValue ?? 0
    let area = Int(width * height)
    print("\\(id)\\t\\(owner)\\t\\(name)\\t\\(layer)\\t\\(onscreen)\\t\\(area)")
  }
}
`;

  const result = runCommand(["swift", "-e", script]);
  if (!result.ok) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .map((parts) => ({
      id: Number(parts[0] ?? 0),
      owner: parts[1] ?? "",
      name: parts[2] ?? "",
      layer: Number(parts[3] ?? 0),
      onscreen: parts[4] === "1",
      area: Number(parts[5] ?? 0)
    }))
    .filter((candidate) => Number.isFinite(candidate.id) && candidate.id > 0);
}

function scoreWindowCandidate(candidate: MacWindowCandidate): number {
  let score = 0;
  if (candidate.onscreen) {
    score += 100;
  }
  if (candidate.layer === 0) {
    score += 20;
  }
  if (candidate.owner.toLowerCase().includes("java")) {
    score += 20;
  }
  if (candidate.name.toLowerCase().includes("minecraft")) {
    score += 40;
  }
  score += Math.min(candidate.area / 10_000, 50);
  return score;
}

export function findMinecraftWindowId(): number | null {
  const candidates = listMinecraftWindowCandidates();
  const best = candidates
    .sort((a, b) => scoreWindowCandidate(b) - scoreWindowCandidate(a))
    .at(0);
  return best?.id ?? null;
}

export async function waitForMinecraftWindowId(timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let lastCandidates: MacWindowCandidate[] = [];
  while (Date.now() < deadline) {
    const candidates = listMinecraftWindowCandidates();
    lastCandidates = candidates;
    const windowId = candidates
      .sort((a, b) => scoreWindowCandidate(b) - scoreWindowCandidate(a))
      .at(0)?.id;
    if (windowId) {
      return windowId;
    }
    await Bun.sleep(500);
  }

  const detail = lastCandidates.length
    ? lastCandidates
        .map((candidate) =>
          `id=${candidate.id} owner=${candidate.owner} name=${candidate.name || "(blank)"} onscreen=${candidate.onscreen} layer=${candidate.layer} area=${candidate.area}`
        )
        .join("; ")
    : "no matching java/minecraft windows";
  throw new Error(`Timed out waiting for the Minecraft window (${detail})`);
}
