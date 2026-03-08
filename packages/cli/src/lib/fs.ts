import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function ensureParent(path: string): void {
  ensureDir(dirname(path));
}

export function resolveFromRoot(root: string, candidate: string): string {
  return resolve(root, candidate);
}

