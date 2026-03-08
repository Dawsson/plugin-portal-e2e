import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseDotEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (!key) continue;
    result[key] = value;
  }
  return result;
}

export function loadEnvFiles(root: string): void {
  const candidates = [".env", ".env.local"];
  for (const candidate of candidates) {
    const fullPath = resolve(root, candidate);
    if (!existsSync(fullPath)) continue;
    const values = parseDotEnvFile(readFileSync(fullPath, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

